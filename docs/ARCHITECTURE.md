# Poltergeist — Architecture & Reference

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
cargo test           # Rust unit tests (reminders / store / calendar / agents / hooks / hit-test)
node scripts/test_queue.js  # frontend logic self-checks; also test_datetime.js, test_unit.js
cargo build --release
cargo tauri build      # exe + installers (msi + nsis) in target/release/bundle/
node scripts/make_icon.js   # regenerate icons/icon.ico from the sprite
```

No Node build step — the frontend is static files in `src/`.

**`notify` subcommand** — `poltergeist.exe notify …` is intercepted at the top of
`main()` before any window init. Used by agent hooks (see Agent notifications).

## Layout

- `src-tauri/src/main.rs` — window setup (4 windows), Tauri commands, scheduler
  wiring, `register_autostart()`/`set_autostart()` (HKCU Run key via `reg.exe`),
  `load_todos`/`save_todos`, `set_todo_visible`, `set_hit_regions` +
  `start_click_through` (the click-through poll, see below). State is `.manage()`d
  **on the builder**, not in `setup` — a webview can fire IPC before `setup` runs.
- `src-tauri/src/reminders.rs` — `Reminder` model (incl. the `poltergeist` flag),
  `is_due`, `preserve_last_fired`, defaults (+ tests).
- `src-tauri/src/store.rs` — JSON load/save in the OS config dir; an empty list
  reseeds defaults (+ a test). To-dos persist as raw JSON in `todos.json`. All
  config writes go through `write_atomic` (temp file + rename) so a crash
  mid-write can't truncate a data file.
- `src-tauri/src/calendar.rs` — Google Calendar (read-only ICS feed). Fetches the
  secret `.ics` URL (`ureq`), parses it (`icalendar`), expands recurring events
  (`rrule`) over a ±window, caches `Vec<CalEvent>`. `due_nudges` turns upcoming
  events into bubble ids; `calendar.json` holds `{ url, lead_minutes }`. See the
  Google Calendar section (+ tests for due/RRULE/window).
- `src-tauri/src/platform/{win,mac}.rs` — non-activating window flags;
  `win.rs` also has `cursor_pos()` (`GetCursorPos` FFI) for the click-through poll.
- `src/index.html|main.js|style.css` — the ghost overlay. Sprite is built
  procedurally in `buildSprite(blink, mood)`; moods
  (`normal|happy|sad|angry|writing`) drive the face. Celebrate/sad/angry logic,
  the reminder queue, and the Pomodoro focus timer live in
  `main.js`; `#flames` lights up in poltergeist mode. `reportHit()` tells Rust
  which rects (ghost + visible bubble) stay clickable — see Click-through below.
- `src/settings.html|settings.js` — tabbed editor (reminder / to-do / calendar /
  focus / settings), dark spectral theme. Flex-column layout: only the active tab's list scrolls,
  with a themed scrollbar.
- `src/todo.html|todo.js` — floating to-do list window (non-activating, no ghost).
  Click a task to finish it (struck through for a ~3s undo grace — click again to
  restore — before it's deleted); edits sync with the settings to-do tab via the
  `todos-changed` event.
- `src/calendar.html|calendar.js` — floating calendar window (non-activating, no
  ghost): a month grid (dots on days with events, click a day to filter; roving
  tabindex + arrow keys walk the days) over an agenda list (next 7 days by
  default). Read-only; events come from
  `load_calendar_events`, refreshed on the `calendar-updated` event.
- `src/tokens.css` — the shared spectral palette (`--void`/`--purple`/`--ghost`/
  `--muted`/`--danger`…), single source of truth `<link>`ed by all four windows.
  Edit colors here, not per-window. `main.js` also reads the ghost/eye/blush/tear
  vars at runtime for sprite cells, so they must stay on `:root` here. Only
  `--cell` (the overlay's pixel unit) stays window-local in `style.css`.
  **Themes:** `:root` is the default `spectral` palette; `:root[data-theme="…"]`
  blocks (`matcha`, `sundae`, `slate`) override the palette vars. See `theme.js`.
- `src/theme.js` — shared theme applier `<script>`'d by all four windows (like
  `winpos.js`). Reads `localStorage.theme` → sets `<html data-theme>` (flips the
  tokens.css block); listens `theme-changed` (emitted by the settings dropdown) to
  re-apply live. The ghost sprite recolors for free — cells reference `var(--ghost)`.
- `src/winpos.js` — remembers each window's on-screen position across launches
  (localStorage keyed by window label). Loaded by all four windows.
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

## Auto-update (GitHub Releases)

Uses `tauri-plugin-updater` (Rust-side only — the static frontend has no bundler
to import the JS plugin). On startup `start_update_check` queries the GitHub
`releases/latest/download/latest.json` manifest; if a newer version exists it
emits `update-available`, and the ghost shows a one-off **"✨ vX ready — click to
update"** bubble (queued like a reminder, sentinel id `__update__`, no sulk
timer). Clicking calls the `install_update` command → download + install +
`app.restart()`.

**Signing keys (already set up since v1.1):** the public key lives in
`tauri.conf.json` → `plugins.updater.pubkey`; the private key is
`~/.tauri/poltergeist.key` — **secret, never commit it**, and it has **no
passphrase**. Release builds must be signed:
`TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/poltergeist.key)`
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""` then `cargo tauri build` —
`createUpdaterArtifacts: true` makes it emit the signed `*-setup.exe` + a `.sig`
file. (To rotate: `cargo tauri signer generate -w ~/.tauri/poltergeist.key`,
then update the pubkey.)

**Each release:** upload the NSIS `*-setup.exe`, and a `latest.json` asset:
```json
{ "version": "1.1.0", "notes": "...", "pub_date": "<RFC3339>",
  "platforms": { "windows-x86_64": {
    "signature": "<contents of the .sig file>",
    "url": "https://github.com/findteemo/Poltergeist/releases/download/v1.1.0/Poltergeist_1.1.0_x64-setup.exe" } } }
```

**Caveat:** v1.0 shipped *without* the updater, so those installs can't
auto-update — they need one manual install of any ≥ v1.1 build. Dev (`cargo run`)
is unaffected — the update check fails quietly.

## Ghost moods (frontend)

`buildSprite(blink, mood, gaze)` swaps the face: `happy` (curved eyes + smile),
`sad` (frown + tear), `angry` (slanted brows + gritted mouth), `normal`, plus the
personality faces `curious` (open eyes + tiny smile), `yawn`, `surprised`, and
`sleeping` (closed lids). **Keep the resting `normal`/`happy`/`sad`/`angry` faces
in sync with `scripts/make_icon.js`** — it has its own `buildSprite` copy and the
icon renders `normal`; the new moods are runtime-only so the icon is unaffected.
The `writing` mood keeps the normal face; `setMood` adds a `.writing` class to
`#ghostwrap` (an amber focus glow, CSS) and runs `startPad()` — a second pixel
sprite (`buildPad`/`renderPad` → `#pad`, same grid-of-cells style as the ghost).
We see the notebook's **back cover** (binding rings, label, shaded edge); the page
faces the ghost and stays hidden, and only the pencil top pokes above the edge,
walking side-to-side (`PAD_HEADS`). In `main.js`:
- Dismissing a bubble → `celebrate()`: happy face + a translate-only bounce
  (`.char.celebrate`), settles back after ~1.2s. **Translate only** — `scale`/
  `rotate` on the pixel grid expose seams between cells.
- A shown bubble starts a timer (`cryMs`, settable in settings, default 1 min);
  if it elapses unacked → `setMood("sad")`, or `setMood("angry")` + lit `#flames`
  for a **poltergeist** reminder. Cleared on dismiss or when the bubble closes.
- A shown bubble also arms a repeating re-chime (`nagTimer` = `setInterval(chime,
  nagMs)`, settable in settings as "remind again every", default 5 min, `0` =
  off) so an unacked reminder keeps nudging by sound. Cleared alongside `moodTimer`
  (showNext + bubble click). Only regular reminders — not `__update__`/`__break__`/
  `__cal__`/`__agent__`. Respects the chime mute (via `chime()`).
- Blinking is gated on `prefers-reduced-motion`.
- **Day streak:** acking a *real* reminder calls `bumpStreak()` (sentinels return
  earlier, so they don't count). Consecutive-day count + last-ack day live in
  `localStorage` (`streakCount`/`streakLastDate`); a broken streak restarts at 1 on
  the next ack. Hitting a `STREAK_MILESTONES` day (3/7/14/30/60/100) pushes a
  one-off `__streak__` cheer bubble (chimes + `celebrate()`, no ack/sulk, auto-fades
  like `__idle__`). `emit("streak-changed")` refreshes the settings display.

**Personality (idle behaviors).** Three transient faces (`yawn`/`surprised`/
`scrunch`) live *outside* the `mood` machine in a `transient` var so they never
clobber a sulk / focus / bubble — `render()` prefers `transient`, then the hover
`curious` peek, then `mood`. `flash(expr, ms, then)` shows one briefly (and is a no-op under
reduced-motion, still running `then`).
- **Glance:** hovering the idle ghost → `curious` + eyes track the cursor's side
  via `gaze` (-1/0/1, set on `mousemove`, fed to `buildSprite`).
- **Doze:** a reset `setTimeout` (`scheduleDoze`, `IDLE_MS` = 3 min; **not** a
  poll) fires when `idle()` (normal, no bubble, focus idle, not hovered) → `yawn`
  then `setMood("sleeping")` (dimmed `.char.sleeping` + the `#zzz` layer). Every
  return to `normal` re-arms it; any other mood cancels it.
- **Wake:** hover / a `reminder-due` / mousedown calls `wake()` → back to
  `normal` + a `surprised` startle. **Drag:** mousedown flashes a `scrunch` (>.<)
  briefly (settles on its own, so a missed mouseup during the OS drag can't leave
  it stuck mid-squeeze).
- **Chatter:** a self-rescheduling `setTimeout` (`scheduleChatter`, random 4–8 min;
  **not** a poll) mutters a random line from `IDLE_LINES` when `idle()` (and not
  disabled via the settings "idle chatter" toggle — `chatterOff`/`chatter-toggle`,
  same live-push pattern as the chime mute) — a bubble
  under the `IDLE_ID` (`__idle__`) sentinel. Ambient only: **silent** (no chime),
  no ack, no sulk (like `__cal__`/`__break__`), and **auto-fades** after ~5s (reuses
  `moodTimer` → `showNext`); clicking dismisses early with no celebrate. Skips (and
  just re-arms) whenever not `idle()`, so it never interrupts a real bubble/sleep/
  focus/hover.
- **Daily greeting:** on char-window load, once per day (`lastGreetDate`), a
  time-aware hello (`morning`/`afternoon`/`evening`/`working late?` by `getHours()`)
  shows ~1.5s in under `GREET_ID` (`__greet__`) — **silent** celebrate, no ack,
  auto-fades. Fires each morning via the login auto-start.
- **Focus reward:** see Focus timer — `FOCUSDONE_ID` (`__focusdone__`) cheer.
  `__greet__`/`__focusdone__` are no-ack/no-sulk sentinels that route through the
  streak branch of `showNext` (celebrate + auto-fade) but stay **silent** (the chime
  line excludes `IDLE_ID`/`GREET_ID`/`FOCUSDONE_ID`).
- Reduced-motion: no yawn/startle/zzz-drift; doze still lands on a static dimmed
  sleeping face with a static `z z z`.

## Focus timer (Pomodoro)

Frontend-only (no Rust). The settings **focus** tab has focus/break minute fields
and a loop-count field (persist in localStorage, defaults 25/5/0; `0` = endless)
and a Start/Stop button; it emits
`focus-toggle` and `focus-durations` to the ghost and shows the `focus-status`
the ghost emits back (with a `· n/N` lap counter when a loop target is set). The
state machine + 1s tick live in `main.js` (remaining time derives from a
wall-clock `phaseEnd`, not tick counts, so timer throttling / sleep-resume can't
stretch a block): loops
`focus` (mood `writing` → focus notebook, see Ghost moods) → `break` until stopped
— or, with a loop target, auto-stops after the Nth focus block (ends on the
`rewardFocus` cheer, skipping the final break). The break is a
countdown bubble pushed into the existing queue under the `BREAK_ID` (`__break__`)
sentinel — no ack, no sulk (like `__cal__`/`__update__`); its text reticks each
second and clicking it skips the rest of the break. Reminders are **not**
suppressed during focus (they show through). A running session is ephemeral —
not restored after an app restart. `fmt()` (M:SS) has an inline `console.assert`.

When a focus block completes (`tickFocus`, before `enterBreak`), `rewardFocus()`
pushes a proud, count-aware cheer under `FOCUSDONE_ID` (`__focusdone__`) — a silent
celebrate that auto-fades, then the break bubble follows. Completed sessions are
counted per day in localStorage (`focusDate`/`focusCount`); the line escalates
(`nice focus 💪` → `2 sessions 🔥` → `N done — machine 🚀`). See Personality.

## Agent notifications (Claude Code / Codex)

The ghost nudges when a coding agent finishes a turn or needs action. An external
hook runs `poltergeist.exe notify --agent <claude|codex> --event <finished|needs-action>`.
For Codex, the form is `poltergeist.exe notify --from-codex '<json>'` — the last
argument is parsed for a `type` field; values containing `approval`, `input`, or
`permission` map to `needs-action`, everything else (including turn-complete) maps
to `finished`. The `notify` subcommand is intercepted at the top of `main()` —
it drops a JSON note in `cozy-reminder/inbox/` and exits before any window
initializes.

`start_inbox_watch` (a 2s tokio tick in `main.rs`) drains the inbox via
`agents::drain_inbox` and emits `reminder-due` with `{id, label, agent, kind,
poltergeist:false}`. Notes are deleted on drain so they fire exactly once — unlike
regular reminders, no `active` dedupe is needed. Malformed note files are deleted
and skipped so they can't wedge the inbox. Frontend (`main.js`) shows the vendor
logo (`src/agent-claude.svg`, `src/agent-codex.svg` — these are geometric
**approximations**; replace with official art as needed). On bubble show:
`finished` → `celebrate()` (happy face + bounce), `needs-action` →
`setMood("angry")` immediately (angry face + lit `#flames`, no sulk timer).
**Chime fires for both** `finished` and `needs-action` (same chime path as regular
reminders; respects mute). Agent ids (`__agent__<agent>__<event>`) are no-sulk/no-ack
sentinels — dismissed without calling `ack_reminder` (like `__cal__`/`__break__`).

Hook install: the **agents** section of the settings tab → one-click
install/uninstall per agent.
`hooks.rs` does non-destructive merges: Claude inserts `Stop` (finished) and
`Notification` (needs-action) hook entries into `~/.claude/settings.json` (JSON
via `serde_json`); Codex sets a `notify` array in `~/.codex/config.toml` (TOML
via `toml_edit`). `agent_hook_state` reports installed/uninstalled state
for each agent. The Codex merge refuses to clobber a foreign `notify` key (errors
with a message; only removes/overwrites keys it placed itself). **After installing,
relaunch the agent** — hooks are read at agent startup, not dynamically.

## Auto-launch at login

`register_autostart()` (Windows only) writes the running exe path to
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run` under value `Poltergeist`,
via native `reg.exe` (no extra crate; `CREATE_NO_WINDOW` so no console flash).
Registers **whatever exe is running** (dev or installed). Now toggleable: the
"launch at login" checkbox calls `set_autostart(enabled)`, and the char window
re-applies the saved pref on every load — **the registry key IS the state**, so
the toggle survives restarts. Remove manually:
`reg delete "HKCU\...\Run" /v Poltergeist /f`.

## Click-through (transparent overlay)

The character window is a fixed 240×260 transparent box but the ghost only fills
the bottom-center — so the empty space used to swallow clicks meant for apps
underneath. Fix: the window is **click-through except over the ghost / an open
bubble**.

- A `windows`-only poll (`start_click_through`, 50ms tokio loop) reads the global
  cursor (`platform::cursor_pos` → `GetCursorPos`), converts it to the window's
  CSS px (subtract `outer_position`, divide by `scale_factor`), and toggles
  `win.set_ignore_cursor_events(!inside)`.
- The frontend owns the geometry: `reportHit()` in `main.js` sends the ghost's
  (and a visible bubble's) rects via `set_hit_regions`, padded 12px for the
  bob/celebrate motion. It re-reports on load, bubble show/hide, and ghost-size
  change. Rects are window-relative, so dragging the window doesn't invalidate them.
- **Why poll instead of JS hover events:** once the whole window is click-through
  the webview gets *no* mouse events, and Tauri v2 has no "forward events" flag —
  so re-entry over the ghost can only be detected OS-side. Empty rects (before the
  frontend reports) keep the window solid so the ghost is never click-through.
- Windows-only; mac/other fall back to the old fully-solid behavior. `point_in_any`
  has a unit test.

## Hard-won gotchas (don't relearn these)

- **Four windows, all defined in `tauri.conf.json`** (`character`, `settings`,
  `todo`, `calendar`). `settings`, `todo`, and `calendar` start `visible:false`;
  `open_settings` / `set_todo_visible` / `set_calendar_visible` just
  `.show()`/`.hide()`. **A new window must also be added to
  `capabilities/default.json`'s `windows` array** — Tauri v2 scopes permissions
  per window, so a missing one silently can't `invoke`, use events, or
  `hide()`/`startDragging()` (looks like "the new UI does nothing / won't
  close"). Creating windows at runtime with
  `WebviewWindowBuilder` rendered **blank white** in dev — config windows load
  their URL reliably, runtime ones didn't. (That's why the
  `allow-create-webview-window` capability is gone.)
- **Closing settings or to-do hides it** (CloseRequested → `prevent_close()` +
  `hide()`) so it stays reusable. Don't let it get destroyed. The to-do "show
  list window" toggle is the real switch; its close button only hides.
- **`AppState` is managed on the builder, not in `setup`.** A window's webview
  can fire IPC before `setup`'s `manage()` runs, which raced as "state not
  managed". Build the state up front and `.manage()` it before `.setup()`.
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
- **Claude Desktop can't be an agent source.** The whole agent-notify path relies
  on the agent running an external command (`poltergeist.exe notify …`) at a
  lifecycle point (Stop / Notification hook). Claude **Desktop** exposes no such
  hook — no turn-complete event, no way to shell out — so it can't drive the ghost
  the way Claude Code / Codex do (open Anthropic feature request as of 2026). Its
  only extension surface is model-invoked MCP tools, which fire only when the model
  chooses to (best-effort, not a real hook). Deliberately **not** implemented;
  revisit if Anthropic ships desktop lifecycle hooks.

## Scheduler model

One 10s tokio tick loop in `main.rs`. An interval reminder fires when
`now - last_fired >= interval_secs`; a scheduled one fires once at its `fire_at`.
Each is held in an `active` set (shown, not re-fired) until acked. Ack sets
`last_fired = now` (or removes a one-shot) and persists. Defaults stagger first
fires by 1 min each.

`save_reminders` guards its trust boundary: intervals clamp to ≥60s, and
`preserve_last_fired` (reminders.rs, tested) keeps the backend's firing state
for matching ids — the settings window's list is a snapshot loaded at app start
and would otherwise rewind `last_fired` on every save. The frontend half:
settings reloads the list on the `settings-shown` event (emitted by
`open_settings`) unless the `dirty` flag marks unsaved edits, so re-opening
settings can't resurrect acked one-shots. Deliberately event-driven, not
focus-driven — a reload on window focus would rebuild the list DOM under the
user's first click into a field.

The same tick also scans cached calendar events (see below): one within
`lead_minutes` and not already in `active` emits a `reminder-due` bubble with id
`__cal__<uid>__<start>`. Calendar bubbles reuse the whole reminder bubble path
but **don't** sulk and **aren't** acked server-side — the frontend dismisses
`__cal__…` ids without calling `ack_reminder`. Past `__cal__` ids are pruned from
`active` each tick.

## Google Calendar (read-only ICS)

`calendar.rs`. The user pastes their Google "Secret address in iCal format" URL
into the settings **Calendar** tab (`save_calendar_config` → `calendar.json`).
**No OAuth** — read-only feed access only. A background thread
(`start_calendar_sync`, plain `std::thread`, 10-min loop — blocking HTTPS has no
business on the 10s tokio tick) fetches via `ureq`, parses with `icalendar`,
expands recurrences with `rrule` over `now-31d … now+60d`, and swaps the cached
`Vec<CalEvent>` in **only on success** (a failed fetch keeps the last good cache,
so offline never blanks the view), then emits `calendar-updated`. Saving the
config triggers an immediate re-fetch, so "refresh now" is just a re-save.

Gotchas: recurrences expand at a fixed UTC offset (can drift an hour across a DST
boundary — fine for nudges); floating/all-day times are treated as UTC. Both are
marked `// ponytail:` with the upgrade path. ICS parsing + RRULE are the wheels
not to reinvent — hence the three crates. `fetch` refuses non-`https://` URLs
(the secret address is a credential — never plaintext) and carries a 30s
timeout so a stalled server can't hang the sync thread.

## Persistence

`reminders.json`, `todos.json`, `calendar.json` (`{ url, lead_minutes }`,
Rust-owned because the feed is fetched with no window open), and `inbox/`
(transient agent note files, drained and deleted by `start_inbox_watch`) in
`dirs::config_dir()/cozy-reminder/`.
Corrupt / missing / **empty** reminders → seed defaults, never crash (an empty
list would mean the ghost never nudges). To-dos are stored as raw JSON — no Rust
struct to keep in sync. The dir name is intentionally **`cozy-reminder`** (not
the new product name) so existing users keep their data after the rename.

Window positions live in each webview's `localStorage` (`winpos:<label>`), not in
the config dir.

## Style

Ponytail mode: laziest solution that works. Stdlib/native before deps, shortest
diff, mark deliberate shortcuts with `// ponytail:` comments. Non-trivial logic
leaves one runnable check.
</content>
