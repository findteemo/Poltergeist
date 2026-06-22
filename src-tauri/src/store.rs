use crate::reminders::{default_reminders, Reminder};
use std::path::{Path, PathBuf};

pub fn path() -> PathBuf {
    let mut p = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    p.push("cozy-reminder");
    let _ = std::fs::create_dir_all(&p);
    p.push("reminders.json");
    p
}

pub fn load(path: &Path) -> Vec<Reminder> {
    let loaded = match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| default_reminders()),
        Err(_) => default_reminders(),
    };
    // an empty list means the ghost would never nudge — treat it like missing and
    // reseed defaults. (You can still disable reminders individually.)
    if loaded.is_empty() {
        default_reminders()
    } else {
        loaded
    }
}

pub fn save(path: &Path, reminders: &[Reminder]) {
    if let Ok(s) = serde_json::to_string_pretty(reminders) {
        let _ = std::fs::write(path, s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_or_missing_reseeds_but_keeps_real_lists() {
        let p = std::env::temp_dir().join("poltergeist_store_test.json");
        std::fs::write(&p, "[]").unwrap();
        assert!(!load(&p).is_empty(), "empty file reseeds defaults");
        let _ = std::fs::remove_file(&p);
        assert!(!load(&p).is_empty(), "missing file reseeds defaults");
        // a real list is kept (and old JSON without fire_at/poltergeist still loads)
        let one = r#"[{"id":"a","label":"x","interval_secs":60,"enabled":true,"last_fired":0}]"#;
        std::fs::write(&p, one).unwrap();
        assert_eq!(load(&p).len(), 1, "non-empty list is kept verbatim");
        let _ = std::fs::remove_file(&p);
    }
}
