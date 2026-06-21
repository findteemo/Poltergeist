# CLAUDE.md — Poltergeist

Cozy desktop reminder app: a draggable, always-on-top pixel **ghost** that nudges
you to hydrate / fix posture / stretch, **without ever stealing focus** from your
active app. Tauri 2 (Rust + OS webview), plain static HTML/CSS/JS frontend.
Theme: cozy spectral, black + purple, monospace type, chunky pixel borders.

> Product name is **Poltergeist**; the Rust crate/binary is `poltergeist`
> (`poltergeist.exe`). The config/data dir is still `cozy-reminder` (see
> Persistence) — kept on purpose so renamed builds keep existing reminders.

## Commands (run from `src-tauri/`)

```sh
cargo run            # dev launch
cargo test           # unit tests (reminders::tests::due_logic)
cargo build --release
cargo tauri build      # exe + installers (msi + nsis) in target/release/bundle/
node scripts/make_icon.js   # regenerate icons/icon.ico from the sprite
```

No Node build step — the frontend is static files in `src/`.

## Layout

- `src-tauri/src/main.rs` — window setup, Tauri commands, scheduler wiring,
  `register_autostart()` (HKCU Run key via `reg.exe`).
- `src-tauri/src/reminders.rs` — `Reminder` model, `is_due`, defaults (+ the test).
- `src-tauri/src/store.rs` — JSON load/save in the OS config dir.
- `src-tauri/src/platform/{win,mac}.rs` — non-activating window flags.
- `src/index.html|main.js|style.css` — the ghost overlay. Sprite is built
  procedurally in `buildSprite(blink, mood)`; moods (`normal|happy|sad`) drive the
  face. Celebrate/sad logic and the reminder queue live in `main.js`.
- `src/settings.html|settings.js` — reminders editor (dark spectral theme),
  flex-column layout: only the list scrolls, with a themed scrollbar.
- `src-tauri/scripts/make_icon.js` — generates `icons/icon.ico` (exe/shortcut
  icon) **and** `icons/icon.rgba` (runtime window icon via `Image::new`) from the
  **same ghost sprite**. Keep its `buildSprite()` in sync with `src/main.js`.

## Installer stays in sync with the app

**Any change to the app (frontend `src/` or Rust) means rebuilding the installer.**
The frontend is baked into the exe at compile time and the installers wrap that
exe, so an old installer ships stale code. After changing the app, run
`cargo tauri build` — it rebuilds the exe **and** the msi + nsis installers in one
shot. `cargo build --release` only makes the exe, not the installers. **Quit the
running app first** or the build fails with `Access is denied` overwriting the
locked `poltergeist.exe` (the app auto-starts at login now, so it's often running).

For GitHub: installers live under `target/` (gitignored) — distribute them as
**Release assets**, don't commit binaries. The README links to `../../releases`.

## Ghost moods (frontend)

`buildSprite(blink, mood)` swaps the face: `happy` (curved eyes + smile),
`sad` (frown + tear), `normal`. In `main.js`:
- Dismissing a bubble → `celebrate()`: happy face + a translate-only bounce
  (`.char.celebrate`), settles back after ~1.2s. **Translate only** — `scale`/
  `rotate` on the pixel grid expose seams between cells.
- A shown bubble starts a 60s timer; if it elapses unacked → `setMood("sad")`.
  Cleared on dismiss or when the bubble closes.

## Auto-launch at login

`register_autostart()` (Windows only) writes the running exe path to
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` under value `Poltergeist`,
via native `reg.exe` (no extra crate; `CREATE_NO_WINDOW` so no console flash).
Idempotent, runs every launch, and registers **whatever exe is running** (dev or
installed). Remove: `reg delete "HKCU\...\Run" /v Poltergeist /f`.

## Hard-won gotchas (don't relearn these)

- **Two windows, both defined in `tauri.conf.json`.** The `settings` window starts
  `visible:false`; `open_settings` just `.show()`+`.set_focus()`. Creating it at
  runtime with `WebviewWindowBuilder` rendered **blank white** in dev — config
  windows load their URL reliably, runtime ones didn't.
- **Closing settings hides it** (CloseRequested → `prevent_close()` + `hide()`) so
  it stays reusable. Don't let it get destroyed.
- **Focus preservation is the whole point.** Windows: `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`
  via raw FFI in `platform/win.rs` (do NOT add the `windows` crate — its version
  conflicts with tauri's `hwnd()` type). macOS: non-activating NSPanel in
  `platform/mac.rs`, **unverified on real hardware**. Any change here must be
  tested by typing in another app while clicking the bubble — typing must not skip.
- **`icons/icon.ico` must exist** or `tauri-build` fails on Windows even with
  bundling off. Regenerate with `scripts/make_icon.js`.
- **Icons live in two places:** the exe/shortcut icon (embedded `icon.ico`) and the
  live window/taskbar icon (`set_icon` with `icon.rgba` in `main.rs`). Update both.
- **After changing the icon, Windows caches the old one.** The exe must be unlocked
  (app not running) to relink. Then recreate the `.lnk` and run
  `ie4uinit.exe -ClearIconCache` + restart Explorer, or the shortcut shows stale art.
- **Moving the project folder breaks `target/`** — Tauri bakes absolute paths into
  codegen. Run `cargo clean` (or delete `target/`) after a move or the build fails
  with a path error.
- **WebView2 RAM:** uses `--renderer-process-limit=1 --disable-gpu …` via
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (set in `main.rs`). `--single-process`
  drops RAM but **renders blank** — don't use it. Sub-100 MB isn't realistic on
  WebView2; native GUI would be the only honest path if that's required.
- **Transparent overlay works**; the blank-screen episodes were `--single-process`,
  not transparency.

## Scheduler model

One 10s tokio tick loop in `main.rs`. An interval reminder fires when
`now - last_fired >= interval_secs`; a scheduled one fires once at its `fire_at`.
Each is held in an `active` set (shown, not re-fired) until acked. Ack sets
`last_fired = now` (or removes a one-shot) and persists. Defaults stagger first
fires by 1 min each.

## Persistence

`reminders.json` in `dirs::config_dir()/cozy-reminder/`. Corrupt/missing → seed
defaults, never crash. The dir name is intentionally **`cozy-reminder`** (not the
new product name) so existing users keep their reminders after the rename.

## Style

Ponytail mode: laziest solution that works. Stdlib/native before deps, shortest
diff, mark deliberate shortcuts with `// ponytail:` comments. Non-trivial logic
leaves one runnable check.
</content>
