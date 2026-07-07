# Ghost hats — design

**Date:** 2026-07-07
**Status:** approved, pending implementation
**Scope:** frontend-only (no Rust). Adds a cosmetic hat that sits on the ghost,
unlocked by day-streak milestones, equipped from a settings picker.

## Goal

Give the ghost collectible pixel hats as a reward for keeping day streaks. Pure
cosmetic — no effect on reminders, focus, or moods. Hats persist and recolor
with the active theme.

## Unlock model

- Hats unlock at the **existing** `STREAK_MILESTONES` (3 / 7 / 14 / 30 / 60 / 100),
  one hat per milestone:

  | Milestone | Hat id  | Look |
  |-----------|---------|------|
  | 3         | `bow`   | little bow |
  | 7         | `cap`   | ball cap |
  | 14        | `crown` | crown |
  | 30        | `tophat`| top hat |
  | 60        | `witch` | witch hat (tallest — pokes into row 0) |
  | 100       | `halo`  | halo (floats just above the dome) |

- Unlock is **permanent / best-ever**: a hat stays unlocked even if the streak
  later breaks. Requires a new `localStorage` key `bestStreak` (int), bumped in
  `bumpStreak()` whenever `streakCount` exceeds it. A hat `id` is unlocked iff
  `bestStreak >= its milestone`.
- No separate "unlocked list" is stored — the unlocked set is derived from
  `bestStreak` every time it's needed (monotonic, so derivation is exact).

## Rendering

- New `buildHat(name)` in `main.js` returns a sparse overlay: an array of
  `[x, y, key]` cells (not a full grid) drawn into the **top rows (y = 0..2)** of
  the existing 16×16 ghost grid, above the dome (dome starts at y=2). The witch
  cone may use y=0; the halo sits at y=0 as a ring.
- Overlaid in `render()` **after** `buildSprite(...)` paints, by writing the hat
  cells onto the same grid before `paintGrid`. Hats draw on top of the dome edge
  where they overlap (a hat brim covers the crown outline — intended).
- No grid resize, no window-geometry change. The ghost is anchored bottom-center
  in a 240×260 window with empty headroom, so drawing into rows 0–2 is safe.
- **Runtime-only** cosmetic — like the personality moods. `scripts/make_icon.js`
  is **not** touched; the exe/window icon renders the bare `normal` ghost. (No
  sync burden — noted so a future reader doesn't "fix" the icon to match.)

### Palette

- Add hat color keys to `COLOR` in `main.js`, e.g. `H` (hat main) / `h` (hat
  shade) / reuse existing `o` (outline), `e`/`p` for accents where a hat needs
  them (crown gems, bow knot).
- Colors come from **new `tokens.css` `:root` vars** (e.g. `--hat`, `--hat-shade`)
  so hats recolor per theme like the ghost cells already do. Each theme block
  (`matcha`/`sundae`/`slate`) may override them; if omitted they inherit the
  default spectral values. Keep it to 1–2 new vars — most hats reuse `--ghost-
  outline` and accent vars.

## Equip / picker (settings)

- New control in the settings **settings tab**, near the streak display and theme
  dropdown: a row of small hat swatches.
  - Unlocked hat → clickable; click to equip. Equipped one is highlighted.
  - Locked hat → dimmed, shows the streak number required (e.g. "🔒 30").
  - A **"none"** option to go hatless (default).
- Equipped choice persists in `localStorage` key `ghostHat` (hat id or `""`).
- Changing it emits a `hat-changed` event to the char window (same live-push
  pattern as `theme-changed` / the chime + chatter toggles). The char window
  reads `ghostHat` on load and re-reads on `hat-changed`, then `render()`.
- Swatch preview: each swatch renders its `buildHat` cells in a tiny grid (reuse
  `paintGrid` at small `--cell`), so the picker shows the actual pixel art.

## Unlock moment

- Folds into the existing milestone path in `bumpStreak()`: when a milestone is
  hit it already pushes the `__streak__` cheer bubble. Append the hat to that
  moment — the cheer line mentions the unlock (e.g. "7-day streak! 🧢 cap
  unlocked"). No new bubble type, no new sound.
- Auto-equip on unlock: **no** — respect the user's current `ghostHat` choice;
  the picker is where they opt in. (New hat just becomes selectable.) The cheer
  text tells them to check settings.

## Persistence summary

- `localStorage.bestStreak` — highest streak ever reached (new; drives unlocks).
- `localStorage.ghostHat` — equipped hat id, `""` = none (new; default `""`).
- No Rust / config-dir changes. No `reminders.json`/`todos.json` touch.

## Testing

- One runnable frontend check (node, like `scripts/test_queue.js`): assert the
  unlock derivation — `unlockedHats(bestStreak)` returns the right set at
  boundaries (2→none, 3→[bow], 100→all 6, 999→all 6). Extract the
  milestone→hat map + `unlockedHats` into a spot the node script can require, or
  duplicate the tiny map in the test (frontend has no module system — follow
  whatever the existing `test_*.js` scripts do).
- Manual: build a streak (or set `bestStreak` in devtools), confirm swatches
  unlock, equip each hat, switch themes and confirm recolor, confirm the hat
  survives an app restart and does **not** appear on the taskbar/exe icon.

## Out of scope (YAGNI)

- No hat animations (bobbing is inherited from the ghost wrap).
- No per-mood hat changes.
- No hats on the icon.
- No new sound for unlocks.
- No Rust-side unlock validation — it's a cosmetic on the local machine.

## Files touched

- `src/main.js` — `buildHat`, palette keys, `render()` overlay, `bestStreak`
  bump in `bumpStreak()`, `ghostHat` read + `hat-changed` listener.
- `src/settings.html` / `src/settings.js` — picker UI in the settings tab,
  `hat-changed` emit, swatch previews.
- `src/tokens.css` — `--hat` (+ maybe `--hat-shade`) on `:root` and, if desired,
  per-theme overrides.
- `docs/ARCHITECTURE.md` — document hats under Ghost moods / Persistence.
- `scripts/` — a small `test_hats.js` for the unlock derivation.
