# cozy-reminder — Design

A lightweight, cozy desktop reminder app. A cute pixel companion lives on the
desktop and gently reminds the user to take care of themselves. Calming, never
focus-stealing.

## Goals / Acceptance Criteria

- Runs on Windows + macOS.
- Pixel character visible on desktop: always-on-top, draggable, non-intrusive.
- Default + custom reminders fire on schedule and persist across restarts.
- "Done" interaction never tabs the user out of their active application.
- Idle RAM target: <80 MB (ceiling <100 MB).
- Calming, cohesive aesthetic.

## Tech Stack (with rationale)

- **Tauri 2** (Rust backend + OS webview): low RAM (no bundled Chromium),
  native window control for the focus constraint, HTML/CSS for easy character
  styling/animation.
- **Persistence: single JSON file** via `serde`/`serde_json` in the OS
  app-config dir (`%APPDATA%\cozy-reminder` / `~/Library/Application
  Support/cozy-reminder`). No database — overkill for a handful of reminders.
- **Scheduling: one `tokio` tick loop** at 10 s granularity that checks which
  reminders are due and emits a Tauri event. Not one task per reminder, not a
  cron crate. `// ponytail: single tick loop, fine for a handful of reminders`.

## Assets

Sprite is **hand-authored as a CC0 pixel creature** (round "mochi" cat/ghost;
idle + blink frames), rendered via small PNGs + CSS. Rationale: no new
dependency, no broken-link or licensing risk, swappable later by replacing
`src/assets/character/`. Any itch.io / Kenney / OpenGameArt **CC0** sprite can
drop in. README lists assets and licenses.

## Focus-Preserving Acknowledgment (hard constraint)

The reminder appears as a **speech bubble on the character window itself** — one
always-on-top overlay, no second popup. Clicking the character or bubble = "done".

- **Windows:** window `focus:false, skipTaskbar:true, alwaysOnTop:true`, then set
  `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` via `windows-rs`. Mouse events arrive
  without activating the window, so the active app keeps keyboard focus.
- **macOS:** promote the window to a non-activating `NSPanel`
  (`styleMask |= .nonactivatingPanel`, `level = .floating`, `canBecomeKey = false`)
  via `cocoa`/`objc`. Clicks acknowledge without activating the app.
- Dragging uses Tauri's `startDragging` (no activation needed).
- **Settings window** (add/edit/delete reminders) is a separate, normal,
  focusable window opened on demand — focus there is correct and expected. Only
  the bubble must never steal focus.

## Project Structure

```
cozy-reminder/
  src-tauri/src/
    main.rs               # setup, windows, wire events
    reminders.rs          # model + tick scheduler + due logic
    store.rs              # JSON load/save
    platform/{win,mac}.rs # non-activating window flags
    tauri.conf.json, Cargo.toml
  src/
    index.html style.css main.js   # character + bubble + settings UI
    assets/character/*.png
  README.md               # assets/licenses, build/run
```

## Reminder Model & Data Flow

```
Reminder { id: String, label: String, interval_secs: u64,
           enabled: bool, last_fired: i64 (unix secs) }
```

- Startup: load JSON (or seed defaults). Defaults: hydrate / posture / stretch,
  all `interval_secs = 1800`.
- Tick loop (10 s): for each enabled reminder, if
  `now - last_fired >= interval_secs`, mark due → emit `reminder-due` event with
  the label. Stagger so they don't all fire at once on first launch.
- Frontend shows the bubble. On click ("done"): set `last_fired = now`, persist.
- Settings window edits the reminder list via Tauri commands that read/write the
  same JSON store.

## Error Handling

- Missing/corrupt JSON → log and seed defaults (never crash, never lose the app).
- Write failures → keep in-memory state, retry next change; surface nothing
  intrusive.

## Testing

- One Rust unit test on the "which reminders are due" logic (the only
  non-trivial branch). No framework beyond `#[test]`.
- Manual: verify clicking the bubble while typing in another app does not
  interrupt typing (the focus constraint) on both OSes.
