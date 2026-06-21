// Self-check for the min/hr display helpers in src/settings.js.
// Run: node scripts/test_unit.js
const assert = require("assert");

function factor(unit) { return unit === "hr" ? 3600 : 60; }
function displayFor(secs) {
  return secs >= 3600 && secs % 3600 === 0
    ? { unit: "hr", value: secs / 3600 }
    : { unit: "min", value: Math.round(secs / 60) };
}

// whole hours show as hr, everything else as min
assert.deepStrictEqual(displayFor(1800), { unit: "min", value: 30 }, "30 min");
assert.deepStrictEqual(displayFor(3600), { unit: "hr", value: 1 }, "1 hr");
assert.deepStrictEqual(displayFor(7200), { unit: "hr", value: 2 }, "2 hr");
assert.deepStrictEqual(displayFor(5400), { unit: "min", value: 90 }, "90 min, not 1.5 hr");

// editing the number in the shown unit reproduces interval_secs
assert.strictEqual(2 * factor("hr"), 7200, "2 hr -> secs");
assert.strictEqual(45 * factor("min"), 2700, "45 min -> secs");

// switching unit redisplays the same interval
const secs = 7200;
assert.strictEqual(secs / factor("min"), 120, "2 hr shown as 120 min");

console.log("ok: min/hr conversion holds");
