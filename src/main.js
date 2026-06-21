// cozy companion — character window
const W = 16, H = 16;

// Build a little floating ghost on a 16x16 grid (CC0, authored here).
// Returns a grid of palette keys; '.' = transparent.
// mood: "normal" | "happy" | "sad" — changes eyes + mouth (+ a tear when sad).
function buildSprite(blink, mood) {
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
  if (blink) { put(5, 8, "o"); put(10, 8, "o"); }
  else if (mood === "happy") { // ^ ^ curved-up eyes
    put(4, 8, "e"); put(5, 7, "e"); put(6, 8, "e");
    put(9, 8, "e"); put(10, 7, "e"); put(11, 8, "e");
  } else {
    put(5, 7, "e"); put(5, 8, "e"); put(10, 7, "e"); put(10, 8, "e");
    if (mood === "sad") { put(11, 11, "t"); put(11, 12, "t"); } // tear down the cheek
  }
  // mouth (none when normal)
  if (mood === "happy") { put(6, 11, "o"); put(7, 12, "o"); put(8, 12, "o"); put(9, 11, "o"); } // smile
  else if (mood === "sad") { put(6, 12, "o"); put(7, 11, "o"); put(8, 11, "o"); put(9, 12, "o"); } // frown
  put(4, 10, "p"); put(11, 10, "p"); // blush
  return g;
}

const COLOR = {
  b: "var(--ghost)", s: "var(--ghost-shade)", o: "var(--ghost-outline)",
  e: "var(--eye)", p: "var(--blush)", t: "var(--tear)",
};

const charEl = document.getElementById("char");

// ghost size: cell px set from settings; remembered locally so it survives restart
const CELL_KEY = "charCell";
const setCell = (px) => document.documentElement.style.setProperty("--cell", px + "px");
setCell(localStorage.getItem(CELL_KEY) || 9);

let mood = "normal";
function setMood(m) {
  mood = m;
  charEl.classList.toggle("sad", m === "sad");
  render(false);
}
// quick happy hop on dismiss, then settle back to normal
function celebrate() {
  setMood("happy");
  charEl.classList.add("celebrate");
  setTimeout(() => {
    charEl.classList.remove("celebrate");
    if (mood === "happy") setMood("normal");
  }, 1200);
}

function render(blink) {
  const g = buildSprite(blink, mood);
  charEl.replaceChildren();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cell = document.createElement("div");
      cell.className = "px";
      if (g[y][x] !== ".") cell.style.background = COLOR[g[y][x]];
      charEl.appendChild(cell);
    }
}

render(false);
// gentle blink every few seconds
setInterval(() => { render(true); setTimeout(() => render(false), 160); }, 4200);

// ---- reminders ----
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

listen("char-cell", (e) => { localStorage.setItem(CELL_KEY, e.payload); setCell(e.payload); });

// ---- chime ----
// Gentle two-note WebAudio chime on fire — no audio asset to bundle. Mute state
// is mirrored from settings (same pattern as char-cell). Default: on.
const MUTE_KEY = "chimeMuted";
let muted = localStorage.getItem(MUTE_KEY) === "1";
listen("chime-toggle", (e) => { muted = !e.payload; localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); });

let audioCtx;
function chime() {
  if (muted) return;
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
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

// One bubble, but several reminders can be due at once. Queue them so each is
// shown and acked in turn — otherwise a second due reminder overwrites the
// first, which then stays stuck in the backend `active` set and never re-fires.
const queue = [];
let currentId = null;
let sadTimer;

function showNext() {
  clearTimeout(sadTimer);
  const next = queue.shift();
  if (!next) {
    currentId = null;
    bubble.classList.remove("show");
    if (mood === "sad") setMood("normal");
    return;
  }
  currentId = next.id;
  bubbleText.textContent = next.label;
  bubble.classList.add("show");
  chime();
  sadTimer = setTimeout(() => setMood("sad"), 60000); // ignored too long → ghost gets sad
}

listen("reminder-due", (e) => {
  queue.push(e.payload);
  if (!currentId) showNext();
});

bubble.addEventListener("click", async () => {
  if (!currentId) return;
  clearTimeout(sadTimer);
  await invoke("ack_reminder", { id: currentId });
  celebrate();
  showNext();
});

charEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  invoke("open_settings");
});
