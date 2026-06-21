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
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| default_reminders()),
        Err(_) => default_reminders(),
    }
}

pub fn save(path: &Path, reminders: &[Reminder]) {
    if let Ok(s) = serde_json::to_string_pretty(reminders) {
        let _ = std::fs::write(path, s);
    }
}
