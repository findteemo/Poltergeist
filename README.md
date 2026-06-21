# Poltergeist 👻

A lightweight, cozy desktop companion. A little pixel **ghost** floats on your
desktop and gently nudges you to drink water, fix your posture, and stretch —
**without ever stealing focus** from what you're doing. He celebrates when you
tick a task off and sulks when you ignore him. Cozy spectral theme: black +
purple, monospace type, chunky pixel borders.

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

**Stop it launching at login:**

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Poltergeist /f
```

## Features

- **Pixel ghost overlay** — always-on-top, draggable, transparent, with a pulsing
  purple aura and a gentle blink.
- **Moods** — the ghost does a happy hop when you dismiss a reminder, and turns sad
  (frown + tear) if you leave one unanswered for over a minute.
- **Focus-safe nudges** — acknowledge with a single click on the speech bubble; it
  **never tabs you out** of your active app (Windows `WS_EX_NOACTIVATE`; macOS
  non-activating floating panel).
- **Custom reminders** — add / edit / delete your own, each with its own interval,
  plus one-shot "remind me at a specific time" reminders. Right-click the ghost to
  open settings.
- **Gentle chime** on each nudge (toggleable), and an adjustable ghost size.
- **Auto-launch at login** (Windows).
- Reminders persist to a JSON file in your OS config dir.

## Configuration & data

Settings live in the OS config dir (kept under `cozy-reminder` for backwards
compatibility with earlier versions):

- Windows: `%APPDATA%\cozy-reminder\reminders.json`
- macOS: `~/Library/Application Support/cozy-reminder/reminders.json`

Delete this file to reset to defaults. A corrupt or missing file re-seeds the
defaults rather than crashing.

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
