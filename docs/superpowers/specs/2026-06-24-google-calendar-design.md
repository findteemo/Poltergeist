# Poltergeist × Google Calendar — design

**Date:** 2026-06-24
**Status:** approved, implementing

## Goal

Let the ghost read your Google Calendar (read-only) so it can:
1. **Nudge before events** — a bubble X minutes before an event starts.
2. **Show today's agenda** — a scrollable list of upcoming events.
3. **Month grid** — a small calendar view; click a day to see that day's events.

## Data source — secret ICS URL (not OAuth)

User pastes their Google Calendar "Secret address in iCal format"
(`https://calendar.google.com/calendar/ical/<id>/private-<token>/basic.ics`)
into a new **Calendar** tab in settings. Read-only, no OAuth, no Google Cloud
project, no consent screen, no token refresh. Covers all three features, which
only need event title + start/end.

Rejected: OAuth 2.0 + Calendar API — heavy (cloud project, client secret,
loopback redirect, token storage/refresh, Google verification) for read-only
data a URL already gives us. Revisit only if we need to *write* events or
sub-minute freshness.

## Persistence — Rust-owned `calendar.json`

`calendar.json` in the existing `cozy-reminder` config dir:
`{ "url": "...", "lead_minutes": 5 }`. New commands `load_calendar_config` /
`save_calendar_config`, mirroring `load/save_reminders`.

Rust owns the URL (not `localStorage` like `cryMins`/size) because the fetch
runs with no window open. Lead time + URL live here; nothing else moves.

## Fetch + parse — `src-tauri/src/calendar.rs`

- A dedicated background thread (own sleep loop, ~10 min) — fetch over HTTPS is
  far too slow for the 10s scheduler tick, and a plain thread avoids coloring
  the codebase async for one blocking call. `// ponytail:` note it.
- HTTPS via **`ureq`** (blocking, rustls) — lighter than `reqwest`/hyper/tokio,
  which matters given the app's size-optimized release profile.
- Parse with the **`icalendar`** crate (handles line-unfolding/escaping).
- Expand recurring events with the **`rrule`** crate over a bounded
  `now → now+60d` window — covers both nudges and the visible month range.
  `// ponytail:` 60-day horizon; widen if the grid needs to page further.
- Cache `Vec<CalEvent { uid, title, start, end }>` (epoch secs) behind a
  `Mutex` in `AppState`. On a successful refetch, `emit("calendar-updated")`.
- Timezone handling: UTC (`Z`), `TZID` via the rrule/chrono-tz stack, and
  all-day `DATE` values. Exotic cases (floating-time recurrences, odd TZIDs)
  are best-effort. `// ponytail:` common cases; widen if events look off.
- Failures (bad URL, offline, parse error) are swallowed — keep the last good
  cache, never crash the ghost.

## Nudges — reuse the existing bubble path

The existing 10s scheduler tick *also* scans the cached events: if an event
starts within `lead_minutes` and its id isn't in the `active` set, insert it and
`emit("reminder-due", { id, label, poltergeist:false })` — the same event the
bubble queue already consumes.

- id = `__cal__<uid>__<start_epoch>` → dedupes, never double-fires.
- Label like `🗓 Standup in 5 min`.
- Frontend: clicking a `__cal__…` bubble just `celebrate(); showNext()` — **no**
  `ack_reminder` call (no backing reminder), same special-case shape as
  `__update__`. No sulk/poltergeist escalation (informational).
- Past events (`start < now`) are skipped so reopening the app doesn't fire
  stale nudges.

## Calendar window — 4th window

New `calendar` window in `tauri.conf.json`: `visible:false`, transparent,
non-activating, `skipTaskbar`, `focus:false` — exact clone of the `todo`
window. In `main.rs` setup: `make_nonactivating`, set icon,
`CloseRequested → prevent_close + hide`. Commands `set_calendar_visible` /
`calendar_visible` mirror the to-do pair. Loads `winpos.js`.

Files `src/calendar.html|calendar.js`, styled to match `todo.html`'s spectral
panel. One window, two stacked sections:
- **Agenda list** (top): next 7 days grouped by day, scrollable, themed
  scrollbar. Clicking the selected month-grid day filters here.
- **Month grid** (below): JS-rendered current month, a dot on days with events,
  prev/next month buttons, click a day → agenda filters to it. Read-only.

Data via new command `load_calendar_events()` returning the cached
`Vec<CalEvent>`; window calls it on show and on each `calendar-updated` emit.

## Settings — Calendar tab

New tab button + `<section>` in `settings.html`: ICS URL text field, lead-time
number input (min, default 5), a "show calendar window" checkbox (mirrors the
to-do toggle → `set_calendar_visible`/`calendar_visible`), and a "refresh now"
button → `refresh_calendar` command (forces an immediate fetch). URL + lead time
saved via `save_calendar_config` (debounced/on-save), wired in `settings.js`.

## Tests (the one runnable check)

In `calendar.rs`:
- `due_within_lead`: an event starting inside the lead window is due, one
  outside is not, a past event is not.
- `expands_rrule`: a known `FREQ=DAILY;COUNT=3` rule expands to 3 instances in
  the window.

## New dependencies

`ureq` (HTTPS), `icalendar` (parse), `rrule` (recurrence). All carry real
weight — hand-rolling an ICS parser + RRULE engine is the wheel not to reinvent.

## Explicitly skipped (YAGNI)

OAuth/write access, multiple calendars (one URL), free/busy meeting-suppression,
importing events into the reminder store, push freshness. Add if missed.

## Installer note

Per CLAUDE.md: any app change means rebuilding the installer with
`cargo tauri build` (the frontend is baked into the exe). Quit the running app
first.
