// Remember each window's on-screen position across launches. Keyed by window
// label in localStorage: restored on load, saved (debounced) whenever you drag.
// Shared by the character, settings and to-do windows.
//
// Also keeps the window on a connected monitor: if it ends up fully off-screen
// (e.g. the monitor it lived on was unplugged), it's pulled back onto the
// primary monitor — on load and on a slow poll, so a mid-session disconnect
// doesn't strand a window in the void. The saved spot is left untouched, so
// reconnecting the monitor restores the window to where you left it.
(async () => {
  const { getCurrentWindow, PhysicalPosition, availableMonitors, primaryMonitor } = window.__TAURI__.window;
  const w = getCurrentWindow();
  const KEY = "winpos:" + w.label;
  let ready = false;
  let rescuing = false; // suppress saving while we reposition a stranded window

  // True if the window's rect overlaps any connected monitor at all.
  async function onScreen() {
    const [pos, size, mons] = await Promise.all([w.outerPosition(), w.outerSize(), availableMonitors()]);
    return mons.some((m) =>
      pos.x < m.position.x + m.size.width && pos.x + size.width > m.position.x &&
      pos.y < m.position.y + m.size.height && pos.y + size.height > m.position.y);
  }
  // Pull a stranded window back onto the primary monitor (centered).
  async function rescue() {
    try {
      if (await onScreen()) return;
      const m = (await primaryMonitor()) || (await availableMonitors())[0];
      if (!m) return;
      const size = await w.outerSize();
      const x = m.position.x + Math.max(0, (m.size.width - size.width) / 2);
      const y = m.position.y + Math.max(0, (m.size.height - size.height) / 2);
      rescuing = true;
      await w.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
      setTimeout(() => { rescuing = false; }, 300); // let the move event pass
    } catch (e) { rescuing = false; }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) await w.setPosition(new PhysicalPosition(saved.x, saved.y));
  } catch (e) {}
  await rescue(); // the saved spot may be on a monitor that's no longer attached

  // ponytail: poll for a monitor going away mid-session — the webview has no
  // reliable display-change event. 5s, cheap bounds math, no-op while on-screen.
  setInterval(rescue, 5000);

  // ignore the move-bursts from initial placement + our own restore/rescue, so
  // they don't overwrite the saved spot; only persist real drags after settling.
  setTimeout(() => { ready = true; }, 700);
  let t;
  w.onMoved(({ payload }) => {
    if (!ready || rescuing) return;
    clearTimeout(t);
    t = setTimeout(() => localStorage.setItem(KEY, JSON.stringify({ x: payload.x, y: payload.y })), 250);
  });
})();
