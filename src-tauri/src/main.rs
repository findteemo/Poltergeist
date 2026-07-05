#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agents;
mod calendar;
mod hooks;
mod platform;
mod reminders;
mod store;

use reminders::{is_due, now_secs, Reminder};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

struct AppState {
    reminders: Mutex<Vec<Reminder>>,
    active: Mutex<HashSet<String>>, // ids currently shown, awaiting ack
    path: PathBuf,
    // Interactive rects (x, y, w, h) in the character window's CSS px — the ghost
    // and any visible bubble. Everything else in the transparent window is made
    // click-through. The frontend reports these via `set_hit_regions`.
    hit: Mutex<Vec<(f64, f64, f64, f64)>>,
    // Google Calendar (read-only ICS): cached events + the feed config, plus the
    // path to calendar.json. The sync thread refreshes the cache; the scheduler
    // turns due events into bubbles; the calendar window renders the list.
    cal_events: Mutex<Vec<calendar::CalEvent>>,
    cal_config: Mutex<calendar::CalConfig>,
    cal_path: PathBuf,
}

fn point_in_any(rects: &[(f64, f64, f64, f64)], x: f64, y: f64) -> bool {
    rects
        .iter()
        .any(|&(rx, ry, w, h)| x >= rx && x <= rx + w && y >= ry && y <= ry + h)
}

#[tauri::command]
fn load_reminders(state: State<AppState>) -> Vec<Reminder> {
    state.reminders.lock().unwrap().clone()
}

#[tauri::command]
fn save_reminders(state: State<AppState>, mut reminders: Vec<Reminder>) {
    // clamp at the trust boundary: a 0s interval would re-fire every tick
    for rem in reminders.iter_mut() {
        if rem.fire_at.is_none() {
            rem.interval_secs = rem.interval_secs.max(60);
        }
    }
    let ids: HashSet<String> = {
        let mut r = state.reminders.lock().unwrap();
        // the settings snapshot may be stale — keep our firing state (see reminders.rs)
        reminders::preserve_last_fired(&r, &mut reminders);
        *r = reminders;
        store::save(&state.path, &r);
        r.iter().map(|r| r.id.clone()).collect()
    };
    // prune active entries for reminders that were deleted
    state.active.lock().unwrap().retain(|id| ids.contains(id));
}

#[tauri::command]
fn ack_reminder(state: State<AppState>, id: String) {
    let now = now_secs();
    {
        let mut r = state.reminders.lock().unwrap();
        if let Some(pos) = r.iter().position(|r| r.id == id) {
            if r[pos].fire_at.is_some() {
                r.remove(pos); // one-shot: fired once, done
            } else {
                r[pos].last_fired = now;
            }
        }
        store::save(&state.path, &r);
    }
    state.active.lock().unwrap().remove(&id);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

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

/// The frontend reports which rects (ghost + visible bubble) should stay
/// clickable; the click-through poll makes the rest of the window pass clicks
/// through. Cross-platform store; only the Windows poll acts on it for now.
#[tauri::command]
fn set_hit_regions(state: State<AppState>, regions: Vec<(f64, f64, f64, f64)>) {
    *state.hit.lock().unwrap() = regions;
}

/// Poll the cursor and toggle the character window between solid (over the ghost
/// or a bubble) and click-through (everywhere else in the transparent box). The
/// webview gets no mouse events once the window is click-through and Tauri has no
/// forward flag, so re-entry must be detected OS-side — hence polling.
// ponytail: 50ms poll, fine for a single window; not worth an event-driven path.
#[cfg(target_os = "windows")]
fn start_click_through(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(50));
        let mut ignoring = false;
        loop {
            tick.tick().await;
            let Some(win) = app.get_webview_window("character") else {
                continue;
            };
            let rects = app.state::<AppState>().hit.lock().unwrap().clone();
            let want = if rects.is_empty() {
                // before the frontend reports its regions, keep the window solid so
                // the ghost is never accidentally click-through.
                false
            } else if let (Some((cx, cy)), Ok(pos)) =
                (platform::cursor_pos(), win.outer_position())
            {
                let scale = win.scale_factor().unwrap_or(1.0);
                let rx = (cx - pos.x) as f64 / scale;
                let ry = (cy - pos.y) as f64 / scale;
                !point_in_any(&rects, rx, ry)
            } else {
                ignoring // can't read cursor/position this tick — hold state
            };
            if want != ignoring {
                let _ = win.set_ignore_cursor_events(want);
                ignoring = want;
            }
        }
    });
}

// ---- Google Calendar (read-only ICS feed) ----

#[tauri::command]
fn load_calendar_config(state: State<AppState>) -> calendar::CalConfig {
    state.cal_config.lock().unwrap().clone()
}

#[tauri::command]
fn save_calendar_config(app: AppHandle, state: State<AppState>, config: calendar::CalConfig) {
    calendar::save_config(&state.cal_path, &config);
    *state.cal_config.lock().unwrap() = config;
    // pasting/clearing a URL should take effect now, not at the next 10-min tick
    let app = app.clone();
    std::thread::spawn(move || refetch_calendar(&app));
}

#[tauri::command]
fn load_calendar_events(state: State<AppState>) -> Vec<calendar::CalEvent> {
    state.cal_events.lock().unwrap().clone()
}

#[tauri::command]
fn set_calendar_visible(app: AppHandle, visible: bool) {
    if let Some(w) = app.get_webview_window("calendar") {
        let _ = if visible { w.show() } else { w.hide() };
    }
}

#[tauri::command]
fn calendar_visible(app: AppHandle) -> bool {
    app.get_webview_window("calendar")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Fetch the ICS feed once and swap the cache in on success (a fetch/parse error
/// keeps the last good cache so the ghost never shows a blank calendar offline).
/// Emits `calendar-status` with a short human message so the settings tab can show
/// whether the feed actually loaded — silent failure is impossible to debug.
fn refetch_calendar(app: &AppHandle) {
    let state = app.state::<AppState>();
    let url = state.cal_config.lock().unwrap().url.clone();
    if url.trim().is_empty() {
        *state.cal_events.lock().unwrap() = Vec::new();
        let _ = app.emit("calendar-updated", ());
        let _ = app.emit("calendar-status", "no calendar URL set");
        return;
    }
    match calendar::fetch(&url) {
        Ok(events) => {
            let msg = format!("✓ loaded {} event(s)", events.len());
            *state.cal_events.lock().unwrap() = events;
            let _ = app.emit("calendar-updated", ());
            let _ = app.emit("calendar-status", msg);
        }
        Err(msg) => {
            let _ = app.emit("calendar-status", format!("✗ {msg}"));
        }
    }
}

/// Background thread: refresh the feed every 10 min. A plain thread (not the tokio
/// scheduler) — blocking HTTPS has no business on the 10s tick, and one blocking
/// call isn't worth coloring the rest async. ponytail: fixed 10-min poll.
fn start_calendar_sync(app: AppHandle) {
    std::thread::spawn(move || loop {
        refetch_calendar(&app);
        std::thread::sleep(Duration::from_secs(600));
    });
}

// To-do tasks persist in todos.json next to reminders.json. Stored as raw JSON
// (the frontend's array of {id,text}) so there's no struct to keep in sync.
fn todos_path(state: &AppState) -> PathBuf {
    state.path.with_file_name("todos.json")
}

#[tauri::command]
fn load_todos(state: State<AppState>) -> serde_json::Value {
    std::fs::read_to_string(todos_path(&state))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!([]))
}

#[tauri::command]
fn save_todos(state: State<AppState>, todos: serde_json::Value) {
    if let Ok(s) = serde_json::to_string_pretty(&todos) {
        store::write_atomic(&todos_path(&state), &s);
    }
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        // the page's reminder list is a snapshot — tell it to refresh (settings.js)
        let _ = w.emit("settings-shown", ());
    }
}

/// Show/hide the floating to-do list window. Driven by the settings toggle.
#[tauri::command]
fn set_todo_visible(app: AppHandle, visible: bool) {
    if let Some(w) = app.get_webview_window("todo") {
        let _ = if visible { w.show() } else { w.hide() };
    }
}

/// Actual visibility of the to-do window — settings reads this to keep its
/// "show list" toggle honest after the to-do window self-hides (its X button).
#[tauri::command]
fn todo_visible(app: AppHandle) -> bool {
    app.get_webview_window("todo")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Enable/disable launch-at-login. Frontend calls this on its own startup with
/// the saved pref, so the toggle survives restarts (registry key IS the state).
#[cfg(windows)]
#[tauri::command]
fn set_autostart(enabled: bool) {
    if enabled {
        register_autostart();
    } else {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "Poltergeist",
                "/f",
            ])
            .creation_flags(0x08000000)
            .output();
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn set_autostart(_enabled: bool) {}

/// Check GitHub Releases for a newer build on startup. If one exists, nudge the
/// ghost (the frontend shows a one-off "update ready" bubble). The download +
/// install happens in `install_update` only when the user clicks that bubble.
fn start_update_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_updater::UpdaterExt;
        if let Ok(updater) = app.updater() {
            if let Ok(Some(update)) = updater.check().await {
                let _ = app.emit("update-available", update.version.clone());
            }
        }
    });
}

/// Download + install the pending update, then relaunch. Re-checks instead of
/// caching the Update handle (it isn't Send across awaits); the manifest is tiny.
// ponytail: double network check (startup + here) is cheaper than the plumbing to cache.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

/// Single 10s tick loop. Emits `reminder-due` once per due reminder and holds it
/// in `active` until acked, so it nudges gently instead of re-firing every tick.
fn start_scheduler(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(10));
        loop {
            tick.tick().await;
            let now = now_secs();
            let due: Vec<Reminder> = {
                let state = app.state::<AppState>();
                let reminders = state.reminders.lock().unwrap();
                let mut active = state.active.lock().unwrap();
                let mut out = Vec::new();
                for r in reminders.iter() {
                    if is_due(r, now) && !active.contains(&r.id) {
                        active.insert(r.id.clone());
                        out.push(r.clone());
                    }
                }
                out
            };
            for r in due {
                let _ = app.emit(
                    "reminder-due",
                    serde_json::json!({ "id": r.id, "label": r.label, "poltergeist": r.poltergeist }),
                );
            }

            // calendar nudges: same `reminder-due` bubble path, deduped via `active`.
            let cal_due: Vec<(String, String)> = {
                let state = app.state::<AppState>();
                let events = state.cal_events.lock().unwrap();
                let lead = state.cal_config.lock().unwrap().lead_minutes as i64 * 60;
                let mut active = state.active.lock().unwrap();
                // drop fired calendar ids whose event has passed (the trailing epoch
                // in `__cal__<uid>__<start>`); non-calendar ids are left untouched.
                active.retain(|id| {
                    id.strip_prefix("__cal__")
                        .and_then(|s| s.rsplit("__").next())
                        .and_then(|n| n.parse::<i64>().ok())
                        .map(|start| start >= now as i64)
                        .unwrap_or(true)
                });
                calendar::due_nudges(&events, now as i64, lead)
                    .into_iter()
                    .filter(|(id, _)| active.insert(id.clone()))
                    .collect()
            };
            for (id, label) in cal_due {
                let _ = app.emit(
                    "reminder-due",
                    serde_json::json!({ "id": id, "label": label, "poltergeist": false }),
                );
            }
        }
    });
}

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

/// Launch at login via the HKCU Run key. Native reg.exe, no extra crate.
/// Idempotent — rewrites the same value each launch. Points at whatever exe is
/// running (dev build or installed). Remove with:
///   reg delete HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v Poltergeist /f
#[cfg(windows)]
fn register_autostart() {
    use std::os::windows::process::CommandExt;
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "Poltergeist",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{}\"", exe.display()), // quote: installed path has spaces
                "/f",
            ])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW — no console flash
            .output();
    }
}

fn main() {
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

    // ponytail: trim WebView2's RAM — cap renderer processes and drop the GPU
    // process. Cuts the process count/footprint; raise the limit if the UI lags.
    #[cfg(windows)]
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        // autoplay-policy: the ghost window never takes focus, so without this
        // WebView2 blocks the reminder chime as un-gestured audio.
        "--disable-gpu --disable-software-rasterizer --renderer-process-limit=1 --disable-features=Translate --autoplay-policy=no-user-gesture-required",
    );

    // Manage state on the builder (not in setup): a window's webview can fire IPC
    // before the setup hook's manage() runs, which raced as "state not managed".
    let path = store::path();
    let reminders = store::load(&path);
    let cal_path = calendar::config_path(&path);
    let cal_config = calendar::load_config(&cal_path);
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            reminders: Mutex::new(reminders),
            active: Mutex::new(HashSet::new()),
            path,
            hit: Mutex::new(Vec::new()),
            cal_events: Mutex::new(Vec::new()),
            cal_config: Mutex::new(cal_config),
            cal_path,
        })
        .setup(|app| {
            // ghost window/taskbar icon (raw RGBA generated by scripts/make_icon.js)
            const ICON_RGBA: &[u8] = include_bytes!("../icons/icon.rgba");
            let icon = || tauri::image::Image::new(ICON_RGBA, 32, 32);
            if let Some(win) = app.get_webview_window("character") {
                platform::make_nonactivating(&win);
                let _ = win.set_icon(icon());
            }
            // closing the settings window just hides it, so it stays reusable
            if let Some(settings) = app.get_webview_window("settings") {
                let _ = settings.set_icon(icon());
                let s = settings.clone();
                settings.on_window_event(move |e| {
                    if let WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = s.hide();
                    }
                });
            }
            // floating to-do list: non-activating (don't steal focus) and closing
            // hides it, same as settings. Visibility is driven by the settings toggle.
            if let Some(todo) = app.get_webview_window("todo") {
                platform::make_nonactivating(&todo);
                let _ = todo.set_icon(icon());
                let t = todo.clone();
                todo.on_window_event(move |e| {
                    if let WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = t.hide();
                    }
                });
            }
            // calendar window: same non-activating + hide-on-close treatment as
            // the to-do window. Visibility is driven by the settings toggle.
            if let Some(cal) = app.get_webview_window("calendar") {
                platform::make_nonactivating(&cal);
                let _ = cal.set_icon(icon());
                let c = cal.clone();
                cal.on_window_event(move |e| {
                    if let WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = c.hide();
                    }
                });
            }
            // autostart is now driven by the frontend (char window) on load, so the
            // user's toggle persists across restarts. See set_autostart.
            start_scheduler(app.handle().clone());
            start_inbox_watch(app.handle().clone());
            start_calendar_sync(app.handle().clone());
            start_update_check(app.handle().clone());
            #[cfg(target_os = "windows")]
            start_click_through(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_reminders,
            save_reminders,
            ack_reminder,
            open_settings,
            set_todo_visible,
            todo_visible,
            set_autostart,
            install_update,
            load_todos,
            save_todos,
            set_hit_regions,
            load_calendar_config,
            save_calendar_config,
            load_calendar_events,
            set_calendar_visible,
            calendar_visible,
            quit_app,
            agent_hook_state,
            install_agent_hook,
            uninstall_agent_hook
        ])
        .run(tauri::generate_context!())
        .expect("error while running Poltergeist");
}

#[cfg(test)]
mod tests {
    use super::point_in_any;

    #[test]
    fn hit_test() {
        let r = [(10.0, 20.0, 100.0, 50.0)];
        assert!(point_in_any(&r, 10.0, 20.0)); // top-left corner
        assert!(point_in_any(&r, 60.0, 45.0)); // inside
        assert!(point_in_any(&r, 110.0, 70.0)); // bottom-right corner
        assert!(!point_in_any(&r, 9.0, 45.0)); // left of rect
        assert!(!point_in_any(&r, 60.0, 71.0)); // below rect
        assert!(!point_in_any(&[], 60.0, 45.0)); // no regions → never inside
    }
}
