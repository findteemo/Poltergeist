// Self-check for the datetime-local <-> epoch helpers in src/settings.js.
// Run: node scripts/test_datetime.js
const assert = require("assert");

// Mirror of the helpers in settings.js (kept in sync by hand — they're 3 lines).
function epochToLocalInput(epoch) {
  const d = new Date(epoch * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToEpoch(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

// Round-trip a few local wall-clock times to the minute. Whatever the runner's
// timezone, epoch -> input -> epoch must land on the same minute boundary.
for (const iso of ["2026-06-25T15:00", "2026-12-31T23:59", "2027-01-01T00:00"]) {
  const epoch = localInputToEpoch(iso);
  assert.strictEqual(epoch % 60, 0, "minute resolution");
  assert.strictEqual(epochToLocalInput(epoch), iso, `round-trip ${iso}`);
}

// epoch with stray seconds collapses to the minute when shown in the picker.
const withSecs = localInputToEpoch("2026-06-25T15:00") + 42;
assert.strictEqual(epochToLocalInput(withSecs), "2026-06-25T15:00", "seconds dropped in picker");

console.log("ok: datetime round-trips to the minute");
