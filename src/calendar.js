// Floating calendar window — read-only view of the Google Calendar ICS feed.
// Events come from Rust (already fetched + recurrence-expanded); we just render
// a month grid + an agenda list. Clicking a grid day filters the agenda to it;
// the default agenda is the next 7 days. No editing.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();

const gridEl = document.getElementById("grid");
const listEl = document.getElementById("list");
const mlabelEl = document.getElementById("mlabel");
const aheadEl = document.getElementById("ahead");

let events = []; // [{uid, title, start, end}] epoch secs, sorted by start (from Rust)
let view = startOfMonth(new Date()); // month shown in the grid
let selected = null; // a Date (midnight) when a day is picked, else null = next 7 days

const DOW = ["su", "mo", "tu", "we", "th", "fr", "sa"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function sameDay(a, b) { return dayKey(a) === dayKey(b); }
function evDate(ev) { return new Date(ev.start * 1000); }
function isAllDay(ev) { return ev.end - ev.start >= 86400; }

function fmtTime(ev) {
  if (isAllDay(ev)) return "all day";
  const d = evDate(ev);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderGrid() {
  gridEl.replaceChildren();
  mlabelEl.textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
  DOW.forEach((d) => {
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = d;
    gridEl.appendChild(h);
  });
  // days with at least one event, this month, keyed for O(1) lookup
  const has = new Set(events.map((e) => dayKey(evDate(e))));
  const today = new Date();
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) {
    const blank = document.createElement("div");
    blank.className = "cell blank";
    gridEl.appendChild(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(view.getFullYear(), view.getMonth(), day);
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    const picked = selected && sameDay(d, selected);
    cell.setAttribute("aria-pressed", picked ? "true" : "false");
    cell.setAttribute(
      "aria-label",
      `${MONTHS[view.getMonth()]} ${day} ${view.getFullYear()}${has.has(dayKey(d)) ? ", has events" : ""}`
    );
    if (has.has(dayKey(d))) cell.classList.add("has");
    if (sameDay(d, today)) cell.classList.add("today");
    if (picked) cell.classList.add("sel");
    cell.textContent = day;
    cell.addEventListener("click", () => {
      // click the selected day again to clear back to the 7-day view
      selected = selected && sameDay(d, selected) ? null : d;
      renderGrid();
      renderAgenda();
    });
    gridEl.appendChild(cell);
  }
}

function renderAgenda() {
  listEl.replaceChildren();
  let shown;
  if (selected) {
    aheadEl.textContent = `${MONTHS[selected.getMonth()]} ${selected.getDate()}`;
    shown = events.filter((e) => sameDay(evDate(e), selected));
  } else {
    aheadEl.textContent = "next 7 days";
    const now = Date.now() / 1000;
    const until = now + 7 * 86400;
    shown = events.filter((e) => e.end > now && e.start < until);
  }
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = selected
      ? "nothing on this day ✦"
      : 'all quiet ✦<span class="sub">next 7 days are clear</span>';
    listEl.appendChild(empty);
    return;
  }
  let lastKey = null;
  shown.forEach((e) => {
    const d = evDate(e);
    const k = dayKey(d);
    if (!selected && k !== lastKey) {
      // group by day in the multi-day view
      const g = document.createElement("div");
      g.className = "daygroup";
      g.textContent = `${DOW[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
      listEl.appendChild(g);
      lastKey = k;
    }
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<span class="time"></span>`; // no trailing space: clean flex children
    item.querySelector(".time").textContent = fmtTime(e);
    item.appendChild(document.createTextNode(e.title || "(busy)"));
    listEl.appendChild(item);
  });
}

async function reload() {
  events = (await invoke("load_calendar_events")) || [];
  renderGrid();
  renderAgenda();
}

document.getElementById("prev").addEventListener("click", () => {
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  renderGrid();
});
document.getElementById("next").addEventListener("click", () => {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  renderGrid();
});

// Rust refreshed the feed — pull the new cache.
listen("calendar-updated", reload);

// non-activating window: drive the OS move ourselves (data-tauri-drag-region is
// unreliable here, same as the to-do window).
document.querySelector(".bar").addEventListener("mousedown", (e) => {
  if (e.target.closest("#close")) return;
  appWindow.startDragging();
});
document.getElementById("close").addEventListener("click", () => {
  appWindow.hide();
  window.__TAURI__.event.emit("calendar-visibility", false);
});

reload();
