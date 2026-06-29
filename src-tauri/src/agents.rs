use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct AgentNote {
    pub agent: String,
    pub event: String,
}

/// `<config_dir>/inbox`, created if missing. Agents drop note files here via the
/// `notify` subcommand; the running app drains them on a tick.
pub fn inbox_dir(config_dir: &Path) -> PathBuf {
    let dir = config_dir.join("inbox");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Write one note file named by nanos so concurrent agents don't collide.
pub fn write_note(dir: &Path, agent: &str, event: &str) {
    let note = AgentNote { agent: agent.to_string(), event: event.to_string() };
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    if let Ok(s) = serde_json::to_string(&note) {
        let _ = std::fs::write(dir.join(format!("{nanos}.json")), s);
    }
}

/// Read + delete every note file, returning the parseable ones. A malformed file
/// is deleted and skipped so it can't wedge the inbox.
pub fn drain_inbox(dir: &Path) -> Vec<AgentNote> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return out };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(s) = std::fs::read_to_string(&path) {
            if let Ok(note) = serde_json::from_str::<AgentNote>(&s) {
                out.push(note);
            }
        }
        let _ = std::fs::remove_file(&path);
    }
    out
}

fn title(agent: &str) -> String {
    match agent {
        "claude" => "Claude".to_string(),
        "codex" => "Codex".to_string(),
        other => {
            let mut c = other.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        }
    }
}

/// (id, label) for a note. id reuses the no-sulk sentinel shape.
pub fn bubble(note: &AgentNote) -> (String, String) {
    let id = format!("__agent__{}__{}", note.agent, note.event);
    let label = match note.event.as_str() {
        "needs-action" => format!("⚡ {} needs you", title(&note.agent)),
        _ => format!("✅ {} finished", title(&note.agent)),
    };
    (id, label)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bubble_maps_agent_and_event() {
        let (id, label) = bubble(&AgentNote { agent: "claude".into(), event: "finished".into() });
        assert_eq!(id, "__agent__claude__finished");
        assert_eq!(label, "✅ Claude finished");
        let (id, label) = bubble(&AgentNote { agent: "codex".into(), event: "needs-action".into() });
        assert_eq!(id, "__agent__codex__needs-action");
        assert_eq!(label, "⚡ Codex needs you");
    }

    #[test]
    fn write_then_drain_roundtrips_and_clears() {
        let dir = std::env::temp_dir().join(format!("pg_inbox_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let dir = inbox_dir(&dir);
        write_note(&dir, "claude", "finished");
        write_note(&dir, "codex", "needs-action");
        let mut notes = drain_inbox(&dir);
        notes.sort_by(|a, b| a.agent.cmp(&b.agent));
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0], AgentNote { agent: "claude".into(), event: "finished".into() });
        assert!(drain_inbox(&dir).is_empty(), "drain deletes the files");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn drain_skips_and_deletes_malformed() {
        let dir = std::env::temp_dir().join(format!("pg_inbox_bad_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let dir = inbox_dir(&dir);
        std::fs::write(dir.join("1.json"), "not json").unwrap();
        assert!(drain_inbox(&dir).is_empty());
        assert!(drain_inbox(&dir).is_empty(), "malformed file was deleted, not retried");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
