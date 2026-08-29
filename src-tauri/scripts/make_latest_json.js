// Builds the latest.json updater manifest from a release's .sig files.
//
// Hand-writing it is how you ship a stale or mismatched signature, which
// silently breaks auto-update for every installed copy — and the fix can only
// reach people who reinstall by hand. So the manifest is generated, and every
// signature is FULLY VERIFIED first: parsed, matched to the key the shipped
// binaries actually trust, and checked against the very bytes being published.
// A signature that merely *looks* like one is worth nothing — the classic
// release-day slip is a .sig left over from the previous version, and that
// decodes perfectly. No deps; Node's crypto has Ed25519 and BLAKE2b.
// Run `node scripts/make_latest_json.js --help`.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = "findteemo/Poltergeist";
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };

const b64 = (s) => Buffer.from(s, "base64");
// Ed25519 raw key -> the SPKI DER blob that node's crypto insists on.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const edKey = (raw32) =>
  crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw32]), format: "der", type: "spki" });

// A minisign key/signature line is base64 of: alg(2) | key_id(8) | payload
// (32 bytes for a public key, 64 for a signature).
function parseLine(line, payloadLen, what) {
  const buf = b64(line);
  if (buf.length !== 10 + payloadLen) throw new Error(`${what}: expected ${10 + payloadLen} bytes, got ${buf.length}`);
  return { alg: buf.slice(0, 2).toString("latin1"), keyId: buf.slice(2, 10).toString("hex"), payload: buf.slice(10) };
}

function parsePub(pubB64) {
  const lines = b64(pubB64).toString("utf8").trim().split("\n");
  if (lines.length < 2) throw new Error("pubkey is not a minisign public key");
  return parseLine(lines[1], 32, "pubkey");
}

// Verify `sigPath` against the artifact sitting next to it, using `pub`.
// Returns the .sig's base64 text (what goes in the manifest), or throws.
function verifySig(sigPath, pub) {
  const file = sigPath.replace(/\.sig$/, "");
  if (file === sigPath) throw new Error(`${sigPath}: expected a path ending in .sig`);
  if (!fs.existsSync(file))
    throw new Error(`${file} not found — signatures are verified against the artifact being published, so it has to sit next to its .sig`);

  const raw = fs.readFileSync(sigPath, "utf8").trim();
  const text = b64(raw).toString("utf8");
  if (!text.startsWith("untrusted comment:")) throw new Error(`${sigPath} is not a minisign signature`);
  const lines = text.split("\n");
  const sig = parseLine(lines[1], 64, sigPath);

  if (sig.keyId !== pub.keyId)
    throw new Error(`${sigPath} was signed with key ${sig.keyId}, but this build trusts ${pub.keyId} — every installed copy would reject it. Sign with the matching private key, or pass --pubkey if this is a key-rotation release.`);

  const key = edKey(pub.payload);
  const data = fs.readFileSync(file);
  // "ED" = prehashed (what tauri emits); "Ed" = legacy, signs the file directly
  const msg = sig.alg === "ED" ? crypto.createHash("blake2b512").update(data).digest() : data;
  if (!crypto.verify(null, msg, key, sig.payload))
    throw new Error(`${sigPath} does not verify against ${path.basename(file)} — it is stale, or it belongs to a different file. Re-sign this exact artifact.`);

  // real minisign clients check the trusted comment too, so it must hold up here
  const comment = (lines[2] || "").replace(/^trusted comment: /, "");
  const global = b64(lines[3] || "");
  if (!crypto.verify(null, Buffer.concat([sig.payload, Buffer.from(comment, "utf8")]), key, global))
    throw new Error(`${sigPath}: the trusted comment fails verification`);

  return raw;
}

function build({ version, winSig, macSig, notes }) {
  const dl = `https://github.com/${REPO}/releases/download/v${version}`;
  const platforms = {
    "windows-x86_64": { signature: winSig, url: `${dl}/Poltergeist_${version}_x64-setup.exe` },
  };
  if (macSig) {
    // Both arch keys, same universal tarball: the updater looks up
    // "darwin-<arch>" exactly and has no darwin-universal fallback.
    const mac = { signature: macSig, url: `${dl}/Poltergeist.app.tar.gz` };
    platforms["darwin-aarch64"] = mac;
    platforms["darwin-x86_64"] = mac;
  }
  return { version, notes: notes || "", pub_date: new Date().toISOString(), platforms };
}

// The artifact you signed has to be the artifact the manifest points at. Catches
// publishing the previous version's installer under this version's URL.
function checkName(sigPath, url) {
  const got = path.basename(sigPath.replace(/\.sig$/, ""));
  const want = path.basename(new URL(url).pathname);
  if (got !== want)
    throw new Error(`signed ${got} but the manifest points at ${want} — wrong artifact, or tauri.conf.json's version is out of step`);
}

if (args.includes("--selfcheck")) {
  // Round-trip against an ephemeral key: build a real minisign pubkey + signature
  // in memory, then prove the verifier takes the good one and refuses the rest.
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).slice(-32);
  const keyId = Buffer.from("0102030405060708", "hex");
  const mkPub = (id) => Buffer.from(
    "untrusted comment: test\n" + Buffer.concat([Buffer.from("Ed"), id, raw]).toString("base64") + "\n"
  ).toString("base64");
  const tmp = path.join(require("os").tmpdir(), "pg-selfcheck");
  fs.mkdirSync(tmp, { recursive: true });
  const artifact = path.join(tmp, "Poltergeist_9.9.9_x64-setup.exe");
  fs.writeFileSync(artifact, "pretend installer");
  const sign = (file) => {
    const h = crypto.createHash("blake2b512").update(fs.readFileSync(file)).digest();
    const s = crypto.sign(null, h, privateKey);
    const comment = "timestamp:1\tfile:x";
    const g = crypto.sign(null, Buffer.concat([s, Buffer.from(comment)]), privateKey);
    return Buffer.from("untrusted comment: t\n" + Buffer.concat([Buffer.from("ED"), keyId, s]).toString("base64") +
      "\ntrusted comment: " + comment + "\n" + g.toString("base64") + "\n").toString("base64");
  };
  fs.writeFileSync(artifact + ".sig", sign(artifact));
  const pub = parsePub(mkPub(keyId));
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  console.assert(verifySig(artifact + ".sig", pub).length > 0, "a good signature verifies");
  console.assert(throws(() => verifySig(artifact + ".sig", parsePub(mkPub(Buffer.alloc(8))))),
    "a signature from another key is rejected");
  fs.writeFileSync(artifact, "tampered installer"); // same .sig, different bytes
  console.assert(throws(() => verifySig(artifact + ".sig", pub)), "a stale signature is rejected");
  fs.writeFileSync(path.join(tmp, "bad.sig"), Buffer.from("hello there").toString("base64"));
  console.assert(throws(() => verifySig(path.join(tmp, "bad.sig"), pub)), "a non-minisign file is rejected");

  const ok = "x";
  const m = build({ version: "9.9.9", winSig: ok, macSig: ok, notes: "n" });
  console.assert(Object.keys(m.platforms).length === 3, "3 platforms");
  console.assert(m.platforms["darwin-x86_64"].url === m.platforms["darwin-aarch64"].url, "both arches share the tarball");
  console.assert(!m.platforms["darwin-aarch64"].url.includes(".dmg"), "updates use the tarball, not the dmg");
  console.assert(build({ version: "9.9.9", winSig: ok }).platforms["darwin-aarch64"] === undefined, "mac optional");
  console.assert(!throws(() => checkName(artifact + ".sig", m.platforms["windows-x86_64"].url)), "matching names pass");
  console.assert(throws(() => checkName(path.join(tmp, "Poltergeist_1.0.0_x64-setup.exe.sig"), m.platforms["windows-x86_64"].url)),
    "a mismatched version is caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("selfcheck ok");
  process.exit(0);
}

if (args.includes("--help") || !arg("--win")) {
  console.log(`usage: node scripts/make_latest_json.js --win <setup.exe.sig> [--mac <app.tar.gz.sig>] [--notes "..."] [--pubkey <base64>]

  --win     the .sig next to the NSIS installer from the local release build
  --mac     the .sig you made with:
              cargo tauri signer sign -f ~/.tauri/poltergeist.key -p "" Poltergeist.app.tar.gz
            omit it for a Windows-only release
  --pubkey  verify against this key instead of tauri.conf.json's. ONLY for a
            key-rotation release, where the new build carries the NEW pubkey but
            its artifacts must still be signed with the OLD key so that already
            installed copies accept them. See "Rotating the signing key" in
            docs/ARCHITECTURE.md.

Each artifact must sit next to its .sig — signatures are verified against the
real bytes, not just parsed. Writes latest.json in the current directory; upload
it as a release asset LAST.`);
  process.exit(arg("--win") ? 0 : 1);
}

const conf = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tauri.conf.json"), "utf8"));
const pub = parsePub(arg("--pubkey") || conf.plugins.updater.pubkey);
if (arg("--pubkey")) console.log(`! verifying against an override key (${pub.keyId}) — rotation release`);

const manifest = build({
  version: conf.version,
  winSig: verifySig(arg("--win"), pub),
  macSig: arg("--mac") ? verifySig(arg("--mac"), pub) : null,
  notes: arg("--notes"),
});
checkName(arg("--win"), manifest.platforms["windows-x86_64"].url);
if (arg("--mac")) checkName(arg("--mac"), manifest.platforms["darwin-aarch64"].url);

fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote latest.json for v${manifest.version}: ${Object.keys(manifest.platforms).join(", ")}`);
console.log(`all signatures verified against key ${pub.keyId}`);
