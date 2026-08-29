//! Doomscroll guard: notice when the foreground window is a browser sitting on a
//! doomscroll site, and (after the ghost's countdown) close that tab with Ctrl+W.
//!
//! Windows-only, like the click-through poll — it needs the foreground window's
//! process, which has no portable API. Elsewhere it's inert.

/// Browsers we're willing to send Ctrl+W to. Everything else keeps its tabs: a
/// stray Ctrl+W in an editor or terminal is somebody's lost work, and the window
/// title alone can't tell "instagram.js" in VS Code from an Instagram tab.
const BROWSERS: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "opera_gx.exe",
    "vivaldi.exe",
    "arc.exe",
    "zen.exe",
    "librewolf.exe",
];

// ponytail: fixed list matched against the window title (= the active tab title).
// Deliberately short and unambiguous — a loose word like "shorts" would fire on
// someone shopping for shorts. Add sites here; make it a settings field only if
// people actually need different lists.
const SITES: &[(&str, &str)] = &[
    ("tiktok", "TikTok"),
    ("instagram", "Instagram"),
    ("reddit", "Reddit"),
];

/// Pretty name of the doomscroll site the given window is showing, if any.
pub fn doom_site(exe: &str, title: &str) -> Option<&'static str> {
    if !BROWSERS.contains(&exe) {
        return None;
    }
    let t = title.to_lowercase();
    SITES.iter().find(|(key, _)| t.contains(key)).map(|&(_, name)| name)
}

/// What the user is doomscrolling right now, if anything: the site's name plus
/// the screen point of the browser's tab strip (where the ghost flies to).
#[cfg(windows)]
pub fn current() -> Option<(&'static str, i32, i32)> {
    let (exe, title, (x, y)) = crate::platform::foreground_app()?;
    doom_site(&exe, &title).map(|site| (site, x, y))
}

#[cfg(not(windows))]
pub fn current() -> Option<(&'static str, i32, i32)> {
    None
}

/// Close the offending tab — but only if a doomscroll site is *still* in front.
/// The bubble gives a grace countdown, and in those seconds the user may have
/// alt-tabbed away; re-checking here is what stops Ctrl+W landing in their editor.
#[cfg(windows)]
pub fn close_tab() -> bool {
    if current().is_none() {
        return false;
    }
    crate::platform::send_ctrl_w();
    true
}

#[cfg(not(windows))]
pub fn close_tab() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::doom_site;

    #[test]
    fn matches_only_browsers() {
        assert_eq!(doom_site("chrome.exe", "Reels • Instagram - Google Chrome"), Some("Instagram"));
        assert_eq!(doom_site("firefox.exe", "TikTok - Make Your Day"), Some("TikTok"));
        // same title, wrong app: an editor tab must never eat a Ctrl+W
        assert_eq!(doom_site("code.exe", "instagram.js - poltergeist"), None);
        assert_eq!(doom_site("chrome.exe", "docs.rs - tokio"), None);
    }

    /// Smoke-test the raw FFI: a wrong link name or signature would blow up here
    /// rather than in the poll loop. Whatever is foreground during `cargo test`
    /// is fine — we only care that the call returns sanely.
    #[cfg(windows)]
    #[test]
    fn foreground_app_reads_something() {
        if let Some((exe, _title, _tab)) = crate::platform::foreground_app() {
            assert!(exe.ends_with(".exe"), "unexpected exe name: {exe}");
        }
    }
}
