// cozy companion — character window
const W = 16, H = 16;

// Build a little floating ghost on a 16x16 grid (CC0, authored here).
// Returns a grid of palette keys; '.' = transparent.
// mood: "normal" | "happy" | "sad" | "angry" | "curious" | "yawn" | "surprised"
//   | "scrunch" (>.< squeeze, on drag) | "sleeping" — changes eyes + mouth.
// gaze: -1 | 0 | 1 — horizontal pupil shift, only used by the open-eyed faces
//   (normal/curious) so the ghost can glance toward the cursor while hovered.
function buildSprite(blink, mood, gaze = 0) {
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const cx = 7.5;
  // domed top, straight sides
  for (let y = 2; y <= 12; y++) {
    const half = y < 6 ? 3 + (y - 2) * 0.95 : 6;
    for (let x = 0; x < W; x++) if (Math.abs(x - cx) <= half) g[y][x] = "b";
  }
  // wavy hanging tail
  for (const x of [2, 3, 5, 6, 8, 9, 11, 12, 13]) g[13][x] = "b";
  // spectral shading down the right edge for depth
  for (let y = 9; y <= 13; y++) for (let x = 0; x < W; x++) if (g[y][x] === "b" && x - cx > 3.2) g[y][x] = "s";
  // outline ring: any empty cell touching the body
  const solid = (x, y) => y >= 0 && y < H && x >= 0 && x < W && g[y][x] !== "." && g[y][x] !== "o";
  const ring = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (g[y][x] === "." && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ring.push([x, y]);
  for (const [x, y] of ring) g[y][x] = "o";
  // face
  const put = (x, y, k) => { g[y][x] = k; };
  // eyes
  if (blink) { put(5, 8, "o"); put(10, 8, "o"); } // mid-blink wink
  else if (mood === "sleeping") { // soft closed lids
    put(4, 8, "o"); put(5, 8, "o"); put(10, 8, "o"); put(11, 8, "o");
  } else if (mood === "happy" || mood === "yawn") { // ^ ^ curved-up / squinted eyes
    put(4, 8, "e"); put(5, 7, "e"); put(6, 8, "e");
    put(9, 8, "e"); put(10, 7, "e"); put(11, 8, "e");
  } else if (mood === "surprised") { // wide round eyes
    put(4, 7, "e"); put(5, 7, "e"); put(4, 8, "e"); put(5, 8, "e");
    put(10, 7, "e"); put(11, 7, "e"); put(10, 8, "e"); put(11, 8, "e");
  } else if (mood === "scrunch") { // >.< squeezed-shut eyes pointing inward
    put(4, 7, "e"); put(5, 8, "e"); put(4, 9, "e");   // >
    put(11, 7, "e"); put(10, 8, "e"); put(11, 9, "e"); // <
  } else if (mood === "angry") { // \  / slanted brows
    put(4, 7, "e"); put(5, 8, "e"); put(11, 7, "e"); put(10, 8, "e");
  } else { // normal / curious / writing — open pupils, glance via gaze
    put(5 + gaze, 7, "e"); put(5 + gaze, 8, "e"); put(10 + gaze, 7, "e"); put(10 + gaze, 8, "e");
    if (mood === "sad") { put(11, 11, "t"); put(11, 12, "t"); } // tear down the cheek
  }
  // mouth (none when normal / sleeping)
  if (mood === "happy") { put(6, 11, "o"); put(7, 12, "o"); put(8, 12, "o"); put(9, 11, "o"); } // smile
  else if (mood === "curious") { put(7, 12, "o"); put(8, 12, "o"); } // tiny interested smile
  else if (mood === "sad") { put(6, 12, "o"); put(7, 11, "o"); put(8, 11, "o"); put(9, 12, "o"); } // frown
  else if (mood === "angry") { put(6, 11, "o"); put(7, 11, "o"); put(8, 11, "o"); put(9, 11, "o"); } // gritted
  else if (mood === "yawn") { put(6, 11, "o"); put(9, 11, "o"); put(7, 11, "e"); put(8, 11, "e"); put(7, 12, "e"); put(8, 12, "e"); } // wide open
  else if (mood === "surprised") { put(7, 11, "o"); put(8, 11, "o"); put(7, 12, "e"); put(8, 12, "e"); } // small o
  else if (mood === "scrunch") { put(7, 12, "e"); put(8, 12, "e"); } // tiny . mouth
  put(4, 10, "p"); put(11, 10, "p"); // blush
  return g;
}

// ghost + hat palette keys. Ghost keys reference themed CSS vars (recolor with the
// theme); hat keys are fixed hex (each hat keeps its own colors across themes). The
// two key sets are disjoint (ghost 'b' body vs hat 'L' highlight), so one map serves
// both — see render(), which composites the hat over the ghost grid.
const COLOR = {
  b: "var(--ghost)", s: "var(--ghost-shade)", o: "var(--ghost-outline)",
  e: "var(--eye)", p: "var(--blush)", t: "var(--tear)",
  K: "#3a2e47", // hat outline (off pure-black so dark hats read on the near-black void)
  W: "#fff6e6", // shine / sparkle
  G: "#f5c542", g: "#d99a2b", Y: "#ffe08a", // gold / shade / highlight
  R: "#e8556d", r: "#b83350",               // red / shade
  P: "#f7a8c8", q: "#e07aa6",               // pink / shade
  B: "#332b47", L: "#564a75",               // top-hat black / highlight
  V: "#8257c9", v: "#5e3a94",               // witch purple / shade
  j: "#5fa8e0", n: "#5fd08a",               // sapphire / emerald gems
};

// Hat art: a filled silhouette + interior accents, drawn ABOVE the ghost. When a hat
// is worn the ghost grid grows to HROWS rows (render); the ghost sits in the bottom H
// rows and the hat rises into the space where the reminder bubble normally is. Coords
// are in that tall canvas, where the head crown sits at row ~10. Fills only — a dark
// outline is auto-added by withOutline. Runtime-only — NOT mirrored in make_icon.js.
const hrow = (y, xs, c) => xs.map((x) => [x, y, c]);
function buildHat(id) {
  switch (id) {
    case "bow": return [].concat(
      hrow(7, [4,5], "P"), hrow(7, [10,11], "P"),
      hrow(8, [3,4,5,6], "P"), [[5,8,"W"]], hrow(8, [9,10,11,12], "q"),
      hrow(9, [3,4,5,6], "P"), hrow(9, [9,10,11,12], "q"),
      hrow(10,[4,5,6], "q"),   hrow(10,[9,10,11], "q"),
      hrow(8, [7,8], "q"), hrow(9,[7,8],"r"), hrow(10,[7,8],"q"),   // knot
      hrow(11,[6,7], "P"), hrow(11,[8,9], "q"),                     // tails
    );
    case "cap": return [].concat(
      hrow(6, [7,8], "R"),                                          // button
      hrow(7, [5,6,7,8,9,10], "R"),
      hrow(8, [4,5,6,7,8,9,10,11], "R"), [[6,8,"W"]],
      hrow(9, [4,5,6,7,8,9,10,11], "R"),
      hrow(10,[4,5,6,7,8,9,10,11], "r"),
      hrow(11,[8,9,10,11,12,13], "r"),                             // brim to the right
    );
    case "crown": return [].concat(
      hrow(4, [7,8], "R"),                                         // top ruby
      hrow(5, [4,7,8,11], "Y"),                                    // point tips (highlight)
      hrow(6, [4,7,8,11], "G"),
      hrow(7, [4,5,7,8,10,11], "G"),
      hrow(8, [4,5,6,7,8,9,10,11], "G"),
      hrow(9, [4,5,6,7,8,9,10,11], "G"), [[5,9,"R"],[8,9,"n"],[10,9,"j"]], // band + gems
      hrow(10,[4,5,6,7,8,9,10,11], "g"),                          // band shade
    );
    case "tophat": return [].concat(
      hrow(3, [6,7,8,9], "B"), [[6,3,"L"]],
      hrow(4, [6,7,8,9], "B"), [[6,4,"W"]],                        // left-edge shine so it
      hrow(5, [6,7,8,9], "B"), [[6,5,"W"]],                        // reads against the void
      hrow(6, [6,7,8,9], "B"), [[6,6,"L"]],
      hrow(7, [6,7,8,9], "B"), [[6,7,"L"]],
      hrow(8, [5,6,7,8,9], "R"), [[9,8,"r"]],                       // band
      hrow(9, [4,5,6,7,8,9,10,11], "B"), [[4,9,"L"],[5,9,"L"]],    // brim + top highlight
      hrow(10,[3,4,5,6,7,8,9,10,11,12], "B"), [[3,10,"L"]],
    );
    case "witch": return [].concat(
      hrow(3, [5], "V"), [[4,3,"W"]],                             // bent tip + star
      hrow(4, [5,6], "V"),
      hrow(5, [6,7], "V"),
      hrow(6, [6,7,8], "V"), [[8,6,"v"]],
      hrow(7, [6,7,8,9], "V"), [[9,7,"v"]],
      hrow(8, [5,6,7,8,9], "V"),
      hrow(9, [5,6,7,8,9], "v"), [[7,9,"G"]],                     // buckle band
      hrow(10,[3,4,5,6,7,8,9,10,11,12], "V"), [[11,10,"v"],[12,10,"v"]],
    );
    case "halo": return [].concat(
      hrow(4, [6,7,8,9], "Y"),                                     // brighter than the crown
      hrow(5, [5,10], "G"),                                        // so it reads as glow, not metal
      hrow(6, [5,10], "G"),
      hrow(7, [6,7,8,9], "G"), [[8,7,"g"],[9,7,"g"]],
      [[4,5,"W"],[11,6,"W"],[7,3,"W"],[8,3,"W"]],                  // glow sparkles
    );
    default: return [];
  }
}
// wrap the filled cells in a dark (K) outline ring, like buildSprite does for the ghost
function withOutline(fills) {
  const fill = new Map();
  for (const [x, y, c] of fills) fill.set(x + "," + y, c);
  const out = [];
  for (const key of fill.keys()) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])
      if (!fill.has((x + dx) + "," + (y + dy))) out.push([x + dx, y + dy, "K"]);
  }
  return out.concat(fills); // fills drawn on top of the outline
}
console.assert(buildHat("crown").length > 0 && buildHat("nope").length === 0, "buildHat known vs unknown");

// equipped hat id ("" = none), remembered locally; pushed live from settings
let equippedHat = localStorage.getItem("ghostHat") || "";

const charEl = document.getElementById("char");
const flamesEl = document.getElementById("flames");
const ghostwrapEl = document.getElementById("ghostwrap");
const padEl = document.getElementById("pad");

// ghost size: cell px set from settings; remembered locally so it survives restart
const CELL_KEY = "charCell";
const setCell = (px) => document.documentElement.style.setProperty("--cell", px + "px");
setCell(localStorage.getItem(CELL_KEY) || 9);

let mood = "normal";
function setMood(m) {
  mood = m;
  charEl.classList.toggle("sad", m === "sad");
  charEl.classList.toggle("angry", m === "angry");
  charEl.classList.toggle("sleeping", m === "sleeping"); // dimmed, slow breathing bob
  flamesEl.classList.toggle("lit", m === "angry"); // purple flames in poltergeist mode
  ghostwrapEl.classList.toggle("writing", m === "writing"); // shows the focus notebook
  ghostwrapEl.classList.toggle("sleeping", m === "sleeping"); // shows the floating zzz
  if (m === "writing") startPad(); else stopPad();
  // doze only counts down from a calm resting state; any other mood cancels it
  if (m === "normal") scheduleDoze(); else clearTimeout(dozeTimer);
  render(false);
}

// ---- focus notebook sprite ----
// A pixel notebook the ghost writes in (same grid-of-cells style as the ghost).
// We see the BACK cover — the page faces the ghost and stays hidden; only the
// pencil top pokes above the spiral binding and walks side to side as it writes.
const PW = 10, PH = 9;
const PAD = {
  c: "var(--pad-cover)",   // cover (themed in tokens.css, like the ghost cells)
  s: "var(--pad-shade)",   // cover shade (depth on the right/bottom)
  o: "var(--ghost-outline)", // cover edge
  r: "var(--void)",        // spiral binding ring
  l: "var(--purple-bright)", // label panel
  w: "var(--pad-pencil)",  // pencil wood (token — constant across themes, like --tear)
  m: "var(--pad-eraser)",  // pencil eraser (the bit we see)
};
const PAD_HEADS = [3, 4, 5, 6, 7, 7, 6, 5, 4]; // pencil column per frame (side to side)
function buildPad(f) {
  const g = Array.from({ length: PH }, () => Array(PW).fill("."));
  const put = (x, y, c) => { if (x >= 0 && x < PW && y >= 0 && y < PH) g[y][x] = c; };
  // cover body, rows 3..8 (framed)
  for (let y = 3; y <= 8; y++)
    for (let x = 1; x <= 8; x++) g[y][x] = (y === 8 || x === 1 || x === 8) ? "o" : "c";
  // depth shade along the inner right + above the bottom edge
  for (let y = 4; y <= 7; y++) g[y][7] = "s";
  for (let x = 2; x <= 7; x++) g[7][x] = "s";
  // spiral binding across the top edge
  for (let x = 1; x <= 8; x++) g[3][x] = x % 2 ? "r" : "o";
  // label panel
  for (let x = 3; x <= 6; x++) { g[5][x] = "l"; g[6][x] = "l"; }
  // pencil top poking above the cover, walking side to side
  const px = PAD_HEADS[f % PAD_HEADS.length];
  put(px, 0, "m"); put(px, 1, "w"); put(px, 2, "w");
  return g;
}
// build a grid's cells once, then recolor in place — rebuilding the DOM every
// frame (pad ticks at 220ms) churned hundreds of nodes/sec for 3 changed cells
function ensureCells(el, n) {
  while (el.childElementCount < n) {
    const cell = document.createElement("div");
    cell.className = "px";
    el.appendChild(cell);
  }
  // shrink too: the ghost grid grows to HROWS when hatted and back to H when bare,
  // so leftover cells must go or they'd flow into stray implicit grid rows
  while (el.childElementCount > n) el.removeChild(el.lastElementChild);
}
function paintGrid(el, g, w, h, palette) {
  ensureCells(el, w * h);
  const cells = el.children;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      cells[y * w + x].style.background = g[y][x] === "." ? "" : palette[g[y][x]];
}
function renderPad(f) {
  paintGrid(padEl, buildPad(f), PW, PH, PAD);
}
let padFrame = 0, padTimer = null;
function stopPad() { clearInterval(padTimer); padTimer = null; padFrame = 0; }
function startPad() {
  stopPad();
  renderPad(0);
  if (reduceMotion.matches) return; // static notebook still reads as "writing"
  padTimer = setInterval(() => { padFrame = (padFrame + 1) % PAD_HEADS.length; renderPad(padFrame); }, 220);
}
// quick happy hop on dismiss, then settle back to normal
function celebrate() {
  setMood("happy");
  charEl.classList.add("celebrate");
  setTimeout(() => {
    charEl.classList.remove("celebrate");
    // back to writing if a focus block is still running, else normal
    if (mood === "happy") setMood(focusPhase === "focus" ? "writing" : "normal");
  }, 1200);
}

// "petted" peek: while you hover the idle ghost it turns curious and its eyes
// glance toward the cursor. Kept out of the `mood` state machine so it never
// clobbers a sulk / focus / bubble state.
let peeking = false;
let gaze = 0;        // -1 left · 0 center · 1 right — pupil glance while hovered
let transient = null; // brief one-off face ("yawn" | "surprised" | "scrunch"), outside `mood`
// when a hat is worn the grid grows to HROWS rows: the ghost sits in the bottom H
// rows (offset GYOFF) and the hat rises above it. Bare = 16 rows (no change, so the
// empty space above stays click-through). Coords match buildHat (crown at row ~10).
const HROWS = 24, GYOFF = 8;
function render(blink) {
  const face = transient || (peeking && mood === "normal" ? "curious" : mood);
  const gs = buildSprite(blink, face, gaze);
  const hatted = !!equippedHat;
  const rows = hatted ? HROWS : H;
  const off = hatted ? GYOFF : 0;
  const g = Array.from({ length: rows }, () => Array(W).fill("."));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (gs[y][x] !== ".") g[y + off][x] = gs[y][x];
  if (hatted)
    for (const [x, y, k] of withOutline(buildHat(equippedHat)))
      if (y >= 0 && y < rows && x >= 0 && x < W) g[y][x] = k;
  charEl.style.gridTemplateRows = `repeat(${rows}, var(--cell))`;
  paintGrid(charEl, g, W, rows, COLOR);
}

render(false);
// gentle blink every few seconds — gated on reduced-motion (it's real motion)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let blinkTimer;
function blinkOnce(then) {
  render(true);
  setTimeout(() => { render(false); then && then(); }, 150);
}
// irregular cadence (not a 4.2s metronome) + an occasional double-blink, so the
// resting ghost reads as alive rather than looping. Gated on reduced-motion.
function startBlink() {
  clearTimeout(blinkTimer);
  if (reduceMotion.matches) return;
  blinkTimer = setTimeout(() => {
    if (mood === "sleeping" || transient) { startBlink(); return; } // don't blink mid-yawn/asleep
    if (Math.random() < 0.2) blinkOnce(() => setTimeout(() => blinkOnce(startBlink), 190));
    else blinkOnce(startBlink);
  }, 2600 + Math.random() * 3800);
}
startBlink();
reduceMotion.addEventListener("change", () => { render(false); startBlink(); });

// ---- personality: glance, doze, wake, startle ----
// A brief one-off expression that settles back on its own. Reduced motion skips
// the face flash entirely (still runs `then`, so doze→sleep still happens).
let transientTimer;
function flash(expr, ms, then) {
  if (reduceMotion.matches) { then && then(); return; }
  clearTimeout(transientTimer);
  transient = expr;
  render(false);
  transientTimer = setTimeout(() => { transient = null; render(false); then && then(); }, ms);
}

// Doze off after a calm stretch with nothing going on. Driven by a reset timer,
// not a poll, so the resting ghost costs nothing.
const IDLE_MS = 3 * 60000; // ponytail: fixed 3 min; make a setting if anyone asks
let dozeTimer;
const idle = () => mood === "normal" && !currentId && focusPhase === "idle" && !peeking;
function scheduleDoze() { clearTimeout(dozeTimer); dozeTimer = setTimeout(tryDoze, IDLE_MS); }
function tryDoze() {
  if (!idle()) return;
  flash("yawn", 1000, () => { if (idle()) setMood("sleeping"); });
}
function wake() {
  const wasAsleep = mood === "sleeping";
  if (transient === "yawn") { clearTimeout(transientTimer); transient = null; }
  if (wasAsleep) setMood("normal"); else { scheduleDoze(); render(false); }
  if (wasAsleep) flash("surprised", 600); // a little startle on waking
}
scheduleDoze();

// pet the ghost: it wakes if asleep, else turns curious and tracks the cursor.
charEl.addEventListener("mouseenter", () => {
  if (mood === "sleeping") { wake(); return; }
  if (mood === "normal") { peeking = true; render(false); }
});
charEl.addEventListener("mousemove", (e) => {
  if (!peeking) return;
  const r = charEl.getBoundingClientRect();
  const rel = (e.clientX - r.left) / r.width;
  const g = rel < 0.4 ? -1 : rel > 0.6 ? 1 : 0;
  if (g !== gaze) { gaze = g; render(false); }
});
charEl.addEventListener("mouseleave", () => {
  if (peeking) { peeking = false; gaze = 0; render(false); }
  scheduleDoze();
});
// grabbed → a quick surprised startle (settles even mid-drag, so a missed mouseup
// can't leave it stuck wide-eyed)
charEl.addEventListener("mousedown", (e) => {
  if (mood === "sleeping") { wake(); return; }
  if (e.button !== 0) return; // left-drag scrunches; right-click just opens settings
  flash("scrunch", 700); // >.< squeeze on pickup
  scheduleDoze();
});

// ---- reminders ----
const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;

listen("char-cell", (e) => { localStorage.setItem(CELL_KEY, e.payload); setCell(e.payload); scheduleReport(); });

// click-through: report which rects are interactive (ghost + any visible bubble)
// so the rest of the transparent window passes clicks through to the app below.
// Padded to cover the bob/celebrate motion; rAF so layout is settled first.
function reportHit() {
  const pad = 12;
  const rects = [];
  for (const el of [charEl, bubble.classList.contains("show") ? bubble : null]) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    rects.push([r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2]);
  }
  invoke("set_hit_regions", { regions: rects });
}
const scheduleReport = () => requestAnimationFrame(reportHit);
scheduleReport(); // initial: ghost only

// apply launch-at-login pref on startup so the toggle persists across restarts
invoke("set_autostart", { enabled: localStorage.getItem("autostart") !== "0" });
// restore the to-do list window if it was left showing
invoke("set_todo_visible", { visible: localStorage.getItem("todoVisible") === "1" });

// cry timer: minutes a bubble can sit ignored before the ghost reacts. Settings
// pushes changes live; default 1 min (was hardcoded 60s).
let cryMs = (Number(localStorage.getItem("cryMins")) || 1) * 60000;
listen("cry-mins", (e) => { cryMs = Number(e.payload) * 60000; });

// nag timer: re-chime every N min while a reminder sits unacked (0 = off).
// Not `|| 5` — a stored "0" is a real value (off), not a missing default.
function readNagMs() {
  const v = localStorage.getItem("nagMins");
  return (v == null || v === "" ? 5 : Number(v)) * 60000;
}
let nagMs = readNagMs();
listen("nag-mins", (e) => { nagMs = Number(e.payload) * 60000; });

// ---- chime ----
// Gentle two-note WebAudio chime on fire — no audio asset to bundle. Mute state
// is mirrored from settings (same pattern as char-cell). Default: on.
const MUTE_KEY = "chimeMuted";
let muted = localStorage.getItem(MUTE_KEY) === "1";
listen("chime-toggle", (e) => { muted = !e.payload; localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); });

// idle chatter on/off (default on). Toggled live from settings, same pattern as chime.
let chatterOff = localStorage.getItem("chatterOff") === "1";
listen("chatter-toggle", (e) => { chatterOff = !e.payload; localStorage.setItem("chatterOff", chatterOff ? "1" : "0"); });

let audioCtx;
function chime() {
  if (muted) return;
  audioCtx = audioCtx || new AudioContext();
  const now = audioCtx.currentTime;
  [[660, 0], [880, 0.16]].forEach(([freq, at]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.45);
  });
}

const bubble = document.getElementById("bubble");
const bubbleText = bubble.querySelector(".text");
const bubbleHint = bubble.querySelector(".hint");
const bubbleLogo = bubble.querySelector(".agentlogo");
const AGENT_LOGO = { claude: "agent-claude.svg", codex: "agent-codex.svg" };
console.assert(AGENT_LOGO.claude && AGENT_LOGO.codex, "agent logos mapped");
// the hint reflects what clicking actually does — not always "dismiss"
const hintFor = (id) =>
  id === UPDATE_ID ? "click to update" :
  id === BREAK_ID ? "click to skip" :
  id === IDLE_ID || id === STREAK_ID || id === GREET_ID || id === FOCUSDONE_ID ? "" : // ambient / cheer — no call to action
  "click to dismiss"; // reminders + calendar nudges

// One bubble, but several reminders can be due at once. Queue them so each is
// shown and acked in turn — otherwise a second due reminder overwrites the
// first, which then stays stuck in the backend `active` set and never re-fires.
const queue = [];
let currentId = null;
let moodTimer;
let nagTimer; // setInterval re-chiming an unacked reminder; cleared with moodTimer
const UPDATE_ID = "__update__"; // sentinel: this bubble installs an update, not a reminder
const BREAK_ID = "__break__";   // sentinel: a Pomodoro break countdown (no ack, no sulk)
const IDLE_ID = "__idle__";     // sentinel: an ambient idle mutter (no ack, no sulk, no chime, auto-fades)
const STREAK_ID = "__streak__"; // sentinel: a day-streak milestone cheer (no ack, no sulk, chimes + celebrates, auto-fades)
const GREET_ID = "__greet__";       // sentinel: a once-a-day time-aware hello (silent celebrate, auto-fades)
const FOCUSDONE_ID = "__focusdone__"; // sentinel: a proud cheer when a focus block completes (silent celebrate, auto-fades)

function showNext() {
  clearTimeout(moodTimer);
  clearInterval(nagTimer);
  const next = queue.shift();
  if (!next) {
    currentId = null;
    bubble.classList.remove("show");
    if (mood === "sad" || mood === "angry") setMood("normal");
    else scheduleDoze(); // back to idle — restart the doze countdown
    scheduleReport(); // bubble gone — shrink the clickable area back to the ghost
    return;
  }
  currentId = next.id;
  bubbleText.textContent = next.label;
  bubbleHint.textContent = hintFor(next.id);
  if (next.agent && AGENT_LOGO[next.agent]) {
    bubbleLogo.src = AGENT_LOGO[next.agent];
    bubbleLogo.hidden = false;
  } else {
    bubbleLogo.hidden = true;
  }
  bubble.classList.add("show");
  scheduleReport(); // bubble now interactive — include it
  // idle mutters, greetings, and focus cheers are silent
  if (next.id !== IDLE_ID && next.id !== GREET_ID && next.id !== FOCUSDONE_ID) chime();
  // ignored too long → ghost gets sad, or angry+flames for poltergeist reminders
  // (update + calendar + agent + idle/greet/focus bubbles don't sulk — they just react on show)
  if (next.id === IDLE_ID) {
    moodTimer = setTimeout(showNext, 5000); // ambient — fades on its own after ~5s
  } else if (next.id === STREAK_ID || next.id === GREET_ID || next.id === FOCUSDONE_ID) {
    celebrate(); // cheer/greeting: happy bounce, then fades on its own (streak chimes; greet/focus are silent)
    moodTimer = setTimeout(showNext, 5000);
  } else if (next.id.startsWith("__agent__")) {
    if (next.kind === "needs-action") setMood("angry"); // lights #flames (see setMood)
    else celebrate(); // finished → happy bounce
  } else if (next.id !== UPDATE_ID && next.id !== BREAK_ID && !next.id.startsWith("__cal__")) {
    moodTimer = setTimeout(() => setMood(next.poltergeist ? "angry" : "sad"), cryMs);
    // keep nudging by sound until acked (chime() self-mutes if chimes are off)
    if (nagMs > 0) nagTimer = setInterval(chime, nagMs);
  }
}

listen("reminder-due", (e) => {
  queue.push(e.payload);
  wake(); // a nudge stirs the ghost if it had dozed off
  if (!currentId) showNext();
});

// Ambient idle chatter: every so often the resting ghost mutters to itself. Purely
// for personality — silent, no ack, auto-fades (see IDLE_ID handling in showNext).
const IDLE_LINES = [
  "...bored", "psst — water?", "still slouching 👀", "boo.", "hi :)",
  "you good?", "*floats*", "stretch time?", "sip sip", "don't forget to blink",
  "cozy in here", "back straight!", "*wiggles*",
];
console.assert(IDLE_LINES.length > 0, "idle line pool must be non-empty");
function scheduleChatter() {
  // ponytail: random 4–8 min; a self-rescheduling timeout, not a poll (matches scheduleDoze)
  setTimeout(() => {
    if (!chatterOff && idle()) { // off via settings, or never interrupt a real bubble / sleep / focus / hover
      queue.push({ id: IDLE_ID, label: IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)] });
      if (!currentId) showNext();
    }
    scheduleChatter();
  }, (4 + Math.random() * 4) * 60000);
}
scheduleChatter();

// Day streak: consecutive calendar days on which you acked at least one real
// reminder. Kept in localStorage (shared with the settings display via
// `streak-changed`). A milestone lands a one-off cheer bubble.
// Collectible hats, one per day-streak milestone. Unlocked permanently by the
// best streak ever (see bumpStreak). Rendered by buildHat; equipped via settings.
const HATS = [
  { id: "bow",    streak: 3,   emoji: "🎀", label: "bow" },
  { id: "cap",    streak: 7,   emoji: "🧢", label: "cap" },
  { id: "crown",  streak: 14,  emoji: "👑", label: "crown" },
  { id: "tophat", streak: 30,  emoji: "🎩", label: "top hat" },
  { id: "witch",  streak: 60,  emoji: "🧙", label: "witch hat" },
  { id: "halo",   streak: 100, emoji: "😇", label: "halo" },
];
const STREAK_MILESTONES = HATS.map((h) => h.streak);
const localDay = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
function bumpStreak() {
  const today = localDay(new Date());
  const yest = localDay(new Date(Date.now() - 86400000));
  const last = localStorage.getItem("streakLastDate");
  if (last === today) return; // already counted a reminder today
  const count = last === yest ? Number(localStorage.getItem("streakCount") || 0) + 1 : 1;
  localStorage.setItem("streakCount", count);
  const best = Math.max(count, Number(localStorage.getItem("bestStreak") || 0));
  localStorage.setItem("bestStreak", best);
  localStorage.setItem("streakLastDate", today);
  emit("streak-changed"); // refresh the settings display if it's open
  const hat = HATS.find((h) => h.streak === count);
  if (hat) {
    queue.push({ id: STREAK_ID, label: `🔥 ${count}-day streak! ${hat.emoji} ${hat.label} unlocked — see settings` });
    if (!currentId) showNext();
  }
}
console.assert(STREAK_MILESTONES.includes(7) && !STREAK_MILESTONES.includes(5), "streak milestone lookup");

// Backfill best-ever from any existing streak so a user upgrading mid-streak
// sees their earned hats immediately (bumpStreak only writes bestStreak on ack).
localStorage.setItem("bestStreak", String(Math.max(
  Number(localStorage.getItem("bestStreak") || 0),
  Number(localStorage.getItem("streakCount") || 0),
)));

// Daily greeting: a once-per-day, time-aware hello the first time the ghost loads
// today (fires on login auto-start each morning). Silent celebrate, auto-fades.
(function greetOncePerDay() {
  const today = localDay(new Date());
  if (localStorage.getItem("lastGreetDate") === today) return;
  localStorage.setItem("lastGreetDate", today);
  const h = new Date().getHours();
  const line = h < 12 ? "morning ☀️" : h < 17 ? "afternoon ☀️" : h < 21 ? "evening 🌙" : "working late? 🌙";
  console.assert(["morning ☀️", "afternoon ☀️", "evening 🌙", "working late? 🌙"].includes(line), "greeting maps to a known line");
  setTimeout(() => { queue.push({ id: GREET_ID, label: line }); if (!currentId) showNext(); }, 1500);
})();

// Focus reward: a proud, count-aware cheer each time a focus block completes.
// Sessions counted per day in localStorage. Silent celebrate, auto-fades.
function rewardFocus() {
  const today = localDay(new Date());
  const n = localStorage.getItem("focusDate") === today ? Number(localStorage.getItem("focusCount") || 0) + 1 : 1;
  localStorage.setItem("focusDate", today);
  localStorage.setItem("focusCount", n);
  const line = n === 1 ? "nice focus 💪" : n === 2 ? "2 sessions 🔥" : `${n} done — machine 🚀`;
  queue.push({ id: FOCUSDONE_ID, label: line });
  if (!currentId) showNext();
}

bubble.addEventListener("click", async () => {
  if (!currentId) return;
  clearTimeout(moodTimer);
  clearInterval(nagTimer);
  if (currentId === UPDATE_ID) {
    bubbleText.textContent = "updating…";
    try {
      await invoke("install_update"); // app relaunches on success
    } catch (e) {
      bubbleText.textContent = "update failed";
      setTimeout(showNext, 1600); // don't leave the bubble stuck
    }
    return;
  }
  // idle mutter / streak cheer / greeting / focus cheer — no backing reminder, just dismiss early.
  if (currentId === IDLE_ID || currentId === STREAK_ID || currentId === GREET_ID || currentId === FOCUSDONE_ID) {
    showNext();
    return;
  }
  // calendar nudges have no backing reminder — just dismiss (no ack_reminder).
  if (currentId.startsWith("__cal__")) {
    celebrate();
    showNext();
    return;
  }
  // agent pings have no backing reminder — just dismiss (no ack_reminder).
  if (currentId.startsWith("__agent__")) {
    celebrate();
    showNext();
    return;
  }
  // break bubble: click skips the rest of the break, straight back to focus.
  if (currentId === BREAK_ID) {
    showNext();   // drop the break bubble
    enterFocus(); // next focus block (the 1s tick keeps running)
    return;
  }
  await invoke("ack_reminder", { id: currentId });
  bumpStreak(); // only real reminders count toward the day streak
  celebrate();
  showNext();
});

// Rust found a newer GitHub release — show a one-off "update ready" bubble.
listen("update-available", (e) => {
  queue.push({ id: UPDATE_ID, label: `✨ v${e.payload} ready — click to update` });
  if (!currentId) showNext();
});

charEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  invoke("open_settings");
});

// ---- focus timer (Pomodoro) ----
// Loops focus → break until stopped. Focus = the writing animation; break = a
// live countdown bubble (reuses the queue via the BREAK_ID sentinel). The ghost
// owns the running timer; settings just toggles it and shows `focus-status`.
// A running session is ephemeral — not restored after an app restart (YAGNI).
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
console.assert(fmt(0) === "0:00" && fmt(65) === "1:05" && fmt(605) === "10:05", "fmt broken");

let focusMins = Number(localStorage.getItem("focusMins")) || 25;
let breakMins = Number(localStorage.getItem("breakMins")) || 5;
let focusLoops = Number(localStorage.getItem("focusLoops")) || 0; // 0 = endless
let loopsDone = 0;       // focus blocks completed this session
let focusPhase = "idle"; // "idle" | "focus" | "break"
let focusLeft = 0;       // seconds left in the current phase
let phaseEnd = 0;        // wall-clock ms when the current phase ends
let focusTimer = null;   // 1s tick

function emitFocusStatus() {
  const lap = focusLoops ? ` · ${Math.min(loopsDone + 1, focusLoops)}/${focusLoops}` : "";
  emit("focus-status", focusPhase === "focus" ? `focusing · ${fmt(focusLeft)}${lap}`
    : focusPhase === "break" ? `break · ${fmt(focusLeft)}${lap}` : "idle");
}

function enterFocus() {
  focusPhase = "focus";
  focusLeft = focusMins * 60;
  phaseEnd = Date.now() + focusLeft * 1000;
  setMood("writing"); // shows the focus notebook (the .writing class + startPad)
  emitFocusStatus();
}
function enterBreak() {
  focusPhase = "break";
  focusLeft = breakMins * 60;
  phaseEnd = Date.now() + focusLeft * 1000;
  setMood("happy"); // drops the .writing class → notepad hides
  queue.push({ id: BREAK_ID, label: `🌙 break · ${fmt(focusLeft)}` });
  if (!currentId) showNext();
  emitFocusStatus();
}
function dropBreakBubble() {
  if (currentId === BREAK_ID) showNext();
  else { const i = queue.findIndex((q) => q.id === BREAK_ID); if (i >= 0) queue.splice(i, 1); }
}

function tickFocus() {
  // derive remaining time from the wall clock, not tick counts — WebView2
  // throttles timers and sleep/resume would otherwise stretch a "25 min" block
  focusLeft = Math.max(0, Math.round((phaseEnd - Date.now()) / 1000));
  if (focusPhase === "break" && currentId === BREAK_ID)
    bubbleText.textContent = `🌙 break · ${fmt(focusLeft)}`;
  emitFocusStatus();
  if (focusLeft <= 0) {
    if (focusPhase === "focus") {
      loopsDone++;
      if (focusLoops && loopsDone >= focusLoops) { stopFocus(); rewardFocus(); } // loop target hit — end on the cheer, skip the break
      else { rewardFocus(); enterBreak(); } // proud cheer, then the break
    } else { dropBreakBubble(); enterFocus(); }
  }
}

function startFocus() {
  clearInterval(focusTimer);
  loopsDone = 0;
  enterFocus();
  focusTimer = setInterval(tickFocus, 1000);
}
function stopFocus() {
  clearInterval(focusTimer); focusTimer = null;
  dropBreakBubble();
  focusPhase = "idle"; focusLeft = 0;
  if (mood === "writing" || mood === "happy") setMood("normal");
  emitFocusStatus();
}

listen("focus-toggle", (e) => (e.payload ? startFocus() : stopFocus()));
listen("focus-durations", (e) => {
  focusMins = Math.max(1, Number(e.payload.focus) || focusMins);
  breakMins = Math.max(1, Number(e.payload.break) || breakMins);
  const l = Number(e.payload.loops); // 0 is a valid value (endless), so no || fallback
  if (Number.isFinite(l)) focusLoops = Math.max(0, l);
});
listen("hat-changed", (e) => { equippedHat = e.payload || ""; localStorage.setItem("ghostHat", equippedHat); render(false); });
