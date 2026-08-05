// Self-check for the bubble queue in src/main.js: every due reminder must get
// acked exactly once, even when several fire before any is clicked.
// Run: node scripts/test_queue.js
const assert = require("assert");

// Mirror of main.js queue logic (DOM/tauri stripped out).
const SILENT = new Set(["__idle__", "__greet__", "__focusdone__"]);
function makeQueue(onAck) {
  const queue = [];
  let currentId = null;
  const badge = { text: "", hidden: true };  // stands in for #bubble .stack
  let chimes = 0;
  function updateStack() {
    badge.text = String(queue.length);
    badge.hidden = queue.length === 0;
  }
  function showNext() {
    const next = queue.shift();
    updateStack();
    currentId = next ? next.id : null;
    if (next && !SILENT.has(next.id) && !next.chimed) chimes++;
  }
  return {
    due: (p) => {                                    // = enqueue()
      queue.push(p);
      if (!currentId) { showNext(); return; }
      if (!SILENT.has(p.id)) { chimes++; p.chimed = true; } // stacked behind an open bubble
      updateStack();
    },
    click: () => { if (!currentId) return; onAck(currentId); showNext(); },
    get current() { return currentId; },
    get badge() { return badge; },
    get chimes() { return chimes; },
  };
}

const acked = [];
const q = makeQueue((id) => acked.push(id));

// three fire back-to-back before any click (the old single-bubble bug)
q.due({ id: "hydrate" });
q.due({ id: "posture" });
q.due({ id: "stretch" });

q.click(); q.click(); q.click();

assert.deepStrictEqual(acked, ["hydrate", "posture", "stretch"], "all acked in order");
assert.strictEqual(q.current, null, "queue drained");
q.click(); // extra click on empty queue is a no-op
assert.strictEqual(acked.length, 3, "no phantom ack");

console.log("ok: queue drains every reminder");

// ---- stack counter + arrival chime ----
const s = makeQueue(() => {});
s.due({ id: "hydrate" });                    // shows immediately → chime on show
assert.strictEqual(s.chimes, 1, "shown bubble chimes");
assert.strictEqual(s.badge.hidden, true, "nothing waiting → no badge");

s.due({ id: "posture" });                    // stacks behind → chime on arrival
s.due({ id: "stretch" });
assert.strictEqual(s.chimes, 3, "each stacked arrival chimes");
assert.deepStrictEqual([s.badge.text, s.badge.hidden], ["2", false], "badge counts the waiting two");

s.due({ id: "__idle__" });                   // ambient mutter — silent even when stacking
assert.strictEqual(s.chimes, 3, "silent sentinels never chime");
assert.strictEqual(s.badge.text, "3", "…but still count");

s.click();                                   // posture shows (already chimed on arrival)
assert.strictEqual(s.chimes, 3, "no second chime when a stacked nudge finally shows");
assert.strictEqual(s.badge.text, "2", "badge shrinks as the queue drains");
s.click(); s.click(); s.click();
assert.strictEqual(s.current, null, "queue drained");
assert.strictEqual(s.badge.hidden, true, "badge hides when nothing is left");

console.log("ok: stacked nudges chime on arrival and show a waiting count");

