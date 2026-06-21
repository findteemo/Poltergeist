use cocoa::base::id;
use objc::{msg_send, sel, sel_impl};
use tauri::WebviewWindow;

// NSWindowStyleMaskNonactivatingPanel = 1 << 7. Combined with a floating level,
// this lets the overlay receive clicks without activating the app, so the user's
// active application keeps keyboard focus.
const NS_NONACTIVATING_PANEL: u64 = 1 << 7;
const NS_FLOATING_WINDOW_LEVEL: i64 = 3;

// ponytail: best-effort, built on a non-macOS host — needs verification on a Mac.
// Full guarantee that the window never becomes key may require an NSPanel
// subclass overriding canBecomeKeyWindow; upgrade there if clicks still steal focus.
pub fn make_nonactivating(window: &WebviewWindow) {
    let Ok(ns) = window.ns_window() else { return };
    let ns = ns as id;
    unsafe {
        let current: u64 = msg_send![ns, styleMask];
        let _: () = msg_send![ns, setStyleMask: current | NS_NONACTIVATING_PANEL];
        let _: () = msg_send![ns, setLevel: NS_FLOATING_WINDOW_LEVEL];
    }
}
