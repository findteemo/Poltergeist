# Pomodoro Focus Timer — design

Date: 2026-06-27

## Goal

A Pomodoro-style focus timer driven by the ghost. During a focus block the ghost
plays a **writing** animation; during a break it shows a **countdown** bubble
telling you to take a break. Focus and break lengths are user-adjustable. The
cycle loops focus → break → focus → … until the user stops it.

## Scope decisions (locked in brainstorming)

- **Controls:** a new **"focus" tab** in the settings window (not crammed into the
  reminder tab) — two number inputs (focus mins / break mins, defaults 25 / 5), a
  **Start/Stop** button, and a small live status line.
- **Cycle:** loop focus → break until stopped. No long-break-every-4, no counter.
- **Reminders during focus:** let them through (no suppression). Less code.
- **Persistence:** only the two durations persist (localStorage). A *running*
  session is ephemeral — an app restart leaves you idle.

## Architecture

Frontend-only — **no Rust changes**. The timer + animation run in the character
window (`main.js`, always alive). Controls live in the settings window. They
communicate with the same event + localStorage pattern as `char-cell` /
`cry-mins` / `chime-toggle`:

- `settings.js` persists `focusMins` / `breakMins` to localStorage and emits:
  - `focus-toggle` (start/stop) — payload: `true`/`false`
  - `focus-durations` — payload `{ focus, break }` (minutes), on input
- `main.js` listens, runs the state machine, and emits `focus-status` back so the
  settings status line stays honest (`focusing · 12:30` / `break · 4:05` / `idle`).

### State machine (`main.js`)

```
idle ──start──▶ focus (writing) ──focusMins──▶ break (countdown) ──breakMins──▶ focus ──▶ …
  ▲                                                                                  │
  └────────────────────────────── stop (from anywhere) ───────────────────────────────┘
```

- **focus:** mood = `writing`; a 1-second tick decrements the remaining seconds and
  emits `focus-status`. At 0 → enter break.
- **break:** push a sentinel bubble `{ id: "__break__" }` into the existing queue
  (handled like `__cal__` / `__update__`: no `ack_reminder`, no sulk timer). While
  it is the current bubble, a 1-second tick rewrites its text `🌙 break · M:SS` and
  emits status; ghost mood = `happy`. At 0 → dismiss it and re-enter focus.
- **stop:** clear the active tick, remove the break bubble if it is current, mood →
  `normal`, status → `idle`.

A reminder that comes due mid-break simply queues behind `__break__` (existing
queue behavior) and shows when the break ends.

### Writing animation

Mood `writing` keeps the normal face; `setMood` adds a `.writing` class to
`#ghostwrap` (an amber `focusaura` glow, CSS) and runs `startPad()`. The notebook
is a pixel sprite — `buildPad(f)`/`renderPad(f)` fill `#pad` with `.px` cells the
same way the ghost does. We see its **back cover** (spiral binding, label panel,
shaded edge); the page faces the ghost and stays hidden, and only the pencil top
pokes above the binding, walking side-to-side via `PAD_HEADS` (~220ms/frame).
Pixel-grid (not a smooth CSS box) to match the chunky art style.
`prefers-reduced-motion` renders a single static frame.

## UI (settings "focus" tab)

A 5th `.tabbtn` (`reminder / to-do / calendar / settings` → add `focus`) and a
matching `<section class="tab" id="tab-focus">`:

- focus mins — `<input type=number min=1 max=120>` (default 25)
- break mins — `<input type=number min=1 max=60>` (default 5)
- Start/Stop button (toggles label + emits `focus-toggle`)
- status line (`role=status`), updated from `focus-status`

Styled with the existing `.sizerow` / `.add` / status classes — no new CSS system.

## Testing

Ponytail: one runnable check. Extract the `M:SS` formatter as a pure function and
assert it (e.g. `fmt(0) === "0:00"`, `fmt(65) === "1:05"`, `fmt(605) === "10:05"`).
The rest is DOM/timer glue verified manually (start → ghost writes; focus elapses →
break bubble counts down; click skips; stop resets).

## Out of scope (YAGNI)

Long break every 4 blocks; session surviving restart; suppressing reminders during
focus; sound cues at phase changes (the existing chime already fires on bubbles).
Add later if asked.
