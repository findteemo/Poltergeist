// Remember each window's on-screen position across launches. Keyed by window
// label in localStorage: restored on load, saved (debounced) whenever you drag.
// Shared by the character, settings, to-do and calendar windows.
//
// Also keeps the window on a connected monitor: a saved spot whose monitor is
// gone (unplugged before this launch) is not restored at all, and a window that
// ends up off-screen anyway is pulled back onto the primary — on load and on a
// slow poll, so a mid-session disconnect doesn't strand it in the void. The
// saved spot is left untouched, so reconnecting the monitor restores the window
// to where you left it.
(async () => {
  const { getCurrentWindow, PhysicalPosition, availableMonitors, primaryMonitor } = window.__TAURI__.window;
  const w = getCurrentWindow();
  const KEY = "winpos:" + w.label;
  let ready = false;
  let rescuing = false; // suppress saving while we reposition a stranded window

  // True if the window's CENTER sits on a connected monitor. Center, not "any
  // overlap": the ghost fills only the bottom-center of a mostly-empty 240x260
  // box, so a window clipping a monitor by its empty top edge counts as
  // on-screen while showing nothing at all. Also still lets you tuck a window
  // up to halfway off an edge on purpose.
  function centered(pos, size, mons) {
    const cx = pos.x + size.width / 2, cy = pos.y + size.height / 2;
    return mons.some((m) =>
      cx >= m.position.x && cx < m.position.x + m.size.width &&
      cy >= m.position.y && cy < m.position.y + m.size.height);
  }
  async function onScreen() {
    const [pos, size, mons] = await Promise.all([w.outerPosition(), w.outerSize(), availableMonitors()]);
    return centered(pos, size, mons);
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
    // Only restore onto a monitor that's still connected. Moving there first and
    // letting rescue() undo it depends on the move having landed before we read
    // the position back; refusing the move up front just leaves the window where
    // the OS put it (on the primary). The saved spot is kept either way, so
    // plugging the monitor back in restores it.
    if (saved && centered(saved, await w.outerSize(), await availableMonitors()))
      await w.setPosition(new PhysicalPosition(saved.x, saved.y));
  } catch (e) {}
  await rescue(); // belt and braces: also covers a window the OS placed badly

  // The ghost swooping at a doomscroll tab (main.js) moves this window on purpose
  // and puts it back; hold the save off so the swoop isn't mistaken for a drag.
  window.__winposHold = (on) => { rescuing = !!on; };

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
