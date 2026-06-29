use std::path::PathBuf;

const CLAUDE_FINISHED: &str = "--agent claude --event finished";
const CLAUDE_NEEDS: &str = "--agent claude --event needs-action";
const CODEX_MARK: &str = "--from-codex";

pub fn exe_path() -> String {
    std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "poltergeist".to_string())
}

fn claude_cmd(exe: &str, tail: &str) -> String {
    format!("\"{exe}\" notify {tail}")
}

// ---- Claude Code (settings.json, JSON) ----

pub fn has_claude(json: &str) -> bool {
    json.contains(CLAUDE_FINISHED) || json.contains(CLAUDE_NEEDS)
}

pub fn merge_claude(json: &str, exe: &str) -> String {
    let mut root: serde_json::Value =
        serde_json::from_str(json).unwrap_or_else(|_| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let hooks = root
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));
    if !hooks.is_object() { *hooks = serde_json::json!({}); }
    for (event, tail) in [("Stop", CLAUDE_FINISHED),
                          ("Notification", CLAUDE_NEEDS)] {
        let cmd = claude_cmd(exe, tail);
        let arr = hooks
            .as_object_mut()
            .unwrap()
            .entry(event)
            .or_insert_with(|| serde_json::json!([]));
        if !arr.is_array() { *arr = serde_json::json!([]); }
        let already = arr.as_array().map(|a| {
            a.iter().any(|g| g.to_string().contains(tail))
        }).unwrap_or(false);
        if !already {
            if let Some(a) = arr.as_array_mut() {
                a.push(serde_json::json!({
                    "hooks": [ { "type": "command", "command": cmd } ]
                }));
            }
        }
    }
    serde_json::to_string_pretty(&root).unwrap_or_else(|_| json.to_string())
}

pub fn remove_claude(json: &str) -> String {
    let Ok(mut root) = serde_json::from_str::<serde_json::Value>(json) else {
        return json.to_string();
    };
    if let Some(hooks) = root.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        for event in ["Stop", "Notification"] {
            if let Some(arr) = hooks.get_mut(event).and_then(|a| a.as_array_mut()) {
                arr.retain(|g| {
                    let s = g.to_string();
                    !(s.contains(CLAUDE_FINISHED) || s.contains(CLAUDE_NEEDS))
                });
            }
        }
    }
    serde_json::to_string_pretty(&root).unwrap_or_else(|_| json.to_string())
}

// ---- Codex (config.toml, TOML) ----

pub fn has_codex(toml: &str) -> bool {
    toml.contains(CODEX_MARK)
}

pub fn merge_codex(toml: &str, exe: &str) -> Result<String, String> {
    let mut doc = toml.parse::<toml_edit::DocumentMut>()
        .map_err(|e| format!("can't parse config.toml: {e}"))?;
    if let Some(item) = doc.get("notify") {
        // already ours? fine. foreign? don't clobber.
        if !item.to_string().contains(CODEX_MARK) {
            return Err("Codex already has a `notify` program — not overwriting. \
                        Remove it or use the copy-paste snippet.".into());
        }
    }
    let mut arr = toml_edit::Array::new();
    arr.push(exe);
    arr.push("notify");
    arr.push("--from-codex");
    doc["notify"] = toml_edit::value(arr);
    Ok(doc.to_string())
}

pub fn remove_codex(toml: &str) -> String {
    let Ok(mut doc) = toml.parse::<toml_edit::DocumentMut>() else {
        return toml.to_string();
    };
    let ours = doc.get("notify").map(|i| i.to_string().contains(CODEX_MARK)).unwrap_or(false);
    if ours {
        doc.remove("notify");
    }
    doc.to_string()
}

// ---- file paths + IO wrappers ----

pub fn claude_settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("settings.json"))
}
pub fn codex_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("config.toml"))
}

pub fn claude_state() -> bool {
    claude_settings_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| has_claude(&s))
        .unwrap_or(false)
}
pub fn codex_state() -> bool {
    codex_config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| has_codex(&s))
        .unwrap_or(false)
}

pub fn install_claude() -> Result<(), String> {
    let path = claude_settings_path().ok_or("no home dir")?;
    if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
    let cur = std::fs::read_to_string(&path).unwrap_or_default();
    let next = merge_claude(&cur, &exe_path());
    std::fs::write(&path, next).map_err(|e| e.to_string())
}
pub fn uninstall_claude() -> Result<(), String> {
    let path = claude_settings_path().ok_or("no home dir")?;
    let Ok(cur) = std::fs::read_to_string(&path) else { return Ok(()) };
    std::fs::write(&path, remove_claude(&cur)).map_err(|e| e.to_string())
}
pub fn install_codex() -> Result<(), String> {
    let path = codex_config_path().ok_or("no home dir")?;
    if let Some(parent) = path.parent() { let _ = std::fs::create_dir_all(parent); }
    let cur = std::fs::read_to_string(&path).unwrap_or_default();
    let next = merge_codex(&cur, &exe_path())?;
    std::fs::write(&path, next).map_err(|e| e.to_string())
}
pub fn uninstall_codex() -> Result<(), String> {
    let path = codex_config_path().ok_or("no home dir")?;
    let Ok(cur) = std::fs::read_to_string(&path) else { return Ok(()) };
    std::fs::write(&path, remove_codex(&cur)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_claude_is_idempotent_and_preserves_other_keys() {
        let start = r#"{"model":"opus","hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}"#;
        let once = merge_claude(start, "C:\\p\\poltergeist.exe");
        assert!(once.contains("\"model\": \"opus\""), "unrelated keys kept");
        assert!(once.contains("echo hi"), "existing Stop hook kept");
        assert!(has_claude(&once));
        assert!(once.contains("--agent claude --event needs-action"), "Notification added");
        let twice = merge_claude(&once, "C:\\p\\poltergeist.exe");
        assert_eq!(once.matches("--agent claude --event finished").count(),
                   twice.matches("--agent claude --event finished").count(),
                   "idempotent — no duplicate entries");
    }

    #[test]
    fn merge_claude_from_empty() {
        let out = merge_claude("", "p.exe");
        assert!(has_claude(&out));
        let removed = remove_claude(&out);
        assert!(!has_claude(&removed), "remove undoes merge");
    }

    #[test]
    fn merge_codex_sets_notify_when_absent() {
        let out = merge_codex("model = \"o3\"\n", "C:\\p\\poltergeist.exe").unwrap();
        assert!(out.contains("model = \"o3\""), "unrelated keys kept");
        assert!(has_codex(&out));
        let twice = merge_codex(&out, "C:\\p\\poltergeist.exe").unwrap();
        assert!(has_codex(&twice), "ours is re-applied cleanly");
    }

    #[test]
    fn merge_codex_refuses_foreign_notify() {
        let foreign = "notify = [\"/usr/bin/other\"]\n";
        assert!(merge_codex(foreign, "p.exe").is_err());
        // but removing a foreign notify is a no-op (only removes ours)
        assert_eq!(remove_codex(foreign).trim(), foreign.trim());
    }

    // Fix 3: remove_claude must not touch a co-located user hook
    #[test]
    fn remove_claude_preserves_user_hook() {
        let start = r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}"#;
        let merged = merge_claude(start, "p.exe");
        assert!(has_claude(&merged), "our hook was added");
        assert!(merged.contains("echo hi"), "user hook present before remove");
        let removed = remove_claude(&merged);
        assert!(!has_claude(&removed), "our hook was removed");
        assert!(removed.contains("echo hi"), "user hook survives remove_claude");
    }

    // Fix 4a: merge_codex idempotent — exactly one notify key after two merges
    #[test]
    fn merge_codex_idempotent_single_notify() {
        let start = "model = \"o3\"\n";
        let once = merge_codex(start, "p.exe").unwrap();
        let twice = merge_codex(&once, "p.exe").unwrap();
        assert_eq!(twice.matches("notify =").count(), 1,
                   "exactly one notify key after two merges; got:\n{twice}");
    }

    // Fix pass 2 — Change 2: non-array event value is replaced with empty array
    #[test]
    fn merge_claude_handles_non_array_event() {
        let bad = r#"{"hooks":{"Stop":null}}"#;
        let out = merge_claude(bad, "p.exe");
        assert!(has_claude(&out), "our finished hook was added despite Stop:null");
    }

    // Fix 4b: merge_claude must not panic when "hooks" exists but isn't an object
    #[test]
    fn merge_claude_handles_non_object_hooks() {
        let null_hooks = r#"{"hooks": null}"#;
        let out = merge_claude(null_hooks, "p.exe");
        assert!(has_claude(&out), "hooks:null handled — our entries present");

        let arr_hooks = r#"{"hooks": []}"#;
        let out = merge_claude(arr_hooks, "p.exe");
        assert!(has_claude(&out), "hooks:[] handled — our entries present");
    }
}
