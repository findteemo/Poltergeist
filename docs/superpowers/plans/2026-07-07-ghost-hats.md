# Ghost Hats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ghost collectible pixel hats, unlocked permanently by day-streak milestones and equipped from a settings picker.

**Architecture:** Frontend-only. A hat is sparse overlay cells drawn into the top rows (y=0..2) of the existing 16×16 ghost grid, above the dome, in `render()`. Unlocks derive from a new `localStorage.bestStreak` (highest streak ever). The settings tab gets an emoji-swatch picker; the equipped id lives in `localStorage.ghostHat` and is pushed live to the char window via a `hat-changed` event, mirroring the existing `theme-changed`/`chatter-toggle` pattern.

**Tech Stack:** Plain static HTML/CSS/JS (no build step, no module system), Tauri event bus (`window.__TAURI__.event`), Node for the logic self-check.

## Global Constraints

- **No Rust changes.** No config-dir/`reminders.json`/`todos.json` touch. Hats are pure local cosmetic state in `localStorage`.
- **Runtime-only cosmetic.** Do NOT touch `src-tauri/scripts/make_icon.js` — the exe/window icon renders the bare `normal` ghost with no hat, like the personality moods.
- **No new dependencies.** Frontend has no module system; shared constants are duplicated across files (house style — `make_icon.js` duplicates `buildSprite`, test scripts mirror logic). Mark each duplicate with a `// ponytail:` note pointing at the source of truth (`main.js`).
- **Theme-safe palette:** hat colors are defined once on `:root` as `var()` references to already-themed palette vars, so they recolor per theme for free (no per-theme block edits).
- **The canonical hat list (id / streak / emoji / label), same order everywhere:**
  | id | streak | emoji | label |
  |----|--------|-------|-------|
  | `bow` | 3 | 🎀 | bow |
  | `cap` | 7 | 🧢 | cap |
  | `crown` | 14 | 👑 | crown |
  | `tophat` | 30 | 🎩 | top hat |
  | `witch` | 60 | 🧙 | witch hat |
  | `halo` | 100 | 😇 | halo |

---

### Task 1: Best-ever streak tracking + unlock derivation + cheer text

**Files:**
- Modify: `src/main.js` (the `bumpStreak` block, ~lines 416–435)
- Test: `src-tauri/scripts/test_hats.js` (create)

**Interfaces:**
- Produces: `localStorage.bestStreak` (int string, highest streak ever reached). Consumed by the settings picker (Task 3) to decide which hats are unlocked.
- Produces: the canonical `HATS` array shape `{ id, streak, emoji, label }` — Tasks 2 and 3 re-declare their own copies (house style).

- [ ] **Step 1: Write the failing logic self-check**

Create `src-tauri/scripts/test_hats.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it passes standalone**

Run: `node src-tauri/scripts/test_hats.js`
Expected: `ok: hats unlock at the right streaks` (this test mirrors the logic, so it passes immediately — it guards against future drift, like `test_queue.js`).

- [ ] **Step 3: Add the `HATS` constant + `bestStreak` bump + cheer text in `main.js`**

In `src/main.js`, find the streak block (currently):

```js
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
```

Replace that line with a single source of truth derived from the hats, and keep `STREAK_MILESTONES` working as before:

```js
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
```

Then in `bumpStreak()`, after `localStorage.setItem("streakCount", count);`, record the best-ever streak:

```js
  localStorage.setItem("streakCount", count);
  const best = Math.max(count, Number(localStorage.getItem("bestStreak") || 0));
  localStorage.setItem("bestStreak", best);
```

And change the milestone cheer to name the freshly-unlocked hat. Replace:

```js
  if (STREAK_MILESTONES.includes(count)) {
    queue.push({ id: STREAK_ID, label: `🔥 ${count}-day streak!` });
    if (!currentId) showNext();
  }
```

with:

```js
  const hat = HATS.find((h) => h.streak === count);
  if (hat) {
    queue.push({ id: STREAK_ID, label: `🔥 ${count}-day streak! ${hat.emoji} ${hat.label} unlocked — see settings` });
    if (!currentId) showNext();
  }
```

- [ ] **Step 4: Run the existing frontend checks to confirm nothing broke**

Run: `node src-tauri/scripts/test_hats.js && node src-tauri/scripts/test_queue.js`
Expected: both print their `ok:` line. (`main.js` runs in the browser; these node scripts mirror its logic — the edit above keeps `STREAK_MILESTONES` identical, so `test_queue.js` and the in-file `console.assert` on line ~435 still hold.)

- [ ] **Step 5: Commit**

```bash
git add src/main.js src-tauri/scripts/test_hats.js
git commit -m "feat: track best-ever streak, unlock hats at milestones"
```

---

### Task 2: Hat sprites, palette, and render overlay

**Files:**
- Modify: `src/main.js` (`COLOR` map ~line 61; add `buildHat` + `equippedHat` state; `render` ~line 168; a `hat-changed` listener near the other `listen(...)` calls ~line 296)
- Modify: `src/tokens.css` (`:root` block — add two vars)

**Interfaces:**
- Consumes: the `HATS` array from Task 1 (already in `main.js`).
- Produces: `buildHat(id)` → array of `[x, y, key]` cells (sparse; keys are `COLOR` keys). `let equippedHat` (string, `""` = none) read from `localStorage.ghostHat`. A `hat-changed` event handler that re-reads and re-renders. Task 3 emits `hat-changed`.

- [ ] **Step 1: Add hat palette vars to `tokens.css`**

In `src/tokens.css`, inside the `:root { … }` block (after `--tear:` is fine), add:

```css
  /* hat cosmetic (main.js buildHat) — var() refs to already-themed palette
     vars, so hats recolor per theme for free without per-theme overrides */
  --hat: var(--purple-bright);
  --hat-shade: var(--purple);
```

Do NOT add these to the `matcha`/`sundae`/`slate` blocks — they inherit and resolve to each theme's `--purple-bright`/`--purple` automatically.

- [ ] **Step 2: Add hat color keys to `COLOR` in `main.js`**

In `src/main.js`, the `COLOR` map (~line 61) becomes:

```js
const COLOR = {
  b: "var(--ghost)", s: "var(--ghost-shade)", o: "var(--ghost-outline)",
  e: "var(--eye)", p: "var(--blush)", t: "var(--tear)",
  H: "var(--hat)", h: "var(--hat-shade)",
};
```

- [ ] **Step 3: Add `buildHat` and the `equippedHat` state**

In `src/main.js`, right after `buildSprite`'s closing brace / the `COLOR` map, add:

```js
// Hat overlay cells drawn into the top rows (y=0..2) of the ghost grid, above
// the dome (dome crown starts at y=2, ~x5..10). Sparse [x, y, key] list; keys
// are COLOR keys. Runtime-only — NOT mirrored in scripts/make_icon.js.
function buildHat(id) {
  switch (id) {
    case "bow": return [
      [5,0,"H"],[6,0,"H"],[9,0,"H"],[10,0,"H"],
      [5,1,"H"],[6,1,"H"],[7,1,"p"],[8,1,"p"],[9,1,"H"],[10,1,"H"],
    ];
    case "cap": return [
      [6,0,"H"],[7,0,"H"],[8,0,"H"],[9,0,"H"],
      [5,1,"H"],[6,1,"H"],[7,1,"H"],[8,1,"H"],[9,1,"H"],[10,1,"H"],
      [11,2,"h"],[12,2,"h"],[13,2,"h"], // brim poking right
    ];
    case "crown": return [
      [5,0,"H"],[5,1,"H"], [7,0,"H"],[8,0,"H"],[7,1,"H"],[8,1,"H"], [10,0,"H"],[10,1,"H"], // three teeth
      [5,2,"H"],[6,2,"H"],[7,2,"H"],[8,2,"H"],[9,2,"H"],[10,2,"H"],  // band
      [6,1,"p"],[9,1,"p"], // gems
    ];
    case "tophat": return [
      [6,0,"H"],[7,0,"H"],[8,0,"H"],[9,0,"H"],
      [6,1,"H"],[7,1,"p"],[8,1,"p"],[9,1,"H"], // hatband accent
      [4,2,"h"],[5,2,"h"],[6,2,"h"],[7,2,"h"],[8,2,"h"],[9,2,"h"],[10,2,"h"],[11,2,"h"], // brim
    ];
    case "witch": return [
      [7,0,"H"],                       // pointed tip
      [6,1,"H"],[7,1,"H"],[8,1,"H"],   // cone narrows
      [4,2,"h"],[5,2,"h"],[6,2,"H"],[7,2,"H"],[8,2,"H"],[9,2,"H"],[10,2,"h"],[11,2,"h"], // wide brim
    ];
    case "halo": return [
      [6,0,"H"],[7,0,"H"],[8,0,"H"],[9,0,"H"], // ring top
      [5,1,"H"],[10,1,"H"],                    // ring sides (floats — gap to dome at y2)
    ];
    default: return [];
  }
}
console.assert(buildHat("crown").length > 0 && buildHat("nope").length === 0, "buildHat known vs unknown");

// equipped hat id ("" = none), remembered locally; pushed live from settings
let equippedHat = localStorage.getItem("ghostHat") || "";
```

- [ ] **Step 4: Overlay the hat in `render`**

In `src/main.js`, replace `render` (~line 168):

```js
function render(blink) {
  const face = transient || (peeking && mood === "normal" ? "curious" : mood);
  const g = buildSprite(blink, face, gaze);
  if (equippedHat)
    for (const [x, y, k] of buildHat(equippedHat))
      if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = k;
  paintGrid(charEl, g, W, H, COLOR);
}
```

- [ ] **Step 5: Live-update on `hat-changed`**

In `src/main.js`, near the other `listen(...)` calls (e.g. after the `chatter-toggle` listener ~line 300), add:

```js
listen("hat-changed", (e) => { equippedHat = e.payload || ""; localStorage.setItem("ghostHat", equippedHat); render(false); });
```

- [ ] **Step 6: Run the self-checks + launch to eyeball the hats**

Run: `node src-tauri/scripts/test_hats.js`
Expected: still `ok:`.

Then manually verify (the real test — pixel art has no unit test): in devtools of the running app set `localStorage.ghostHat = "crown"` and call `render(false)` (or run `cd src-tauri && cargo run`, set a hat via the picker in Task 3). Expected: a crown sits on the ghost's head; switching theme recolors it; no hat clips the face (all cells are y≤2, face starts at y=7).

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/tokens.css
git commit -m "feat: render equipped hat on the ghost, themed palette"
```

---

### Task 3: Settings picker

**Files:**
- Modify: `src/settings.html` (settings tab — add a hat picker row after the streak row ~line 382)
- Modify: `src/settings.js` (wire the picker; near the streak display ~line 27–40)

**Interfaces:**
- Consumes: `localStorage.bestStreak` (Task 1) to decide unlocked hats; `localStorage.ghostHat` for the current selection.
- Produces: emits `hat-changed` with the chosen id (`""` for none), consumed by Task 2's listener. Writes `localStorage.ghostHat`.

- [ ] **Step 1: Add the picker markup**

In `src/settings.html`, after the streak `sizerow` (the `<div class="sizerow"><span>streak</span>…</div>`, ~line 379–382), add:

```html
      <div class="hatrow">
        <span>hat</span>
        <div id="hats" class="hats" role="radiogroup" aria-label="ghost hat"></div>
      </div>
```

- [ ] **Step 2: Add minimal picker styles**

In `src/settings.html` there is an inline `<style>` / or the window links a stylesheet — add these rules to the settings styles (put them next to the other `.sizerow` rules; if settings uses `src/style.css`, add there, otherwise in the settings `<style>` block):

```css
.hatrow { display: flex; align-items: center; gap: .5rem; padding: .35rem 0; }
.hats { display: flex; flex-wrap: wrap; gap: .3rem; }
.hats button {
  font: inherit; font-size: 1.05rem; line-height: 1; cursor: pointer;
  background: var(--row); color: var(--text);
  border: 2px solid var(--border); border-radius: 6px; padding: .2rem .35rem;
}
.hats button[aria-checked="true"] { border-color: var(--purple-bright); background: var(--row-hover); }
.hats button:disabled { opacity: .4; cursor: not-allowed; }
.hats .none { font-size: .8rem; }
```

- [ ] **Step 3: Populate + wire the picker in `settings.js`**

In `src/settings.js`, near the streak display code (~line 27–40), add:

```js
// hat picker: emoji swatches, unlocked by best-ever streak (localStorage.bestStreak,
// kept by main.js bumpStreak). Equip writes localStorage.ghostHat + emits hat-changed.
// ponytail: HATS mirrors the source of truth in src/main.js (no module system).
const HATS = [
  { id: "bow",    streak: 3,   emoji: "🎀", label: "bow" },
  { id: "cap",    streak: 7,   emoji: "🧢", label: "cap" },
  { id: "crown",  streak: 14,  emoji: "👑", label: "crown" },
  { id: "tophat", streak: 30,  emoji: "🎩", label: "top hat" },
  { id: "witch",  streak: 60,  emoji: "🧙", label: "witch hat" },
  { id: "halo",   streak: 100, emoji: "😇", label: "halo" },
];
const hatsEl = document.getElementById("hats");
function renderHats() {
  const best = Number(localStorage.getItem("bestStreak") || 0);
  const equipped = localStorage.getItem("ghostHat") || "";
  hatsEl.textContent = "";
  const mk = (id, text, title, on, disabled) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text; b.title = title;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(on));
    if (disabled) b.disabled = true;
    b.addEventListener("click", () => {
      localStorage.setItem("ghostHat", id);
      emit("hat-changed", id);
      renderHats();
    });
    return b;
  };
  const none = mk("", "none", "no hat", equipped === "", false);
  none.classList.add("none");
  hatsEl.appendChild(none);
  for (const h of HATS) {
    const unlocked = best >= h.streak;
    hatsEl.appendChild(mk(
      unlocked ? h.id : "",                                   // locked click is a no-op via disabled
      unlocked ? h.emoji : `🔒${h.streak}`,
      unlocked ? h.label : `${h.label} — reach a ${h.streak}-day streak`,
      unlocked && equipped === h.id,
      !unlocked,
    ));
  }
}
renderHats();
listen("streak-changed", renderHats); // a milestone may have just unlocked one
```

Note: `emit` and `listen` must already be in scope in `settings.js` (they are — the file uses `emit("theme-changed", …)` and `listen("streak-changed", …)`). Reuse the existing imports; do not re-declare them.

- [ ] **Step 4: Verify the picker end-to-end**

Run: `cd src-tauri && cargo run`
Then, with the app running, open devtools on the settings window and run `localStorage.setItem("bestStreak", 14)`, reopen settings (or re-trigger `renderHats()`), and confirm: 🎀 🧢 👑 are enabled, 🎩 🧙 😇 show `🔒30`/`🔒60`/`🔒100` and are disabled, `none` is selected by default. Click 👑 — the ghost gains a crown immediately (Task 2's listener), the crown swatch shows the selected border. Click `none` — hat disappears. Reload the app — the equipped hat persists.

- [ ] **Step 5: Commit**

```bash
git add src/settings.html src/settings.js
git commit -m "feat: hat picker in settings (emoji swatches, locked by streak)"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Ghost moods section + Persistence section)

**Interfaces:** none (docs only).

- [ ] **Step 1: Document hats in `ARCHITECTURE.md`**

In `docs/ARCHITECTURE.md`, at the end of the **Ghost moods (frontend)** section (after the Focus-reward bullet), add:

```markdown
- **Hats (cosmetic).** `HATS` (`main.js`) maps each day-streak milestone
  (3/7/14/30/60/100) to a collectible hat (`bow`/`cap`/`crown`/`tophat`/`witch`/
  `halo`). `bumpStreak` records the best streak ever in `localStorage.bestStreak`;
  a hat is unlocked iff `bestStreak >= its milestone` (permanent — a broken streak
  never re-locks it). Hitting a milestone appends the unlock to the `__streak__`
  cheer. `buildHat(id)` returns sparse `[x,y,key]` overlay cells drawn into the top
  rows (y=0..2, above the dome) in `render()`, after `buildSprite`. Palette keys
  `H`/`h` map to `--hat`/`--hat-shade` in `tokens.css` — defined once on `:root` as
  `var()` refs to `--purple-bright`/`--purple`, so hats recolor per theme for free.
  **Runtime-only** — `scripts/make_icon.js` is NOT touched (icon stays bare). The
  settings tab has an emoji-swatch picker (locked hats show `🔒<streak>`); the
  equipped id lives in `localStorage.ghostHat` and pushes live via the
  `hat-changed` event (same pattern as `theme-changed`). Self-check:
  `scripts/test_hats.js`.
```

In the **Persistence** section, in the note about `localStorage`, append `bestStreak` (highest streak ever, drives hat unlocks) and `ghostHat` (equipped hat id, `""` = none) to the list of char-window localStorage keys.

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: document ghost hats"
```

---

## Notes for the implementer

- **Do not rebuild the installer** as part of this plan — that's a release step. `cargo run` is enough to eyeball hats during development. (The CLAUDE.md rule about rebuilding the installer applies when shipping a release, not per-task.)
- The hat pixel coordinates are approximations authored here; if a hat reads badly on screen, adjust the `[x,y,key]` cells in `buildHat` freely — the grid is x=0..15, y=0..2 for hats, dome crown ~x5..10 at y=2.
- Keep the `HATS` array identical in `main.js`, `settings.js`, and the streak map in `test_hats.js`. If you add/rename a hat, update all three (grep `HATS` / `HAT_STREAKS`).
