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

// ---- doomscroll guard (see doom.rs) ----

const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const VK_CONTROL: u8 = 0x11;
const VK_W: u8 = 0x57;

#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[link(name = "user32")]
extern "system" {
    fn GetForegroundWindow() -> isize;
    fn GetWindowTextW(hwnd: isize, buf: *mut u16, max: i32) -> i32;
    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
    fn GetWindowRect(hwnd: isize, r: *mut RECT) -> i32;
    fn GetDpiForWindow(hwnd: isize) -> u32;
    fn keybd_event(vk: u8, scan: u8, flags: u32, extra: usize);
}

// Where a browser keeps its tabs, in 96-dpi px from the window's top-left. Scaled
// by the *browser's* own DPI below, not the ghost's — they can be on different
// monitors.
// ponytail: aims at the first tab, not the *active* one; pinpointing the active
// tab needs UI Automation. Upgrade there if it lands wrong with many tabs open.
const TAB_X: i32 = 130;
const TAB_Y: i32 = 26;

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
    fn QueryFullProcessImageNameW(proc: isize, flags: u32, buf: *mut u16, size: *mut u32) -> i32;
    fn CloseHandle(h: isize) -> i32;
}

/// (exe file name, lowercased; window title; screen point of its tab strip) of
/// whatever the user is looking at. The exe is what makes the Ctrl+W below safe —
/// a title alone can't tell a browser tab from a file open in an editor. The
/// point is in physical pixels, for the ghost to fly to.
pub fn foreground_app() -> Option<(String, String, (i32, i32))> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 {
            return None;
        }
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
        let title = String::from_utf16_lossy(&buf[..n]);

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h == 0 {
            return None;
        }
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        if ok == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let exe = path.rsplit(std::path::is_separator).next().unwrap_or("").to_lowercase();

        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if GetWindowRect(hwnd, &mut r) == 0 {
            return None;
        }
        let dpi = GetDpiForWindow(hwnd).max(96) as i32;
        let tab = (r.left + TAB_X * dpi / 96, r.top + TAB_Y * dpi / 96);
        Some((exe, title, tab))
    }
}

/// Synthesise Ctrl+W into whatever has focus — i.e. close the active browser tab.
/// keybd_event (not SendInput) because it's four calls and no union structs; the
/// caller is responsible for checking *what* is focused first.
pub fn send_ctrl_w() {
    unsafe {
        keybd_event(VK_CONTROL, 0, 0, 0);
        keybd_event(VK_W, 0, 0, 0);
        keybd_event(VK_W, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
    }
}
