// Self-check for the bubble queue in src/main.js: every due reminder must get
// acked exactly once, even when several fire before any is clicked.
// Run: node scripts/test_queue.js
const assert = require("assert");

// Mirror of main.js queue logic (DOM/tauri stripped out).
function makeQueue(onAck) {
  const queue = [];
  let currentId = null;
  function showNext() {
    const next = queue.shift();
    currentId = next ? next.id : null;
  }
  return {
    due: (p) => { queue.push(p); if (!currentId) showNext(); },
    click: () => { if (!currentId) return; onAck(currentId); showNext(); },
    get current() { return currentId; },
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
