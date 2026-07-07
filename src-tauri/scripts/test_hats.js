// Self-check for hat unlock derivation in src/main.js. Hats unlock permanently
// at day-streak milestones based on the best streak ever reached.
// Run: node src-tauri/scripts/test_hats.js
const assert = require("assert");

// ponytail: mirror of the HATS milestones in src/main.js (frontend has no
// module system — same pattern as test_queue.js mirroring the queue).
const HAT_STREAKS = { bow: 3, cap: 7, crown: 14, tophat: 30, witch: 60, halo: 100 };
const unlockedHats = (best) =>
  Object.keys(HAT_STREAKS).filter((id) => best >= HAT_STREAKS[id]);

// best-ever, monotonic: once earned a hat stays unlocked
assert.deepStrictEqual(unlockedHats(0), [], "no streak → no hats");
assert.deepStrictEqual(unlockedHats(2), [], "below first milestone → none");
assert.deepStrictEqual(unlockedHats(3), ["bow"], "exactly 3 → bow unlocks");
assert.deepStrictEqual(unlockedHats(13), ["bow", "cap"], "between milestones keeps earned");
assert.deepStrictEqual(unlockedHats(100), ["bow", "cap", "crown", "tophat", "witch", "halo"], "100 → all");
assert.deepStrictEqual(unlockedHats(999), ["bow", "cap", "crown", "tophat", "witch", "halo"], "beyond max → all, no crash");

console.log("ok: hats unlock at the right streaks");
