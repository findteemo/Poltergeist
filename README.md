# Poltergeist 👻

A lightweight, cozy desktop companion. A little pixel **ghost** floats on your
desktop and gently nudges you to drink water, fix your posture, and stretch —
**without ever stealing focus** from what you're doing. He celebrates when you
tick a task off, sulks when you ignore him, and — for reminders you mark
**poltergeist** — turns angry with purple flames until you listen. Comes with a
matching floating to-do list and a read-only Google Calendar view. Cozy spectral
theme: black + purple, monospace type, chunky pixel borders.

Built with **Tauri 2** (Rust + the OS webview), so it stays light on RAM.

## Download & install

1. Go to the [**Releases**](../../releases/latest) page.
2. Download the Windows installer:
   - **`Poltergeist_x.y.z_x64-setup.exe`** — recommended (NSIS, smaller, no admin needed), or
   - **`Poltergeist_x.y.z_x64_en-US.msi`** — if you prefer MSI / managed installs.
3. Run it. The ghost appears at the bottom of your screen and **starts
   automatically every time you log in**.

> Windows may show a SmartScreen warning for an unsigned app — *More info →
> Run anyway*.

**Updates:** from this version on, Poltergeist checks for new releases at
startup and the ghost offers a *"✨ update ready"* bubble — click it to install
and relaunch. (Installs of **v1.0** predate the updater, so update to this
release manually once; it's automatic after that.)

**Stop it launching at login:** untick *launch at login* in the settings
*settings* tab, or remove the registry key directly:

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Poltergeist /f
```

## Features

- **Pixel ghost overlay** — always-on-top, draggable, transparent, with a pulsing
  purple aura and a gentle blink. Remembers where you left it. **Click-through:**
  only the ghost (and an open bubble) catch clicks — the empty space around him
  passes them straight to whatever app is underneath.
- **Moods** — the ghost does a happy hop when you dismiss a reminder, turns sad
  (frown + tear) if you ignore one too long, and goes **angry with purple flames**
  for reminders you flag as *poltergeist*. The "cry after N minutes" delay is
  adjustable.
- **Focus-safe nudges** — acknowledge with a single click on the speech bubble; it
  **never tabs you out** of your active app (Windows `WS_EX_NOACTIVATE`; macOS
  non-activating floating panel).
- **Custom reminders** — add / edit / delete your own, each with its own interval,
  plus one-shot "remind me at a specific time" reminders, and a per-reminder
  poltergeist flag. Right-click the ghost to open settings.
- **Floating to-do list** — a tiny optional window of tasks; click one to finish
  it. Edit tasks from the settings *to-do* tab; toggle the window on or off.
- **Google Calendar** — paste your calendar's read-only *secret address in iCal
  format* into the settings *calendar* tab and upcoming events surface as the same
  gentle nudges, with an adjustable lead time. An optional floating calendar window
  shows a month grid (dots on days with events) over an agenda list. **Read-only,
  no OAuth** — it only reads the ICS feed and never writes anything back. Note the
  secret URL *is* the credential: anyone who has it can read your calendar (it's
  stored locally in `calendar.json`, and the app only accepts `https://` URLs —
  reset it from Google Calendar's settings if it ever leaks).
- **Focus timer (Pomodoro)** — a *focus* tab with adjustable focus/break lengths:
  the ghost writes in a little notebook while you focus, then nudges you to take a
  break with a live countdown, looping focus → break until you stop.
- **Agent notifications** — the ghost nudges you when Claude Code or Codex finishes
  a turn (happy bounce) or needs your input (angry + purple flames). Set up in one
  click from the settings *agents* tab — it wires the hooks into each agent's own
  config automatically. Relaunch the agent once after installing.
- **Gentle chime** on each nudge (toggleable), and an adjustable ghost size.
- **Auto-launch at login** (Windows) — toggleable in settings, survives restarts.
- Reminders, to-dos, and your calendar settings persist to JSON files in your OS
  config dir; windows remember their positions.
- **Accessibility** — keyboard-focusable controls and `prefers-reduced-motion`
  support (no blink/animation when reduced motion is on).

## Configuration & data

Data lives in the OS config dir (kept under `cozy-reminder` for backwards
compatibility with earlier versions):

- Windows: `%APPDATA%\cozy-reminder\` (`reminders.json`, `todos.json`,
  `calendar.json`, `inbox/` for transient agent notes)
- macOS: `~/Library/Application Support/cozy-reminder/`

Delete `reminders.json` to reset reminders to defaults. A corrupt, missing, or
empty reminders file re-seeds the defaults rather than crashing. Window positions
and a few UI prefs are kept in the webview's local storage instead.

## Build from source

**Requirements**

- [Rust](https://rustup.rs) (stable)
- Windows: WebView2 (preinstalled on Windows 10/11)
- macOS: Xcode command line tools (WKWebView is built in)
- Node is **not** required — the frontend is plain static HTML/CSS/JS.

**Run (dev)**

```sh
cd src-tauri
cargo run
```

**Build installers (.exe / .msi)**

```sh
cd src-tauri
cargo install tauri-cli   # first time only
cargo tauri build
```

Installers land in `src-tauri/target/release/bundle/` (`nsis/` and `msi/`), and
the raw binary in `src-tauri/target/release/poltergeist.exe`.

**Test**

```sh
cd src-tauri
cargo test
```

## Assets / licenses

- **Code**: [MIT](LICENSE).
- **Ghost sprite**: hand-authored in this repo, built procedurally in
  `src/main.js` (`buildSprite`). The matching app icon (`icons/icon.ico` and
  `icons/icon.rgba`) is generated from the same sprite by
  `src-tauri/scripts/make_icon.js`. All **CC0 / public domain** — do whatever you
  like. To swap in your own pixel art, edit `buildSprite` and rerun `make_icon.js`.
- No bundled fonts; uses the OS monospace font (Cascadia / Consolas / Menlo).

## Notes

- **RAM:** idle ~150–200 MB private committed across the app + WebView2 process
  tree (measured ~189 MB on Windows 11). Lighter than Electron, but sub-100 MB
  isn't realistic for any WebView2/Tauri app — a native-GUI toolkit (egui/iced)
  would be the only honest path if that's a hard requirement.
- **macOS** focus handling is implemented but was written on a non-macOS host —
  verify click-to-ack-without-focus-steal on a real Mac (see
  `src-tauri/src/platform/mac.rs`).
</content>
</invoke>
