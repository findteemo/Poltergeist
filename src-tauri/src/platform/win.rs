use tauri::WebviewWindow;

// Raw FFI so we don't pin a `windows` crate version against tauri's own.
const GWL_EXSTYLE: i32 = -20;
const WS_EX_NOACTIVATE: isize = 0x0800_0000;
const WS_EX_TOOLWINDOW: isize = 0x0000_0080;

#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
    fn GetCursorPos(p: *mut POINT) -> i32;
}

/// Global mouse position in physical screen pixels. Drives the click-through
/// poll: we compare it against the ghost's on-screen rect to decide whether the
/// transparent overlay should swallow the click or pass it through.
pub fn cursor_pos() -> Option<(i32, i32)> {
    let mut p = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut p) } != 0 {
        Some((p.x, p.y))
    } else {
        None
    }
}

/// WS_EX_NOACTIVATE: window never becomes foreground, so clicking it doesn't pull
/// keyboard focus from the user's active app. WS_EX_TOOLWINDOW: keep off the
/// taskbar / alt-tab list.
pub fn make_nonactivating(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else { return };
    let h = hwnd.0 as isize;
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
    }
}
