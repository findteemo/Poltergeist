// Google Calendar (read-only) via the calendar's secret ICS URL. We fetch the
// .ics over HTTPS on a background thread, parse it (icalendar), expand recurring
// events (rrule) over a bounded window, and cache the result. The scheduler turns
// upcoming events into the same `reminder-due` bubbles reminders use; the calendar
// window renders the cached list. No OAuth — the secret URL is all we need to read.
use chrono::{DateTime, TimeZone, Utc};
use icalendar::{Calendar, CalendarDateTime, Component, DatePerhapsTime};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// Load a window of recent past + near future: future for nudges, the recent past
// so the month grid isn't blank for days earlier this month.
// ponytail: ±this many days; widen if the grid needs to page further out.
const PAST_DAYS: i64 = 31;
const FUTURE_DAYS: i64 = 60;
const RRULE_LIMIT: u16 = 366; // cap occurrences per recurring event (rrule needs a bound)

#[derive(Clone, Serialize)]
pub struct CalEvent {
    pub uid: String,
    pub title: String,
    pub start: i64, // epoch secs
    pub end: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CalConfig {
    #[serde(default)]
    pub url: String,
    #[serde(default = "default_lead")]
    pub lead_minutes: u32,
}
fn default_lead() -> u32 {
    5
}
impl Default for CalConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            lead_minutes: default_lead(),
        }
    }
}

pub fn config_path(reminders_path: &Path) -> PathBuf {
    reminders_path.with_file_name("calendar.json")
}

pub fn load_config(path: &Path) -> CalConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(path: &Path, cfg: &CalConfig) {
    if let Ok(s) = serde_json::to_string_pretty(cfg) {
        crate::store::write_atomic(path, &s);
    }
}

/// Fetch + parse the ICS feed. `Err(msg)` carries a short human reason (caller
/// keeps its last good cache and surfaces the message); `Ok(events)` is the parsed
/// list (possibly empty, e.g. an empty calendar).
pub fn fetch(url: &str) -> Result<Vec<CalEvent>, String> {
    // https only — the secret ICS address IS the credential; never send it in
    // plaintext. Checked here (not just in the UI) so no caller can slip past.
    if !url.starts_with("https://") {
        return Err("the URL must start with https:// — the secret address is a credential".into());
    }
    // timeout so a stalled server can't hang the sync thread forever
    match ureq::get(url).timeout(std::time::Duration::from_secs(30)).call() {
        Ok(resp) => {
            let body = resp.into_string().map_err(|e| format!("couldn't read feed: {e}"))?;
            Ok(parse(&body, crate::reminders::now_secs() as i64))
        }
        // 401/403/404 on a Google feed almost always means the public URL was used
        // for a private calendar — point at the Secret address.
        Err(ureq::Error::Status(code @ (401 | 403 | 404), _)) => Err(format!(
            "HTTP {code} — use the calendar's “Secret address in iCal format”, not the public URL"
        )),
        Err(ureq::Error::Status(code, _)) => Err(format!("HTTP {code} from the feed")),
        Err(ureq::Error::Transport(t)) => Err(format!("can't reach the feed ({})", t.kind())),
    }
}

/// Parse ICS text into events within [now-PAST_DAYS, now+FUTURE_DAYS]. Split out
/// from `fetch` so it's testable without the network.
pub fn parse(ics: &str, now: i64) -> Vec<CalEvent> {
    let cal: Calendar = match ics.parse() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let from = now - PAST_DAYS * 86400;
    let until = now + FUTURE_DAYS * 86400;
    let mut out = Vec::new();
    for ev in cal.events() {
        let title = ev.get_summary().unwrap_or("(busy)").to_string();
        let uid = ev
            .properties()
            .get("UID")
            .map(|p| p.value().to_string())
            .unwrap_or_default();
        let Some(start) = ev.get_start().and_then(dpt_to_utc) else {
            continue;
        };
        let end = ev
            .get_end()
            .and_then(dpt_to_utc)
            .unwrap_or(start + chrono::Duration::hours(1));
        let dur = (end - start).num_seconds().max(0);

        match ev.properties().get("RRULE").map(|p| p.value()) {
            Some(rule_str) => {
                for s in expand(start, rule_str, from, until) {
                    out.push(CalEvent {
                        uid: uid.clone(),
                        title: title.clone(),
                        start: s,
                        end: s + dur,
                    });
                }
            }
            None => {
                let s = start.timestamp();
                if s < until && s >= from {
                    out.push(CalEvent {
                        uid,
                        title,
                        start: s,
                        end: s + dur,
                    });
                }
            }
        }
    }
    out.sort_by_key(|e| e.start);
    out
}

/// Expand a recurring event between `from` and `until`, returning instance starts
/// (epoch secs). Anchored in UTC.
// ponytail: recurrences expand at the event's fixed UTC offset, so a recurring
// local-time meeting can drift by an hour across a DST boundary inside the window.
// Acceptable for nudges; expand per-tz (rrule supports it) if drift ever bites.
fn expand(start: DateTime<Utc>, rrule_str: &str, from: i64, until: i64) -> Vec<i64> {
    let dtstart = start.with_timezone(&rrule::Tz::UTC);
    let after = rrule::Tz::UTC.timestamp_opt(from, 0).single();
    let before = rrule::Tz::UTC.timestamp_opt(until, 0).single();
    let (Some(after), Some(before)) = (after, before) else {
        return Vec::new();
    };
    let Ok(rule) = rrule_str.parse::<rrule::RRule<rrule::Unvalidated>>() else {
        return Vec::new();
    };
    let Ok(rule) = rule.validate(dtstart) else {
        return Vec::new();
    };
    rrule::RRuleSet::new(dtstart)
        .rrule(rule)
        .after(after)
        .before(before)
        .all(RRULE_LIMIT)
        .dates
        .into_iter()
        .map(|d| d.timestamp())
        .collect()
}

fn dpt_to_utc(d: DatePerhapsTime) -> Option<DateTime<Utc>> {
    match d {
        DatePerhapsTime::DateTime(cdt) => match cdt {
            CalendarDateTime::Utc(dt) => Some(dt),
            // ponytail: treat floating (no tz) times as UTC — rare, and good enough.
            CalendarDateTime::Floating(naive) => Some(Utc.from_utc_datetime(&naive)),
            CalendarDateTime::WithTimezone { date_time, tzid } => {
                let tz: chrono_tz::Tz = tzid.parse().ok()?;
                tz.from_local_datetime(&date_time)
                    .single()
                    .map(|d| d.with_timezone(&Utc))
            }
        },
        // all-day: pin to midnight UTC. ponytail: ignores local tz for all-day events.
        DatePerhapsTime::Date(date) => Some(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?)),
    }
}

/// Events starting within `lead_secs` from now (and not already past) → a bubble
/// id (so the scheduler can dedupe) and its label. id is `__cal__<uid>__<start>`.
pub fn due_nudges(events: &[CalEvent], now: i64, lead_secs: i64) -> Vec<(String, String)> {
    events
        .iter()
        .filter(|e| {
            let until_start = e.start - now;
            until_start >= 0 && until_start <= lead_secs
        })
        .map(|e| {
            let mins = ((e.start - now) as f64 / 60.0).round() as i64;
            let label = if mins <= 0 {
                format!("🗓 {} starting now", e.title)
            } else {
                format!("🗓 {} in {} min", e.title, mins)
            };
            (format!("__cal__{}__{}", e.uid, e.start), label)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(uid: &str, start: i64) -> CalEvent {
        CalEvent {
            uid: uid.into(),
            title: "Standup".into(),
            start,
            end: start + 1800,
        }
    }

    #[test]
    fn due_within_lead() {
        let now = 1_000_000;
        let lead = 5 * 60;
        let events = vec![
            ev("soon", now + 3 * 60),  // 3 min out → due
            ev("later", now + 30 * 60), // 30 min out → not yet
            ev("past", now - 60),       // already started → skip
        ];
        let due = due_nudges(&events, now, lead);
        assert_eq!(due.len(), 1, "only the within-lead future event nudges");
        assert!(due[0].0.starts_with("__cal__soon__"));
        assert!(due[0].1.contains("3 min"));
    }

    #[test]
    fn expands_rrule() {
        // a daily standup, 3 occurrences, anchored at a fixed UTC time
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:s1\r\nSUMMARY:Standup\r\nDTSTART:20300101T093000Z\r\nDTEND:20300101T094500Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        // window wide enough to include all 3 (now just before the first)
        let now = Utc
            .with_ymd_and_hms(2030, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        let events = parse(ics, now);
        assert_eq!(events.len(), 3, "FREQ=DAILY;COUNT=3 → 3 instances");
        assert_eq!(events[0].end - events[0].start, 15 * 60, "15-min duration kept");
        // instances are one day apart and sorted
        assert_eq!(events[1].start - events[0].start, 86400);
    }

    #[test]
    fn fetch_rejects_plaintext_url() {
        // fails before any network I/O — the secret URL must never go out unencrypted
        assert!(fetch("http://calendar.google.com/x.ics").is_err());
        assert!(fetch("ftp://x").is_err());
    }

    #[test]
    fn single_event_outside_window_dropped() {
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:old\r\nSUMMARY:Ancient\r\nDTSTART:20000101T090000Z\r\nDTEND:20000101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        let now = Utc
            .with_ymd_and_hms(2030, 1, 1, 0, 0, 0)
            .unwrap()
            .timestamp();
        assert!(parse(ics, now).is_empty(), "event years in the past is dropped");
    }
}
