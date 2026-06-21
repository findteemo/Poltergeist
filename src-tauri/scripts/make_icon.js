// Generates icons/icon.ico (16x16, 32-bit BGRA) from the ghost sprite. No deps.
// Authored for this project, CC0. Run: node scripts/make_icon.js
// Keep this sprite in sync with buildSprite() in ../../src/main.js.
const fs = require("fs");
const path = require("path");

const W = 16, H = 16;
function buildSprite() {
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const cx = 7.5;
  for (let y = 2; y <= 12; y++) {
    const half = y < 6 ? 3 + (y - 2) * 0.95 : 6;
    for (let x = 0; x < W; x++) if (Math.abs(x - cx) <= half) g[y][x] = "b";
  }
  for (const x of [2, 3, 5, 6, 8, 9, 11, 12, 13]) g[13][x] = "b";
  for (let y = 9; y <= 13; y++) for (let x = 0; x < W; x++) if (g[y][x] === "b" && x - cx > 3.2) g[y][x] = "s";
  const solid = (x, y) => y >= 0 && y < H && x >= 0 && x < W && g[y][x] !== "." && g[y][x] !== "o";
  const ring = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (g[y][x] === "." && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ring.push([x, y]);
  for (const [x, y] of ring) g[y][x] = "o";
  const put = (x, y, k) => { g[y][x] = k; };
  put(5, 7, "e"); put(5, 8, "e"); put(10, 7, "e"); put(10, 8, "e");
  put(4, 10, "p"); put(11, 10, "p");
  return g;
}
// RGB
const COLOR = {
  b: [236, 228, 250], s: [201, 184, 236], o: [42, 27, 61],
  e: [25, 16, 43], p: [196, 166, 245],
};

const g = buildSprite();

// One BMP-in-ICO image at an integer scale of the 16x16 sprite. Nearest-neighbor
// (integer) upscaling keeps the pixel art crisp — a lone 16x16 icon looks blurry
// because Windows smooth-upsamples it for bigger shortcut/taskbar sizes.
function makeImage(scale) {
  const ow = W * scale, oh = H * scale;
  const xor = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const vy = oh - 1 - y; // BMP rows are bottom-up
    const k = g[Math.floor(vy / scale)][Math.floor(x / scale)];
    if (k === ".") continue; // transparent (already zeroed)
    const [r, gg, b] = COLOR[k];
    const o = (y * ow + x) * 4;
    xor[o] = b; xor[o + 1] = gg; xor[o + 2] = r; xor[o + 3] = 255; // BGRA
  }
  const andMask = Buffer.alloc(((ow + 31) >> 5) * 4 * oh); // 32-bit aligned, all 0
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);    // biSize
  header.writeInt32LE(ow, 4);     // biWidth
  header.writeInt32LE(oh * 2, 8); // biHeight (xor + and)
  header.writeUInt16LE(1, 12);    // planes
  header.writeUInt16LE(32, 14);   // bitCount
  return Buffer.concat([header, xor, andMask]);
}

const SIZES = [16, 32, 48, 64, 128, 256]; // all multiples of 16 → integer scale
const images = SIZES.map((px) => makeImage(px / W));

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((img, i) => {
  const px = SIZES[i];
  const e = Buffer.alloc(16);
  e[0] = px & 255; e[1] = px & 255; e[2] = 0; e[3] = 0; // 256 stored as 0
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});

const ico = Buffer.concat([dir, ...entries, ...images]);
const out = path.join(__dirname, "..", "icons", "icon.ico");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log("wrote", out, ico.length, "bytes,", SIZES.length, "sizes:", SIZES.join("/"));

// Also emit raw 32x32 RGBA (top-down) for tauri's runtime window icon (Image::new).
const S = 2, OW = W * S, OH = H * S;
const rgba = Buffer.alloc(OW * OH * 4);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const k = g[Math.floor(y / S)][Math.floor(x / S)];
  if (k === ".") continue;
  const [r, gg, b] = COLOR[k];
  const o = (y * OW + x) * 4;
  rgba[o] = r; rgba[o + 1] = gg; rgba[o + 2] = b; rgba[o + 3] = 255;
}
const rout = path.join(__dirname, "..", "icons", "icon.rgba");
fs.writeFileSync(rout, rgba);
console.log("wrote", rout, rgba.length, "bytes (32x32 RGBA)");
