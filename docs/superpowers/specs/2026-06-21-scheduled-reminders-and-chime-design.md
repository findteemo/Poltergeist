# Scheduled reminders + chime — design

Add two features to cozy-reminder, both coexisting with the current recurring
interval nudges:

1. **One-shot scheduled reminders** — fire once at a specific date+time, then done.
2. **A chime** when any reminder fires.

No new dependencies. Native datetime picker, WebAudio chime (no audio asset).

## 1. Data model (`src-tauri/src/reminders.rs`)

Add one optional field to the existing `Reminder` struct — no new type, no enum:

```rust
#[serde(default)]
pub fire_at: Option<i64>,   // Some(epoch secs) = one-shot; None = recurring interval
```

`#[serde(default)]` keeps existing `reminders.json` loading (missing field → `None`).

`is_due` branches on it:

```rust
pub fn is_due(r: &Reminder, now: i64) -> bool {
    if !r.enabled { return false; }
    match r.fire_at {
        Some(t) => now >= t,                                  // one-shot
        None    => now - r.last_fired >= r.interval_secs as i64, // recurring (today)
    }
}
```

A one-shot with a past `fire_at` (e.g. app was closed when it was due) fires on the
next tick — late, but you still get reminded. Acceptable.

**Alternative considered:** a serde-tagged enum or two structs. Rejected — one
optional field is backward-compatible and ~5 lines vs an enum migration.

## 2. Ack behavior (`src-tauri/src/main.rs`)

In `ack_reminder`, branch:

- `fire_at.is_some()` → remove the reminder from the list (fired once, done).
- else → set `last_fired = now` (today's behavior).

Then save and remove from the `active` set as now. The scheduler tick loop and the
frontend bubble queue are unchanged — a one-shot is held in `active` until acked
just like a recurring one.

## 3. Chime (`src/main.js`)

On `reminder-due`, play a short two-note WebAudio chime built from oscillators — no
`.mp3` to bundle or manage. Gentle, brief.

- Mute state lives in the ghost window's `localStorage`, mirrored from settings via
  the existing `emit("char-cell", …)` pattern (new event `chime-toggle`).
- Add `--autoplay-policy=no-user-gesture-required` to the
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` already set in `main.rs`, because the ghost
  window never takes focus, so WebView2 would otherwise block the audio.

Default: chime **on**.

## 4. Settings UI (`src/settings.html`, `src/settings.js`)

- A second button **"+ schedule for a time"** adds a one-shot row with
  `<input type="datetime-local">` — the browser's native calendar+clock picker, no
  calendar library.
- Recurring rows render the minute number input exactly as today. The row renderer
  branches on whether `r.fire_at` is set.
- datetime-local value ↔ epoch conversion:
  - to epoch: `Math.floor(new Date(value).getTime() / 1000)`
  - to input: format the local `Date` as `YYYY-MM-DDTHH:MM`
- A **"chime"** checkbox by the ghost-size slider; toggling persists to `localStorage`
  and `emit("chime-toggle", …)`.

One-shot rows **disappear** after ack (no greyed "done" state).

## Checks

- Extend the `cargo test` `due_logic` test with one-shot cases: past `fire_at` = due,
  future = not due, disabled = not due.
- New `src-tauri/scripts/test_datetime.js` (run with `node`): round-trip the
  datetime-local ↔ epoch conversion helper.

## Files touched

`reminders.rs`, `main.rs`, `src/main.js`, `src/settings.html`, `src/settings.js`,
`src-tauri/scripts/test_datetime.js` (new). No new dependencies.

After the change: rebuild with `cargo tauri build` (frontend is baked into the exe).
