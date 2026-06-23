#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
fn save_reminders(state: State<AppState>, reminders: Vec<Reminder>) {
    let ids: HashSet<String> = {
        let mut r = state.reminders.lock().unwrap();
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
        let _ = std::fs::write(todos_path(&state), s);
    }
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
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
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            reminders: Mutex::new(reminders),
            active: Mutex::new(HashSet::new()),
            path,
            hit: Mutex::new(Vec::new()),
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
            // autostart is now driven by the frontend (char window) on load, so the
            // user's toggle persists across restarts. See set_autostart.
            start_scheduler(app.handle().clone());
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
            quit_app
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
