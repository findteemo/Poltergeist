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
node scripts/test_queue.js  # frontend logic self-checks; also test_datetime.js,
                            # test_unit.js, test_hats.js, test_winpos.js
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
  (localStorage keyed by window label). Loaded by all four windows. Also keeps
  windows reachable across monitor changes: a saved spot is only restored if its
  **center** would land on a currently-connected monitor, and a 5s poll re-centers
  a window that goes off-screen mid-session (no reliable display-change event in
  the webview). The saved spot is never overwritten by a rescue, so replugging the
  monitor puts the window back. Self-check: `scripts/test_winpos.js`.
- `src-tauri/scripts/make_icon.js` — generates `icons/icon.ico` (exe/shortcut
  icon), `icons/icon.rgba` (runtime window icon via `Image::new`), and
  `icons/icon.png` + `128x128.png` (macOS — tauri-bundler builds `.icns` from the
  PNGs listed in `bundle.icon`, so no `.icns` is committed) from the **same ghost
  sprite**. Keep its `buildSprite()` in sync with `src/main.js`. The PNG writer is
  hand-rolled on stdlib `zlib`; its `console.assert` on the canonical IEND CRC is
  the self-check.
- `src-tauri/scripts/make_latest_json.js` — generates the `latest.json` updater
  manifest from the release's `.sig` files (see Auto-update). `--selfcheck` runs
  its asserts.

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

## macOS build (CI only)

Tauri can't cross-compile Windows → macOS (it needs Xcode + the macOS SDK), so
the `.dmg` is built by `.github/workflows/macos.yml` on a `macos-latest` runner —
the only CI in the repo; Windows installers are still built by hand.

- Triggers on **`release: published`**, plus `workflow_dispatch` for a dmg without
  touching any release. Builds `--target universal-apple-darwin` (Apple Silicon +
  Intel in one binary; both rust targets come from `dtolnay/rust-toolchain`), then
  uploads the `.dmg` **and** a `Poltergeist.app.tar.gz` update payload it tars
  itself — same shape the bundler makes, since `install_inner` just untars and
  strips the first path component.
- **The signing key is never in CI.** The build runs with
  `--config '{"bundle":{"createUpdaterArtifacts":false}}'` so it needs no key, and
  the tarball is signed afterwards on the dev machine (see Auto-update). A key in
  Actions secrets would be usable by anyone who can run a workflow, to sign an
  update every installed copy executes — and it **can't be revoked**, because the
  pubkey is compiled into every shipped binary. Not a risk worth a convenience.
- **Every action is pinned to a full commit SHA**, not `@v4`/`@stable`. Mutable
  tags are a code-execution path into a build users install. Bump them
  deliberately. For the same reason there's **no build cache** — cached objects
  link straight into a shipped binary, and a release-only job can afford the
  ~10min cold build. The tauri CLI comes from `npx @tauri-apps/cli@<exact>`
  (npm versions are immutable), not a third-party action.
- Only `contents: write`, and the tag reaches the shell through `env:`, never
  `${{ }}` interpolation inside `run:` (Actions script injection).
- The dmg is **unsigned and un-notarized** — Gatekeeper blocks first launch
  (right-click → Open, or `xattr -dr com.apple.quarantine`). Fixing that needs a
  paid Apple Developer ID; **known gap**, not an oversight. The update channel is
  signature-verified even though the first install isn't.
- macOS focus handling (`platform/mac.rs`) is still **unverified on real
  hardware** — shipping a dmg doesn't change that.

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

**Each release, in order** (the signing key never leaves this machine):

1. Build + sign locally (bash, not PowerShell — see gotchas), then **publish** the
   GitHub release with the NSIS `*-setup.exe`. Publishing is what fires the macOS
   workflow; a draft fires nothing.
2. Wait for the workflow. It attaches `Poltergeist_x.y.z_universal.dmg` and
   `Poltergeist.app.tar.gz` (unsigned — CI has no key).
3. Download that tarball, sign it, and generate the manifest:
   ```sh
   cargo tauri signer sign -f ~/.tauri/poltergeist.key -p "" Poltergeist.app.tar.gz
   node scripts/make_latest_json.js --notes "…" \
     --win  target/release/bundle/nsis/Poltergeist_x.y.z_x64-setup.exe.sig \
     --mac  Poltergeist.app.tar.gz.sig
   ```
4. Upload the resulting `latest.json` as a release asset. **Last step** — until
   it's up, nobody is offered the update, which is the safe failure mode.

`make_latest_json.js` exists because a hand-written manifest is how you ship a
stale or mismatched signature: every client rejects the update, and the fix only
reaches people who reinstall by hand. It base64-decodes each `.sig` and refuses
anything that isn't a minisign signature. Self-check: `--selfcheck`. Omit `--mac`
for a Windows-only release.

**macOS auto-update** works exactly like Windows — same check → download → verify
→ install → restart path, and `download()` runs `verify_signature` on the bytes
(`updater.rs:712`) before anything is written, so a compromised host can't push
code without the key. `install_inner` untars the `.app.tar.gz`, backs up the
current `.app`, swaps the new one in, and escalates via an AppleScript admin
prompt if the bundle isn't writable. Two mac-specific details, both handled by
`make_latest_json.js`:
- The update asset is the **`.app.tar.gz`**, not the dmg (dmg = first install only).
- The updater looks up **`darwin-<arch>` exactly** (`target()` in `updater.rs` is
  `format!("{os}-{arch}")`, an exact `platforms` map key with **no
  `darwin-universal` fallback** in v2.10.1 — a missing key is `TargetNotFound`).
  So `darwin-aarch64` **and** `darwin-x86_64` are both written, pointing at the
  same universal tarball.

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
- **Queue arrivals.** Every push goes through `enqueue(item)` (`main.js`) — the one
  place that owns the stack counter and the arrival chime. A nudge that lands while
  another bubble is up used to be silent until its turn; now it chimes **on arrival**
  and is flagged `chimed` so `showNext` doesn't chime it a second time. Silent
  sentinels (`__idle__`/`__greet__`/`__focusdone__`, the `SILENT` set) never chime
  either way. The bubble carries a purple corner badge (`#bubble .stack`,
  `updateStack()`) showing a bare count — no `+` — of the nudges still queued
  behind the shown one; it hides at 0 and sits inside the bubble frame so the
  reported click rect already covers it.
  Self-check: `scripts/test_queue.js`.
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
- **Hats (cosmetic).** `HATS` (`main.js`) maps each day-streak milestone
  (3/7/14/30/60/100) to a collectible hat (`bow`/`cap`/`crown`/`tophat`/`witch`/
  `halo`). `bumpStreak` records the best streak ever in `localStorage.bestStreak`;
  a hat is unlocked iff `bestStreak >= its milestone` (permanent — a broken streak
  never re-locks it). Hitting a milestone appends the unlock to the `__streak__`
  cheer. **Rendering:** each hat is a filled pixel silhouette from `buildHat(id)`
  (colored via the hat keys in `COLOR` — fixed hex, so hats keep their own colors
  and do **not** recolor with the theme); `withOutline` auto-rings it in dark `K`
  like `buildSprite` does the ghost. When a hat is worn, `render()` grows the ghost
  grid from 16 to `HROWS` (24) rows — the ghost sits in the bottom 16 (offset
  `GYOFF`), the hat rises into the top rows (where the bubble normally is), so it
  bobs/celebrates/dims *with* the ghost (same element). Bare = 16 rows, so the empty
  space above stays click-through (`ensureCells` shrinks the grid back). The
  `#ghostwrap::before` aura is bottom-anchored to the ghost body so the taller grid
  doesn't ride it up. **Runtime-only** — `scripts/make_icon.js` is NOT touched (icon
  stays bare). The settings tab has a row of hat **emoji swatches** (`.hatsw` pixel
  buttons, equipped = purple ring `.on`); locked hats show 🔒, disabled, with a
  tooltip naming the streak needed. The
  equipped id lives in `localStorage.ghostHat` and pushes live via
  the `hat-changed` event (same pattern as `theme-changed`). Self-check:
  `scripts/test_hats.js`.
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
- **Icons live in three places:** the exe/shortcut icon (embedded `icon.ico`), the
  live window/taskbar icon (`set_icon` with `icon.rgba` in `main.rs`), and the
  macOS PNGs the bundler turns into `.icns`. `make_icon.js` writes all of them —
  rerun it, don't hand-edit one. Keep `icon.ico` **first** in `bundle.icon` so the
  Windows resource still picks it up.
- **After changing the icon, Windows caches the old one.** The exe must be unlocked
  (app not running) to relink. Then recreate the `.lnk` and run
  `ie4uinit.exe -ClearIconCache` + restart Explorer, or the shortcut shows stale art.
- **Run the signed release build from a POSIX shell, not PowerShell.** In
  PowerShell `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""` *deletes* the variable
  instead of setting it empty, so the signer falls back to an interactive
  passphrase prompt — with stdin detached the build just sits there forever after
  writing the installers (`.sig` files never appear, cargo idles at ~0% CPU).
  Use `export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""` in bash.
- **The updater signing key never goes into CI, and actions are SHA-pinned.** The
  pubkey is compiled into every shipped binary, so a leaked private key can't be
  revoked — it signs updates that all existing installs execute, forever. That
  makes anything with access to the key (a repo secret, a mutable action tag, a
  poisoned build cache) a silent-RCE path into every user's machine, which is a
  much worse failure than a slower release. Sign locally, pin by SHA, no cache.
- **Moving the project folder breaks `target/`** — Tauri bakes absolute paths into
  codegen. Run `cargo clean` (or delete `target/`) after a move or the build fails
  with a path error.
- **WebView2 RAM:** uses `--renderer-process-limit=1 --disable-gpu …` via
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (set in `main.rs`). `--single-process`
  drops RAM but **renders blank** — don't use it. Sub-100 MB isn't realistic on
  WebView2; native GUI would be the only honest path if that's required.
- **Transparent overlay works**; the blank-screen episodes were `--single-process`,
  not transparency.
- **A saved window position is only valid for the monitor layout that saved it.**
  Park the ghost on an external monitor, shut down, boot without it → restoring
  the saved coords drops the window onto a desktop area that no longer exists
  (invisible, unclickable, "the ghost never came back"). Validate the saved spot
  against `availableMonitors()` *before* `setPosition`, don't move first and
  correct after — the correction depends on reading the position back after the
  move landed. And **"overlaps a monitor" ≠ "visible"**: the ghost fills only the
  bottom-center of a mostly-empty 240×260 window, so a rect clipping the screen by
  its empty top edge passes an overlap test while showing nothing. `winpos.js`
  tests the window's **center** instead.
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
the config dir. Character-window localStorage also holds `bestStreak` (highest
streak ever, drives hat unlocks) and `ghostHat` (equipped hat id, `""` = none).

## Style

Ponytail mode: laziest solution that works. Stdlib/native before deps, shortest
diff, mark deliberate shortcuts with `// ponytail:` comments. Non-trivial logic
leaves one runnable check.
</content>
