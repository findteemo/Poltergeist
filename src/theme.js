// Shared theme applier for all four windows (like winpos.js). Reads the chosen
// palette from localStorage (shared across windows) and reflects it on
// <html data-theme>, which flips the tokens.css override block. Listens for
// live changes emitted by the settings dropdown. "spectral" = the default :root,
// so it needs no attribute. The ghost sprite recolors for free — its cells
// reference var(--ghost) etc. directly.
(function () {
  const apply = (t) => {
    if (t && t !== "spectral") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  };
  apply(localStorage.getItem("theme"));
  window.__TAURI__?.event.listen("theme-changed", (e) => apply(e.payload));
})();
