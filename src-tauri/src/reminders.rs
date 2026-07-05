use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub label: String,
    pub interval_secs: u64,
    pub enabled: bool,
    pub last_fired: i64,
    // Some(epoch secs) = one-shot scheduled reminder; None = recurring interval.
    // serde default keeps old reminders.json (without this field) loading fine.
    #[serde(default)]
    pub fire_at: Option<i64>,
    // poltergeist mode: when ignored too long the ghost turns angry (flames)
    // instead of sad. serde default keeps old reminders.json loading.
    #[serde(default)]
    pub poltergeist: bool,
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// When a reminder is due. One-shot (`fire_at`) fires once `now` reaches its time.
/// Recurring fires when at least `interval_secs` have passed since it last fired
/// (a future `last_fired`, used to stagger startup, is not due).
pub fn is_due(r: &Reminder, now: i64) -> bool {
    if !r.enabled {
        return false;
    }
    match r.fire_at {
        Some(t) => now >= t,
        None => now - r.last_fired >= r.interval_secs as i64,
    }
}

/// Keep the scheduler's `last_fired` for reminders that already exist. The
/// settings window's list is a snapshot loaded at app start; writing it back
/// verbatim on save would rewind firing state (reminders fire early after any
/// save). The frontend never legitimately edits `last_fired`, so the backend's
/// value wins for matching ids; brand-new reminders keep their own.
// ponytail: O(n²) id lookup — fine for a hand-curated reminder list.
pub fn preserve_last_fired(current: &[Reminder], incoming: &mut [Reminder]) {
    for r in incoming.iter_mut() {
        if let Some(cur) = current.iter().find(|c| c.id == r.id) {
            r.last_fired = cur.last_fired;
        }
    }
}

pub fn default_reminders() -> Vec<Reminder> {
    let now = now_secs();
    let items = [
        ("hydrate", "time for a sip of water"),
        ("posture", "posture check — sit up gently"),
        ("stretch", "stretch break — reach for the sky"),
    ];
    items
        .iter()
        .enumerate()
        .map(|(i, (id, label))| Reminder {
            id: id.to_string(),
            label: label.to_string(),
            interval_secs: 1800,
            enabled: true,
            // ponytail: stagger first fires by a minute each so they don't cluster
            last_fired: now + (i as i64) * 60,
            fire_at: None,
            poltergeist: false,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(last_fired: i64, interval_secs: u64, enabled: bool) -> Reminder {
        Reminder {
            id: "x".into(),
            label: "".into(),
            interval_secs,
            enabled,
            last_fired,
            fire_at: None,
            poltergeist: false,
        }
    }

    fn one_shot(fire_at: i64, enabled: bool) -> Reminder {
        Reminder { fire_at: Some(fire_at), enabled, ..r(0, 0, enabled) }
    }

    #[test]
    fn due_logic() {
        let now = 1000;
        assert!(is_due(&r(0, 500, true), now), "interval elapsed");
        assert!(!is_due(&r(900, 500, true), now), "not enough time passed");
        assert!(!is_due(&r(0, 500, false), now), "disabled never fires");
        assert!(!is_due(&r(2000, 500, true), now), "future last_fired (staggered) not due");
        assert!(is_due(&r(500, 500, true), now), "exactly at interval is due");

        // one-shot scheduled reminders
        assert!(is_due(&one_shot(900, true), now), "one-shot past time is due");
        assert!(is_due(&one_shot(1000, true), now), "one-shot exactly now is due");
        assert!(!is_due(&one_shot(1100, true), now), "one-shot future not due");
        assert!(!is_due(&one_shot(900, false), now), "disabled one-shot never fires");
    }

    #[test]
    fn preserve_last_fired_keeps_backend_state() {
        let current = vec![r(500, 1800, true)]; // backend: fired at 500
        let mut incoming = vec![r(0, 900, true), // stale snapshot of the same id
            Reminder { id: "new".into(), ..r(999, 60, true) }]; // brand-new reminder
        preserve_last_fired(&current, &mut incoming);
        assert_eq!(incoming[0].last_fired, 500, "matching id keeps backend last_fired");
        assert_eq!(incoming[0].interval_secs, 900, "edited interval survives");
        assert_eq!(incoming[1].last_fired, 999, "new reminder keeps its own");
    }
}
