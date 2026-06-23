//! Per-OS tweaks to make the character window non-activating (never steals focus).

#[cfg(windows)]
mod win;
#[cfg(windows)]
pub use win::{cursor_pos, make_nonactivating};

#[cfg(target_os = "macos")]
mod mac;
#[cfg(target_os = "macos")]
pub use mac::make_nonactivating;

#[cfg(not(any(windows, target_os = "macos")))]
pub fn make_nonactivating(_window: &tauri::WebviewWindow) {
    // ponytail: Linux/other not a target; clicks may activate. Add if needed.
}
