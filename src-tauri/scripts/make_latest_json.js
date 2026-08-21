// Builds the latest.json updater manifest from a release's .sig files.
// Hand-writing it is how you ship a stale or mismatched signature, which
// silently breaks auto-update for every installed copy — and the fix can only
// reach people who reinstall by hand. So: generated, and the signatures are
// sanity-checked. No deps. Run `node scripts/make_latest_json.js --help`.
const fs = require("fs");
const path = require("path");

const REPO = "findteemo/Poltergeist";
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };

// A tauri .sig file is base64 of the minisign signature, which starts with a
// comment line. Catches the classic release-day slip: the wrong file pasted in.
function readSig(p) {
  const s = fs.readFileSync(p, "utf8").trim();
  const decoded = Buffer.from(s, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:"))
    throw new Error(`${p} is not a minisign signature (decoded: ${decoded.slice(0, 40)}…)`);
  return s;
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

if (args.includes("--selfcheck")) {
  const ok = Buffer.from("untrusted comment: signature from tauri\nAAAA").toString("base64");
  const m = build({ version: "9.9.9", winSig: ok, macSig: ok, notes: "n" });
  console.assert(Object.keys(m.platforms).length === 3, "3 platforms");
  console.assert(m.platforms["darwin-x86_64"].url === m.platforms["darwin-aarch64"].url, "both arches share the tarball");
  console.assert(!m.platforms["darwin-aarch64"].url.includes(".dmg"), "updates use the tarball, not the dmg");
  console.assert(build({ version: "9.9.9", winSig: ok }).platforms["darwin-aarch64"] === undefined, "mac optional");
  const tmp = path.join(require("os").tmpdir(), "bad.sig");
  fs.writeFileSync(tmp, Buffer.from("hello there").toString("base64"));
  let threw = false;
  try { readSig(tmp); } catch { threw = true; }
  console.assert(threw, "a non-minisign file must be rejected");
  fs.unlinkSync(tmp);
  console.log("selfcheck ok");
  process.exit(0);
}

if (args.includes("--help") || !arg("--win")) {
  console.log(`usage: node scripts/make_latest_json.js --win <setup.exe.sig> [--mac <app.tar.gz.sig>] [--notes "..."]

  --win   the .sig next to the NSIS installer from the local release build
  --mac   the .sig you made with:
            cargo tauri signer sign -f ~/.tauri/poltergeist.key -p "" Poltergeist.app.tar.gz
          omit it for a Windows-only release
Writes latest.json in the current directory. Upload it as a release asset.`);
  process.exit(arg("--win") ? 0 : 1);
}

const conf = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tauri.conf.json"), "utf8"));
const manifest = build({
  version: conf.version,
  winSig: readSig(arg("--win")),
  macSig: arg("--mac") ? readSig(arg("--mac")) : null,
  notes: arg("--notes"),
});
fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote latest.json for v${manifest.version}:`, Object.keys(manifest.platforms).join(", "));
