// Remember each window's on-screen position across launches. Keyed by window
// label in localStorage: restored on load, saved (debounced) whenever you drag.
// Shared by the character, settings and to-do windows.
(async () => {
  const { getCurrentWindow, PhysicalPosition } = window.__TAURI__.window;
  const w = getCurrentWindow();
  const KEY = "winpos:" + w.label;
  let ready = false;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    // ponytail: no off-screen clamp — if the monitor it lived on is gone, drag it back once.
    if (saved) await w.setPosition(new PhysicalPosition(saved.x, saved.y));
  } catch (e) {}
  // ignore the move-bursts from initial placement + our own restore, so they
  // don't overwrite the saved spot; only persist real drags after things settle.
  setTimeout(() => { ready = true; }, 700);
  let t;
  w.onMoved(({ payload }) => {
    if (!ready) return;
    clearTimeout(t);
    t = setTimeout(() => localStorage.setItem(KEY, JSON.stringify({ x: payload.x, y: payload.y })), 250);
  });
})();
