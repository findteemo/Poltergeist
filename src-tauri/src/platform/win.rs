use tauri::WebviewWindow;

// Raw FFI so we don't pin a `windows` crate version against tauri's own.
const GWL_EXSTYLE: i32 = -20;
const WS_EX_NOACTIVATE: isize = 0x0800_0000;
const WS_EX_TOOLWINDOW: isize = 0x0000_0080;

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
    fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
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
