// Self-check for the "is this window still on a connected monitor" test in
// src/winpos.js — the one that decides whether a saved position is restored and
// whether a stranded window gets pulled back to the primary.
// Run: node src-tauri/scripts/test_winpos.js
const assert = require("assert");

// ponytail: mirror of centered() in src/winpos.js (frontend has no module
// system — same pattern as test_queue.js mirroring the queue).
function centered(pos, size, mons) {
  const cx = pos.x + size.width / 2, cy = pos.y + size.height / 2;
  return mons.some((m) =>
    cx >= m.position.x && cx < m.position.x + m.size.width &&
    cy >= m.position.y && cy < m.position.y + m.size.height);
}

const mon = (x, y, w, h) => ({ position: { x, y }, size: { width: w, height: h } });
const GHOST = { width: 240, height: 260 };          // the character window
const laptop = mon(0, 0, 1920, 1080);
// an external monitor in each of the four directions. Windows lays the virtual
// desktop out around the primary at 0,0, so left/above are simply negative —
// the same rect test covers every arrangement.
const right = mon(1920, 0, 2560, 1440);
const left = mon(-1920, 0, 1920, 1080);
const above = mon(0, -1080, 1920, 1080);
const below = mon(0, 1080, 1920, 1080);

// the reported bug, from every direction: parked on the external, booted without it
for (const [dir, ext, spot] of [
  ["right", right, { x: 3000, y: 600 }],
  ["left", left, { x: -1500, y: 400 }],
  ["above", above, { x: 800, y: -700 }],
  ["below", below, { x: 800, y: 1500 }],
]) {
  assert.ok(centered(spot, GHOST, [laptop, ext]), `${dir}: on the external while plugged in`);
  assert.ok(!centered(spot, GHOST, [laptop]), `${dir}: unplugged → not on screen`);
}

// the primary itself can be the monitor that vanishes: unplug it and the laptop
// becomes primary at 0,0, so the whole coordinate space shifts under the saved spot
const extPrimary = mon(0, 0, 1920, 1080), laptopSecondary = mon(-1920, 0, 1920, 1080);
assert.ok(centered({ x: -1200, y: 400 }, GHOST, [extPrimary, laptopSecondary]), "parked on the laptop");
assert.ok(!centered({ x: -1200, y: 400 }, GHOST, [laptop]), "laptop is primary now → old coords are off-screen");

// the hole the old any-overlap test left: the ghost sits in the bottom-center of
// a mostly-empty box, so clipping a monitor by the empty top edge showed nothing
assert.ok(!centered({ x: 800, y: -200 }, GHOST, [laptop]), "only the empty top strip on screen → rescue");
assert.ok(!centered({ x: 1900, y: 500 }, GHOST, [laptop]), "only a 20px sliver on screen → rescue");

// deliberate edge-tucking still allowed, up to halfway off
assert.ok(centered({ x: 1799, y: 500 }, GHOST, [laptop]), "tucked just under half off the right edge → kept");
assert.ok(!centered({ x: 1801, y: 500 }, GHOST, [laptop]), "past half off → rescue");

// degenerate inputs must not throw or claim on-screen
assert.ok(!centered({ x: 0, y: 0 }, GHOST, []), "no monitors reported → not on screen");

console.log("ok: off-screen windows are detected, tucked ones are left alone");
