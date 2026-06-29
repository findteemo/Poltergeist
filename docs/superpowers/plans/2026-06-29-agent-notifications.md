# Agent Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The ghost pops a bubble when Claude Code or Codex finishes a turn (happy) or needs the user's action (angry + flames + chime).

**Architecture:** An external agent hook runs `poltergeist.exe notify …`, which writes a tiny JSON "note" file into a new `inbox/` dir under the existing config dir and exits before any GUI init. A 2s tokio tick in the running app drains that dir and emits the existing `reminder-due` event with extra `agent`/`kind` fields; the frontend renders a vendor logo + sets mood. A settings **Agents** tab one-click-installs the hooks by merging entries into `~/.claude/settings.json` (JSON) and `~/.codex/config.toml` (TOML), non-destructively.

**Tech Stack:** Rust (Tauri 2, tokio, serde_json, new dep `toml_edit`), static HTML/CSS/JS frontend.

## Global Constraints

- Run all `cargo` commands from `src-tauri/`.
- Ponytail style: stdlib/native before deps, shortest diff, mark deliberate shortcuts with `// ponytail:` comments; non-trivial logic leaves one runnable check.
- Config/data dir is `dirs::config_dir()/cozy-reminder/` (kept despite the rename). The inbox dir is `cozy-reminder/inbox/`.
- New bubble ids use the `__agent__<agent>__<event>` shape and are treated like the existing no-sulk sentinels (`__cal__`, `__break__`, `__update__`): **no sulk timer, no `ack_reminder`**, dismissed on click.
- `agent` ∈ {`claude`, `codex`}; `event`/`kind` ∈ {`finished`, `needs-action`}.
- Never steal focus: do not add window activation. No changes to `platform/`.
- Any app change requires rebuilding the installer (`cargo tauri build`) — call it out in docs, but the build itself is a manual release step, not part of these tasks.
- Config-file merges must be non-destructive: read → merge → write, never drop unrelated keys.

---

### Task 1: `agents.rs` — notes + inbox drain

**Files:**
- Create: `src-tauri/src/agents.rs`
- Modify: `src-tauri/src/main.rs:3-6` (add `mod agents;`)

**Interfaces:**
- Produces:
  - `pub struct AgentNote { pub agent: String, pub event: String }` (derives `serde::Serialize, serde::Deserialize, PartialEq, Debug, Clone`)
  - `pub fn inbox_dir(config_dir: &std::path::Path) -> std::path::PathBuf` — returns `<config_dir>/inbox`, creating it.
  - `pub fn write_note(dir: &std::path::Path, agent: &str, event: &str)` — writes `<unix_nanos>.json` containing the serialized note.
  - `pub fn drain_inbox(dir: &std::path::Path) -> Vec<AgentNote>` — reads every `*.json` in `dir`, deletes each file, returns the successfully-parsed notes (malformed files are deleted and skipped).
  - `pub fn bubble(note: &AgentNote) -> (String, String)` — returns `(id, label)`. `id = format!("__agent__{}__{}", note.agent, note.event)`. Label per the table below.

**Label table:**
- `finished` → `format!("✅ {} finished", Title)`
- `needs-action` → `format!("⚡ {} needs you", Title)`
- where `Title` is `"Claude"` for `claude`, `"Codex"` for `codex`, else the agent string with its first char uppercased.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/agents.rs`:

```rust
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
```

Add the module declaration in `src-tauri/src/main.rs` after line 3 (`mod calendar;`):

```rust
mod agents;
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cargo test agents`
Expected: 3 tests pass (`bubble_maps_agent_and_event`, `write_then_drain_roundtrips_and_clears`, `drain_skips_and_deletes_malformed`).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/agents.rs src-tauri/src/main.rs
git commit -m "feat: agent note inbox (write/drain/bubble)"
```

---

### Task 2: `notify` subcommand (intercept argv before GUI)

**Files:**
- Modify: `src-tauri/src/main.rs:379` (top of `fn main`)

**Interfaces:**
- Consumes: `agents::inbox_dir`, `agents::write_note` (Task 1); `store::path` (existing, returns `<config>/cozy-reminder/reminders.json`).
- Produces: behavior — `poltergeist.exe notify --agent <a> --event <e>` (Claude form) and `poltergeist.exe notify --from-codex '<json>'` (Codex form) write a note and exit(0) before Tauri builds.

> **VERIFY FIRST (external interface):** Before writing the Codex branch, confirm Codex's `notify` invocation: Codex spawns the configured `notify` program with the notification as a **single JSON argument** containing a `type` field (e.g. `agent-turn-complete`). Check current Codex docs/config. If the shape differs, adjust the parse in Step 1 — the mapping is intentionally defensive (defaults to `finished`).

- [ ] **Step 1: Add the subcommand intercept at the very top of `fn main`**

In `src-tauri/src/main.rs`, insert at the start of `fn main() {` (before the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` block at line 380):

```rust
    // Agent-notify subcommand: an external hook runs `poltergeist notify …` which
    // just drops a note file in the inbox and exits — never spins up a window.
    // Intercepted here, before any Tauri/WebView init.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("notify") {
        let config = store::path();
        let dir = agents::inbox_dir(config.parent().unwrap_or(&config));
        let flag = |name: &str| {
            args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
        };
        if args.iter().any(|a| a == "--from-codex") {
            // Codex passes the notification as a single JSON arg with a `type` field.
            // ponytail: defensive map — only an explicit approval/input type is
            // "needs-action"; everything else (incl. turn-complete) is "finished".
            let event = args.last()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(String::from))
                .map(|t| if t.contains("approval") || t.contains("input") || t.contains("permission") {
                    "needs-action"
                } else {
                    "finished"
                })
                .unwrap_or("finished");
            agents::write_note(&dir, "codex", event);
        } else if let (Some(agent), Some(event)) = (flag("--agent"), flag("--event")) {
            agents::write_note(&dir, &agent, &event);
        }
        std::process::exit(0);
    }
```

- [ ] **Step 2: Verify the subcommand writes a note and exits without a window**

Run (from `src-tauri/`):
```bash
cargo run -- notify --agent claude --event finished
```
Expected: process exits immediately (exit code 0), **no ghost window appears**, and a `*.json` file containing `{"agent":"claude","event":"finished"}` is created in the config dir's `inbox/` (`%APPDATA%/cozy-reminder/inbox/` on Windows).

Verify the file (PowerShell): `Get-Content $env:APPDATA\cozy-reminder\inbox\*.json` shows the note. Then delete it: `Remove-Item $env:APPDATA\cozy-reminder\inbox\*.json`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: poltergeist notify subcommand (writes inbox note, no window)"
```

---

### Task 3: inbox-scan tick → `reminder-due`

**Files:**
- Modify: `src-tauri/src/main.rs` (add `start_inbox_watch` near `start_scheduler` ~line 298; call it in `setup` ~line 458)

**Interfaces:**
- Consumes: `agents::inbox_dir`, `agents::drain_inbox`, `agents::bubble` (Task 1); `AppState.path` (existing, the reminders.json path).
- Produces: emits `reminder-due` with `{ id, label, agent, kind, poltergeist: false }` for each drained note.

- [ ] **Step 1: Add the watcher function**

In `src-tauri/src/main.rs`, after `start_scheduler` (after line 352) add:

```rust
/// 2s tick: drain the agent inbox and emit a `reminder-due` per note. Snappier
/// than the 10s scheduler so "finished" pings feel immediate. Notes fire once
/// (drain deletes them), so unlike reminders they need no `active` dedupe.
fn start_inbox_watch(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(2));
        loop {
            tick.tick().await;
            let dir = {
                let path = app.state::<AppState>().path.clone();
                agents::inbox_dir(path.parent().unwrap_or(&path))
            };
            for note in agents::drain_inbox(&dir) {
                let (id, label) = agents::bubble(&note);
                let _ = app.emit(
                    "reminder-due",
                    serde_json::json!({
                        "id": id, "label": label,
                        "agent": note.agent, "kind": note.event,
                        "poltergeist": false
                    }),
                );
            }
        }
    });
}
```

- [ ] **Step 2: Wire it into `setup`**

In `src-tauri/src/main.rs`, after `start_scheduler(app.handle().clone());` (line 454) add:

```rust
            start_inbox_watch(app.handle().clone());
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo build`
Expected: builds clean (no warnings about unused `start_inbox_watch`).

- [ ] **Step 4: Manual smoke test**

Run `cargo run` (ghost appears). In a second terminal from `src-tauri/`: `cargo run -- notify --agent claude --event finished`. Within ~2s the ghost should show a "✅ Claude finished" bubble. (Mood/logo come in Task 4 — for now just confirm the bubble text appears.) Close the app.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: 2s inbox watcher emits agent reminder-due bubbles"
```

---

### Task 4: Frontend — logo, mood, chime, dismissal

**Files:**
- Create: `src/agent-claude.svg`, `src/agent-codex.svg` (small vendor marks)
- Modify: `src/index.html` (add an `<img>` inside the bubble), `src/style.css` (logo sizing), `src/main.js` (payload handling)

**Interfaces:**
- Consumes: `reminder-due` payload now may include `agent` and `kind` (Task 3).
- Produces: bubble shows the agent logo; finished → happy, needs-action → angry + flames + chime; `__agent__…` ids dismiss without `ack_reminder`.

> **VERIFY FIRST (assets):** Add small (≈16–20px) SVGs for the Claude (Anthropic) and Codex/OpenAI marks at `src/agent-claude.svg` / `src/agent-codex.svg`. Keep them simple/monochrome-friendly. These are bundled into the exe at build time like the rest of `src/`.

- [ ] **Step 1: Add the logo element to the bubble**

In `src/index.html`, find the bubble markup (it contains `<span class="text">` and `<span class="hint">`). Add an image as the first child of the bubble:

```html
<img class="agentlogo" alt="" hidden />
```

- [ ] **Step 2: Style the logo**

In `src/style.css`, add:

```css
#bubble .agentlogo { width: 16px; height: 16px; vertical-align: -3px; margin-right: 4px; image-rendering: auto; }
#bubble .agentlogo[hidden] { display: none; }
```

- [ ] **Step 3: Handle the new payload fields in `showNext` and the click handler**

In `src/main.js`, grab the logo element near the other bubble refs (after line 310, `const bubbleHint = …`):

```js
const bubbleLogo = bubble.querySelector(".agentlogo");
const AGENT_LOGO = { claude: "agent-claude.svg", codex: "agent-codex.svg" };
```

Update `hintFor` (line 312-315) to treat agent ids like dismissable nudges (no change needed — the fallthrough already returns "click to dismiss"; agent ids don't match UPDATE_ID/BREAK_ID).

In `showNext` (line 326-347), after `bubbleText.textContent = next.label;` (line 338) add logo handling:

```js
  if (next.agent && AGENT_LOGO[next.agent]) {
    bubbleLogo.src = AGENT_LOGO[next.agent];
    bubbleLogo.hidden = false;
  } else {
    bubbleLogo.hidden = true;
  }
```

Replace the sulk-timer guard (lines 345-346) so agent bubbles also skip the sulk timer, and instead set mood immediately on show:

```js
  if (next.id.startsWith("__agent__")) {
    if (next.kind === "needs-action") setMood("angry"); // lights #flames (see setMood)
    else celebrate(); // finished → happy bounce
  } else if (next.id !== UPDATE_ID && next.id !== BREAK_ID && !next.id.startsWith("__cal__")) {
    moodTimer = setTimeout(() => setMood(next.poltergeist ? "angry" : "sad"), cryMs);
  }
```

Note: `chime()` already runs unconditionally near line 342 for every shown bubble and respects `muted`, so needs-action gets the chime for free; finished also chimes (acceptable — matches reminders).

In the bubble click handler (line 355-383), add an early branch for agent ids alongside the `__cal__` branch (after line 373, before the `__break__` branch):

```js
  // agent pings have no backing reminder — just dismiss (no ack_reminder).
  if (currentId.startsWith("__agent__")) {
    celebrate();
    showNext();
    return;
  }
```

- [ ] **Step 4: Add the id/label builder check (project style)**

The label is built Rust-side, but mirror a frontend assertion for the logo map near its definition (after the `AGENT_LOGO` const):

```js
console.assert(AGENT_LOGO.claude && AGENT_LOGO.codex, "agent logos mapped");
```

- [ ] **Step 5: Manual verification**

Run `cargo run`. From `src-tauri/` in another terminal:
- `cargo run -- notify --agent claude --event finished` → "✅ Claude finished" bubble with the Claude logo, ghost does a happy bounce.
- `cargo run -- notify --agent codex --event needs-action` → "⚡ Codex needs you" bubble with the Codex logo, ghost goes angry with lit flames, chime plays (if unmuted).
- Click each bubble → dismisses, ghost returns to normal. Confirm no console errors (right-click ghost → settings is unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/index.html src/style.css src/main.js src/agent-claude.svg src/agent-codex.svg
git commit -m "feat: agent bubbles show vendor logo + finished/needs-action mood"
```

---

### Task 5: `hooks.rs` — non-destructive config merge functions

**Files:**
- Create: `src-tauri/src/hooks.rs`
- Modify: `src-tauri/src/main.rs:3-6` (add `mod hooks;`), `src-tauri/Cargo.toml` (add `toml_edit`)

**Interfaces:**
- Produces (pure string transforms — the unit-tested core):
  - `pub fn merge_claude(json: &str, exe: &str) -> String` — given current `settings.json` text (or `""`), returns text with `Stop`→finished and `Notification`→needs-action command hooks added if absent (idempotent).
  - `pub fn remove_claude(json: &str) -> String` — strips our hook entries.
  - `pub fn has_claude(json: &str) -> bool`
  - `pub fn merge_codex(toml: &str, exe: &str) -> Result<String, String>` — sets `notify = [exe, "notify", "--from-codex"]` if `notify` is absent or already ours; `Err` if a *foreign* `notify` exists (don't clobber).
  - `pub fn remove_codex(toml: &str) -> String` — removes our `notify` if present.
  - `pub fn has_codex(toml: &str) -> bool`
- Produces (file IO wrappers, used by Task 6 commands):
  - `pub fn claude_settings_path() -> Option<PathBuf>` (`~/.claude/settings.json`)
  - `pub fn codex_config_path() -> Option<PathBuf>` (`~/.codex/config.toml`)
  - `pub fn exe_path() -> String` (quoted current exe path)
  - `pub fn install_claude() / uninstall_claude() / claude_state() -> bool`
  - `pub fn install_codex() -> Result<(),String> / uninstall_codex() / codex_state() -> bool`

Detection markers: a Claude hook command contains `--agent` + the agent name; a Codex `notify` array contains `--from-codex`.

> **VERIFY FIRST (external interface):** Confirm the current Claude Code hooks schema — `settings.json` → `hooks` object → event name (`Stop`, `Notification`) → array of `{ matcher?, hooks: [{ type: "command", command: "…" }] }`. And Codex's `~/.codex/config.toml` `notify` array-of-strings form. Adjust the structures below if the docs differ.

- [ ] **Step 1: Add the `toml_edit` dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
toml_edit = "0.22"
```

(Format-preserving TOML edits — the wheel not to reinvent for safely editing a user's config, same justification as the calendar crates.)

- [ ] **Step 2: Write `hooks.rs` with the failing tests**

Create `src-tauri/src/hooks.rs`:

```rust
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
    for (event, tail) in [("Stop", "--agent claude --event finished"),
                          ("Notification", "--agent claude --event needs-action")] {
        let cmd = claude_cmd(exe, tail);
        let arr = hooks
            .as_object_mut()
            .unwrap()
            .entry(event)
            .or_insert_with(|| serde_json::json!([]));
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
                arr.retain(|g| !g.to_string().contains("notify")
                    || !(g.to_string().contains("--agent claude")));
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
}
```

Add the module declaration in `src-tauri/src/main.rs` after `mod calendar;`:

```rust
mod hooks;
```

- [ ] **Step 3: Run the tests**

Run: `cargo test hooks`
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/hooks.rs src-tauri/src/main.rs
git commit -m "feat: non-destructive Claude/Codex hook config merge (hooks.rs)"
```

---

### Task 6: Tauri commands + settings Agents tab

**Files:**
- Modify: `src-tauri/src/main.rs` (add 5 commands + register them in `generate_handler!`)
- Modify: `src/settings.html` (Agents tab button + panel), `src/settings.js` (wiring)

**Interfaces:**
- Consumes: `hooks::{install_claude, uninstall_claude, claude_state, install_codex, uninstall_codex, codex_state}` (Task 5).
- Produces: commands `agent_hook_state`, `install_agent_hook`, `uninstall_agent_hook`.

- [ ] **Step 1: Add the commands in `main.rs`**

In `src-tauri/src/main.rs`, near the other `#[tauri::command]` fns (e.g. after `quit_app`, line 74), add:

```rust
/// (claude_installed, codex_installed) — for the settings Agents tab.
#[tauri::command]
fn agent_hook_state() -> (bool, bool) {
    (hooks::claude_state(), hooks::codex_state())
}

#[tauri::command]
fn install_agent_hook(agent: String) -> Result<(), String> {
    match agent.as_str() {
        "claude" => hooks::install_claude(),
        "codex" => hooks::install_codex(),
        _ => Err(format!("unknown agent {agent}")),
    }
}

#[tauri::command]
fn uninstall_agent_hook(agent: String) -> Result<(), String> {
    match agent.as_str() {
        "claude" => hooks::uninstall_claude(),
        "codex" => hooks::uninstall_codex(),
        _ => Err(format!("unknown agent {agent}")),
    }
}
```

Register them in `generate_handler!` (line 461-479), adding to the list:

```rust
            agent_hook_state,
            install_agent_hook,
            uninstall_agent_hook,
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo build`
Expected: builds clean.

- [ ] **Step 3: Add the Agents tab button + panel in `settings.html`**

In `src/settings.html`, add a tab button after the `focus` button (line 271):

```html
    <button class="tabbtn" data-tab="agents" role="tab" id="tabbtn-agents" aria-controls="tab-agents" aria-selected="false">agents</button>
```

Add the panel after the focus `<section>` (after line 337):

```html
    <!-- AGENTS (Claude Code / Codex notifications) -->
    <section class="tab" id="tab-agents" role="tabpanel" aria-labelledby="tabbtn-agents">
      <h2 class="grim">agents</h2>
      <div class="optrow">
        <span>Claude Code</span>
        <button class="add agentbtn" id="claudeHook" data-agent="claude">install hooks</button>
      </div>
      <div class="optrow">
        <span>Codex</span>
        <button class="add agentbtn" id="codexHook" data-agent="codex">install hooks</button>
      </div>
      <p class="calstatus" id="agentStatus" role="status" aria-live="polite"></p>
      <p class="calhint">The ghost nudges you when an agent finishes a turn or needs your input. Installing edits that agent's own config (~/.claude/settings.json, ~/.codex/config.toml). Quit &amp; relaunch the agent after installing.</p>
    </section>
```

- [ ] **Step 4: Wire the buttons in `settings.js`**

In `src/settings.js`, after the calendar block (around line 355), add:

```js
// ---- agents (Claude Code / Codex notifications) ----
const agentStatus = document.getElementById("agentStatus");
const agentBtns = [...document.querySelectorAll(".agentbtn")];

async function refreshAgentState() {
  const [claude, codex] = await invoke("agent_hook_state");
  const state = { claude, codex };
  for (const btn of agentBtns) {
    const on = state[btn.dataset.agent];
    btn.textContent = on ? "uninstall hooks" : "install hooks";
    btn.classList.toggle("on", on);
  }
}
refreshAgentState();

for (const btn of agentBtns) {
  btn.addEventListener("click", async () => {
    const agent = btn.dataset.agent;
    const installed = btn.classList.contains("on");
    try {
      await invoke(installed ? "uninstall_agent_hook" : "install_agent_hook", { agent });
      agentStatus.textContent = installed ? `${agent} hooks removed` : `${agent} hooks installed — relaunch ${agent}`;
    } catch (e) {
      agentStatus.textContent = `✗ ${e}`;
    }
    refreshAgentState();
  });
}
```

- [ ] **Step 5: Manual verification**

Run `cargo run`, right-click ghost → settings → **agents** tab.
- Click "install hooks" for Claude → button flips to "uninstall hooks", status says installed. Verify `~/.claude/settings.json` gained `Stop`/`Notification` entries pointing at the exe and that any pre-existing keys are intact.
- Click "install hooks" for Codex → if you have no existing `notify`, it installs; if you do, status shows the "not overwriting" error. Verify `~/.codex/config.toml`.
- Click "uninstall hooks" → entries removed, other keys intact.
- End-to-end: with Claude hooks installed and the ghost running, run a real Claude Code turn in another window → on Stop the ghost should bubble "✅ Claude finished".

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/main.rs src/settings.html src/settings.js
git commit -m "feat: settings Agents tab — one-click install Claude/Codex hooks"
```

---

### Task 7: Docs, capabilities, final build

**Files:**
- Modify: `CLAUDE.md`, `README.md`
- Check: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Verify capabilities**

Open `src-tauri/capabilities/default.json`. The new commands run from the existing `settings` window, which already invokes commands (e.g. `save_calendar_config`), so no new window entry is needed. Confirm there's no per-command allowlist that would block the three new commands; if invoke is broadly permitted (as for existing commands), no change. If a per-command list exists, add `agent_hook_state`, `install_agent_hook`, `uninstall_agent_hook`.

Run: `cargo run`, open settings → agents, click install — if it errors with a permissions/denied message, add the commands to the capability and rebuild. Expected: no permission error.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a new section documenting agent notifications. Insert after the "Focus timer (Pomodoro)" section:

```markdown
## Agent notifications (Claude Code / Codex)

The ghost nudges when a coding agent finishes a turn or needs action. An external
hook runs `poltergeist.exe notify --agent <claude|codex> --event <finished|needs-action>`
(Codex form: `notify --from-codex '<json>'`, parsed for its `type`). The subcommand
is intercepted at the top of `main()` — it drops a JSON note in `cozy-reminder/inbox/`
and exits before any window inits. `start_inbox_watch` (a 2s tokio tick in `main.rs`)
drains the inbox via `agents::drain_inbox` and emits `reminder-due` with extra
`agent`/`kind` fields. Frontend (`main.js`) shows the vendor logo (`src/agent-*.svg`),
and on show: finished → happy, needs-action → angry + `#flames` + chime. Agent ids
(`__agent__<agent>__<event>`) are no-sulk/no-ack sentinels like `__cal__`/`__break__`.

Hook install: settings **Agents** tab → `install_agent_hook` merges entries into the
agent's own config (`hooks.rs`): Claude `Stop`/`Notification` in `~/.claude/settings.json`
(JSON), Codex `notify` in `~/.codex/config.toml` (TOML via `toml_edit`). Merges are
non-destructive and refuse to clobber a foreign Codex `notify`. New dep: `toml_edit`.
```

Also add `inbox/` to the Persistence section's list of config-dir contents, and note the `notify` subcommand near Commands.

- [ ] **Step 3: Update `README.md`**

Add a short feature bullet/section describing agent notifications and that setup is one-click from settings → Agents (with a note to relaunch the agent afterward).

- [ ] **Step 4: Run the full test suite + build**

Run: `cargo test`
Expected: all tests pass (agents: 3, hooks: 4, plus existing reminders/store/calendar/point_in_any tests).

Run: `cargo build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md src-tauri/capabilities/default.json
git commit -m "docs: document agent notifications + inbox/notify subcommand"
```

- [ ] **Step 6: Release build (manual, per CLAUDE.md)**

> Reminder: the frontend is baked into the exe, so ship a fresh installer. Quit the running app first, then from `src-tauri/`: `cargo tauri build`. Bump the version and follow the auto-update release steps in CLAUDE.md if releasing.

---

## Self-Review

**Spec coverage:**
- A (signaling: CLI subcommand + file-drop + poll) → Tasks 1, 2, 3 ✓
- B (frontend bubble + logo + mood + chime + no-sulk dismiss) → Task 4 ✓
- C (notify subcommand, 2s inbox tick, prune/ignore malformed) → Tasks 1–3 ✓
- D (one-click install, Claude JSON merge, Codex TOML merge, non-destructive, state detection, Agents tab) → Tasks 5, 6 ✓
- E (Rust unit tests for mapping + merge; frontend assert; docs) → Tasks 1, 5 (tests), 4 (assert), 7 (docs) ✓
- Risks (verify external schemas; careful external-file edits) → "VERIFY FIRST" notes in Tasks 2, 4, 5; non-destructive merge with foreign-notify guard ✓
- Out of scope (other agents, history, per-session filtering) → not implemented ✓

**Placeholder scan:** No TBD/TODO; all code steps show complete code; the two "VERIFY FIRST" notes are explicit verification actions, not placeholders.

**Type consistency:** `AgentNote {agent, event}`, `bubble() -> (String, String)`, id shape `__agent__<agent>__<event>`, payload fields `agent`/`kind`, command names `agent_hook_state`/`install_agent_hook`/`uninstall_agent_hook`, and hook markers (`--agent claude …`, `--from-codex`) are used consistently across tasks.
