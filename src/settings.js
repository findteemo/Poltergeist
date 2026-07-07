const { invoke } = window.__TAURI__.core;
const { emit, listen } = window.__TAURI__.event;

// show the build version (read from the app, so it never drifts from the binary)
window.__TAURI__.app.getVersion().then((v) => {
  document.getElementById("ver").textContent = "v" + v;
});

// ghost size: persisted in localStorage, pushed live to the character window
const CELL_KEY = "charCell";
const sizeEl = document.getElementById("size");
sizeEl.value = localStorage.getItem(CELL_KEY) || "9";
sizeEl.addEventListener("input", () => {
  localStorage.setItem(CELL_KEY, sizeEl.value);
  emit("char-cell", Number(sizeEl.value));
});

// theme: persisted locally (shared across windows), applied live by theme.js
// in every window via the `theme-changed` event.
const themeEl = document.getElementById("theme");
themeEl.value = localStorage.getItem("theme") || "spectral";
themeEl.addEventListener("change", () => {
  localStorage.setItem("theme", themeEl.value);
  emit("theme-changed", themeEl.value);
});

// streak: read-only display of the day-streak the ghost keeps in localStorage.
// A broken streak (last ack older than yesterday) reads as none until re-earned.
const streakEl = document.getElementById("streak");
const localDay = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
function showStreak() {
  const count = Number(localStorage.getItem("streakCount") || 0);
  const last = localStorage.getItem("streakLastDate");
  const today = localDay(new Date());
  const yest = localDay(new Date(Date.now() - 86400000));
  const alive = count > 0 && (last === today || last === yest);
  streakEl.textContent = alive ? `🔥 ${count} day${count === 1 ? "" : "s"}` : "start one today ✦";
}
showStreak();
listen("streak-changed", showStreak);

// hat picker: emoji swatches, unlocked by best-ever streak (localStorage.bestStreak,
// kept by main.js bumpStreak). Equip writes localStorage.ghostHat + emits hat-changed.
// ponytail: HATS mirrors the source of truth in src/main.js (no module system).
const HATS = [
  { id: "bow",    streak: 3,   emoji: "🎀", label: "bow" },
  { id: "cap",    streak: 7,   emoji: "🧢", label: "cap" },
  { id: "crown",  streak: 14,  emoji: "👑", label: "crown" },
  { id: "tophat", streak: 30,  emoji: "🎩", label: "top hat" },
  { id: "witch",  streak: 60,  emoji: "🧙", label: "witch hat" },
  { id: "halo",   streak: 100, emoji: "😇", label: "halo" },
];
const hatsEl = document.getElementById("hats");
function renderHats() {
  const best = Number(localStorage.getItem("bestStreak") || 0);
  const equipped = localStorage.getItem("ghostHat") || "";
  hatsEl.textContent = "";
  const mk = (id, text, title, on, disabled) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text; b.title = title;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(on));
    if (disabled) b.disabled = true;
    b.addEventListener("click", () => {
      localStorage.setItem("ghostHat", id);
      emit("hat-changed", id);
      renderHats();
    });
    return b;
  };
  const none = mk("", "none", "no hat", equipped === "", false);
  none.classList.add("none");
  hatsEl.appendChild(none);
  for (const h of HATS) {
    const unlocked = best >= h.streak;
    hatsEl.appendChild(mk(
      unlocked ? h.id : "",                                   // locked click is a no-op via disabled
      unlocked ? h.emoji : `🔒${h.streak}`,
      unlocked ? h.label : `${h.label} — reach a ${h.streak}-day streak`,
      unlocked && equipped === h.id,
      !unlocked,
    ));
  }
}
renderHats();
listen("streak-changed", renderHats); // a milestone may have just unlocked one

// chime toggle: persisted locally, pushed live to the character window
const chimeEl = document.getElementById("chime");
chimeEl.checked = localStorage.getItem("chimeMuted") !== "1"; // checked = chime on
chimeEl.addEventListener("change", () => {
  localStorage.setItem("chimeMuted", chimeEl.checked ? "0" : "1");
  emit("chime-toggle", chimeEl.checked);
});

// idle chatter toggle: same pattern (checked = chatter on, default on)
const chatterEl = document.getElementById("chatter");
chatterEl.checked = localStorage.getItem("chatterOff") !== "1";
chatterEl.addEventListener("change", () => {
  localStorage.setItem("chatterOff", chatterEl.checked ? "0" : "1");
  emit("chatter-toggle", chatterEl.checked);
});

// cry timer: minutes a reminder can sit ignored before the ghost reacts.
// Pushed live to the character window (same pattern as char-cell/chime).
const cryEl = document.getElementById("cry");
cryEl.value = localStorage.getItem("cryMins") || "1";
cryEl.addEventListener("input", () => {
  const m = Math.min(10, Math.max(1, Number(cryEl.value) || 1));
  localStorage.setItem("cryMins", m);
  emit("cry-mins", m);
});

// nag timer: re-chime an unacked reminder every N min (0 = off). Same live-push
// pattern; the stored "0" is meaningful, so default only when nothing is stored.
const nagEl = document.getElementById("nag");
const storedNag = localStorage.getItem("nagMins");
nagEl.value = storedNag == null ? "5" : storedNag;
nagEl.addEventListener("input", () => {
  const m = Math.min(60, Math.max(0, Number(nagEl.value) || 0));
  localStorage.setItem("nagMins", m);
  emit("nag-mins", m);
});

// ---- focus timer (Pomodoro) ----
// Durations persist locally + push live to the ghost; start/stop is a toggle.
// The ghost runs the clock and emits `focus-status` back for the label.
const focusMinsEl = document.getElementById("focusMins");
const breakMinsEl = document.getElementById("breakMins");
const focusLoopsEl = document.getElementById("focusLoops");
const focusToggleEl = document.getElementById("focusToggle");
const focusStatusEl = document.getElementById("focusStatus");
focusMinsEl.value = localStorage.getItem("focusMins") || "25";
breakMinsEl.value = localStorage.getItem("breakMins") || "5";
focusLoopsEl.value = localStorage.getItem("focusLoops") || "0";

function saveFocusDurations() {
  const f = Math.min(120, Math.max(1, Number(focusMinsEl.value) || 25));
  const b = Math.min(60, Math.max(1, Number(breakMinsEl.value) || 5));
  const l = Math.min(20, Math.max(0, Number(focusLoopsEl.value) || 0)); // 0 = endless
  localStorage.setItem("focusMins", f);
  localStorage.setItem("breakMins", b);
  localStorage.setItem("focusLoops", l);
  emit("focus-durations", { focus: f, break: b, loops: l });
}
focusMinsEl.addEventListener("input", saveFocusDurations);
breakMinsEl.addEventListener("input", saveFocusDurations);
focusLoopsEl.addEventListener("input", saveFocusDurations);

let focusRunning = false;
focusToggleEl.addEventListener("click", () => {
  focusRunning = !focusRunning;
  if (focusRunning) saveFocusDurations(); // hand the ghost current values on start
  emit("focus-toggle", focusRunning);
  focusToggleEl.textContent = focusRunning ? "■ stop focus" : "▶ start focus";
});
listen("focus-status", (e) => {
  focusStatusEl.textContent = String(e.payload);
  // if the ghost reports idle while we think we're running (e.g. window reloaded
  // out of sync), correct the button
  if (e.payload === "idle" && focusRunning) { focusRunning = false; focusToggleEl.textContent = "▶ start focus"; }
});

// launch-at-login: toggle the HKCU Run key via the backend. Default on.
const autoEl = document.getElementById("autostart");
autoEl.checked = localStorage.getItem("autostart") !== "0";
autoEl.addEventListener("change", () => {
  localStorage.setItem("autostart", autoEl.checked ? "1" : "0");
  invoke("set_autostart", { enabled: autoEl.checked });
});

// tabs: plain show/hide, no router. Keep aria-selected in sync for SRs.
const tabBtns = [...document.querySelectorAll(".tabbtn")];
function selectTab(btn) {
  tabBtns.forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1; // roving tabindex (WAI-ARIA tabs pattern)
  });
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
}
selectTab(tabBtns.find((b) => b.classList.contains("active"))); // set initial tabindexes
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => selectTab(btn));
  // ←/→ move between tabs (WAI-ARIA tablist pattern)
  btn.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabBtns[(tabBtns.indexOf(btn) + step + tabBtns.length) % tabBtns.length];
    selectTab(next);
    next.focus();
  });
});

const listEl = document.getElementById("list");
let reminders = [];
let dirty = false; // unsaved reminder edits — blocks the refresh-on-show reload

function nowSecs() { return Math.floor(Date.now() / 1000); }

// datetime-local <-> epoch secs (local wall time, minute resolution)
function epochToLocalInput(epoch) {
  const d = new Date(epoch * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToEpoch(value) {
  return Math.floor(new Date(value).getTime() / 1000);
}

// interval display unit: show whole hours as "hr", everything else as "min".
function factor(unit) { return unit === "hr" ? 3600 : 60; }
function displayFor(secs) {
  return secs >= 3600 && secs % 3600 === 0
    ? { unit: "hr", value: secs / 3600 }
    : { unit: "min", value: Math.round(secs / 60) };
}

function rowHtml(r, i) {
  const row = document.createElement("div");
  row.className = "row";
  // glyph in a span so the off-state dim can't drag the border below 3:1 (CSS .pg span)
  const pg = `<button class="pg ${r.poltergeist ? "on" : ""}" data-i="${i}" title="poltergeist mode — angry flames when ignored" aria-label="Poltergeist mode — angry flames when ignored" aria-pressed="${r.poltergeist ? "true" : "false"}"><span aria-hidden="true">🔥</span></button>`;
  if (r.fire_at != null) {
    row.classList.add("sched");
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" class="en" ${r.enabled ? "checked" : ""} title="enabled" aria-label="Reminder enabled" />
      <input type="text" data-i="${i}" class="lbl" value="" placeholder="reminder text" aria-label="Reminder text" />
      <input type="datetime-local" data-i="${i}" class="at" value="${epochToLocalInput(r.fire_at)}" aria-label="Fire at" />
      ${pg}
      <button class="del" data-i="${i}" title="delete" aria-label="Delete reminder">✕</button>`;
  } else {
    const d = displayFor(r.interval_secs);
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" class="en" ${r.enabled ? "checked" : ""} title="enabled" aria-label="Reminder enabled" />
      <input type="text" data-i="${i}" class="lbl" value="" placeholder="reminder text" aria-label="Reminder text" />
      <span><input type="number" min="1" step="any" data-i="${i}" class="iv" value="${d.value}" aria-label="Interval" />
      <select data-i="${i}" class="unit" aria-label="Interval unit">
        <option value="min" ${d.unit === "min" ? "selected" : ""}>min</option>
        <option value="hr" ${d.unit === "hr" ? "selected" : ""}>hr</option>
      </select></span>
      ${pg}
      <button class="del" data-i="${i}" title="delete" aria-label="Delete reminder">✕</button>`;
  }
  row.querySelector(".lbl").value = r.label;
  return row;
}

// teaching empty-state note (lowercase ghost voice; sub points at the next action)
function emptyNote(main, sub) {
  const d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = sub ? `${main}<span class="sub">${sub}</span>` : main;
  return d;
}

function render() {
  listEl.replaceChildren();
  if (!reminders.length) {
    listEl.appendChild(emptyNote("no nudges yet", "summon one below ✦"));
    return;
  }
  reminders.forEach((r, i) => listEl.appendChild(rowHtml(r, i)));
}

listEl.addEventListener("input", (e) => {
  dirty = true;
  const i = +e.target.dataset.i;
  const unitOf = () => e.target.closest(".row").querySelector(".unit").value;
  if (e.target.classList.contains("lbl")) reminders[i].label = e.target.value;
  else if (e.target.classList.contains("iv")) reminders[i].interval_secs = Math.max(1, +e.target.value) * factor(unitOf());
  else if (e.target.classList.contains("unit")) {
    // switching unit keeps the interval but refuses sub-1 values (the input's
    // min="1"), so "30 min → hr" reads as 1 hr instead of an invalid 0.5
    const f = factor(e.target.value);
    reminders[i].interval_secs = Math.max(f, reminders[i].interval_secs);
    e.target.closest(".row").querySelector(".iv").value = reminders[i].interval_secs / f;
  } else if (e.target.classList.contains("en")) reminders[i].enabled = e.target.checked;
  else if (e.target.classList.contains("at") && e.target.value) reminders[i].fire_at = localInputToEpoch(e.target.value);
});

listEl.addEventListener("click", (e) => {
  if (e.target.classList.contains("del")) {
    dirty = true;
    reminders.splice(+e.target.dataset.i, 1);
    render();
  } else if (e.target.classList.contains("pg")) {
    dirty = true;
    const i = +e.target.dataset.i;
    reminders[i].poltergeist = !reminders[i].poltergeist;
    e.target.classList.toggle("on", reminders[i].poltergeist);
    e.target.setAttribute("aria-pressed", reminders[i].poltergeist ? "true" : "false");
  }
});

function newId() { return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()); }

document.getElementById("add").addEventListener("click", () => {
  dirty = true;
  reminders.push({
    id: newId(),
    label: "new reminder",
    interval_secs: 1800,
    enabled: true,
    last_fired: nowSecs(),
    fire_at: null,
    poltergeist: false,
  });
  render();
});

document.getElementById("addSched").addEventListener("click", () => {
  dirty = true;
  reminders.push({
    id: newId(),
    label: "scheduled reminder",
    interval_secs: 0,
    enabled: true,
    last_fired: nowSecs(),
    fire_at: nowSecs() + 3600, // default an hour out, so the picker isn't in the past
    poltergeist: false,
  });
  render();
});

document.getElementById("save").addEventListener("click", async () => {
  const s = document.getElementById("saved");
  try {
    await invoke("save_reminders", { reminders });
    await loadReminders(); // pick up backend normalization (interval clamp, kept firing state)
    s.textContent = "saved ✓";
  } catch {
    s.textContent = "✗ couldn't save"; // e.g. a malformed number the backend refused
  }
  setTimeout(() => (s.textContent = ""), 1600);
});

document.getElementById("quit").addEventListener("click", () => invoke("quit_app"));

// frameless window has no titlebar X — hide it ourselves (stays reusable)
document.getElementById("close").addEventListener("click", () =>
  window.__TAURI__.window.getCurrentWindow().hide());

// ---- to-do list ----
// One-shot tasks, kept in shared localStorage (visible to the floating window).
// No timer, no ghost effect. Edits/deletes here sync live via `todos-changed`.
const todoListEl = document.getElementById("todolist");
let todos = [];
const TODO_SRC = "settings"; // tag emits so we ignore our own echo (it'd clobber typing)

function saveTodos() {
  invoke("save_todos", { todos }); // persists to todos.json
  emit("todos-changed", { src: TODO_SRC, todos });
}
// changes from the floating list window: refresh ours (skip our own echo)
listen("todos-changed", (e) => {
  if (!e.payload || e.payload.src === TODO_SRC) return;
  todos = e.payload.todos;
  renderTodos();
});
function renderTodos() {
  todoListEl.replaceChildren();
  if (!todos.length) {
    todoListEl.appendChild(emptyNote("nothing to do yet", "add a task below ✦"));
    return;
  }
  todos.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.style.gridTemplateColumns = "1fr 24px"; // just text + delete here
    row.innerHTML = `
      <input type="text" class="tlbl" data-i="${i}" placeholder="task" aria-label="Task" />
      <button class="del" data-i="${i}" title="delete" aria-label="Delete task">✕</button>`;
    row.querySelector(".tlbl").value = t.text;
    todoListEl.appendChild(row);
  });
}
todoListEl.addEventListener("input", (e) => {
  if (e.target.classList.contains("tlbl")) { todos[+e.target.dataset.i].text = e.target.value; saveTodos(); }
});
todoListEl.addEventListener("click", (e) => {
  if (e.target.classList.contains("del")) { todos.splice(+e.target.dataset.i, 1); saveTodos(); renderTodos(); }
});
document.getElementById("addTodo").addEventListener("click", () => {
  todos.push({ id: newId(), text: "" });
  saveTodos();
  renderTodos();
});
// load from disk; migrate any old localStorage todos once, then drop them
invoke("load_todos").then((t) => {
  todos = t && t.length ? t : JSON.parse(localStorage.getItem("todos") || "[]");
  if ((!t || !t.length) && todos.length) saveTodos();
  localStorage.removeItem("todos");
  renderTodos();
});

// show/hide the floating to-do list window
const todoVisEl = document.getElementById("todoVis");
todoVisEl.checked = localStorage.getItem("todoVisible") === "1";
todoVisEl.addEventListener("change", () => {
  localStorage.setItem("todoVisible", todoVisEl.checked ? "1" : "0");
  invoke("set_todo_visible", { visible: todoVisEl.checked });
});
// keep the toggle honest with the real window state (it self-hides via its own
// X button). Re-sync on every focus + when the to-do window tells us it hid.
function setTodoVis(v) {
  todoVisEl.checked = v;
  localStorage.setItem("todoVisible", v ? "1" : "0");
}
async function syncTodoVis() { setTodoVis(await invoke("todo_visible")); }
syncTodoVis();
window.__TAURI__.window.getCurrentWindow().onFocusChanged((e) => { if (e.payload) syncTodoVis(); });
listen("todo-visibility", (e) => setTodoVis(!!e.payload));

async function loadReminders() {
  reminders = await invoke("load_reminders");
  dirty = false;
  render();
}
loadReminders();
// The ghost acks/removes reminders while this window sits hidden (it's never
// destroyed, just hidden), so our list is a snapshot — refresh it every time
// the window is (re)opened. Skipped while there are unsaved edits, and driven
// by the Rust `settings-shown` event rather than window focus so a click into
// a text field can't rebuild the list out from under the cursor.
listen("settings-shown", () => { if (!dirty) loadReminders(); });

// ---- calendar (Google Calendar, read-only ICS feed) ----
// URL + lead time persist Rust-side (calendar.json) since the feed is fetched
// with no window open. Saving the config also triggers an immediate re-fetch,
// so "refresh now" is just a re-save of the current field values.
const calUrlEl = document.getElementById("calUrl");
const calLeadEl = document.getElementById("calLead");
function saveCalConfig() {
  invoke("save_calendar_config", {
    config: {
      url: calUrlEl.value.trim(),
      lead_minutes: Math.max(0, Math.min(120, Number(calLeadEl.value) || 0)),
    },
  });
}
invoke("load_calendar_config").then((c) => {
  calUrlEl.value = c.url || "";
  calLeadEl.value = c.lead_minutes ?? 5;
});
// change = on blur/enter, so we don't refetch on every keystroke of the URL
calUrlEl.addEventListener("change", saveCalConfig);
calLeadEl.addEventListener("change", saveCalConfig);
document.getElementById("calRefresh").addEventListener("click", () => {
  saveCalConfig(); // persists current fields + kicks a fresh fetch
  const b = document.getElementById("calRefresh");
  const t = b.textContent;
  b.textContent = "↻ refreshing…";
  setTimeout(() => (b.textContent = t), 1500);
});

// fetch result from Rust (✓ loaded N events / ✗ reason) — so a bad URL isn't silent
const calStatusEl = document.getElementById("calStatus");
listen("calendar-status", (e) => {
  const msg = String(e.payload || "");
  calStatusEl.textContent = msg;
  calStatusEl.classList.toggle("err", msg.startsWith("✗"));
});

// show/hide the floating calendar window (mirrors the to-do toggle)
const calVisEl = document.getElementById("calVis");
calVisEl.addEventListener("change", () =>
  invoke("set_calendar_visible", { visible: calVisEl.checked }));
async function syncCalVis() { calVisEl.checked = await invoke("calendar_visible"); }
syncCalVis();
listen("calendar-visibility", (e) => (calVisEl.checked = !!e.payload));
window.__TAURI__.window.getCurrentWindow().onFocusChanged((e) => { if (e.payload) syncCalVis(); });

// ---- agents (Claude Code / Codex notifications) ----
const agentStatus = document.getElementById("agentStatus");
const agentBtns = [...document.querySelectorAll(".agentbtn")];

async function refreshAgentState() {
  const [claude, codex] = await invoke("agent_hook_state");
  const state = { claude, codex };
  for (const btn of agentBtns) {
    const on = state[btn.dataset.agent];
    btn.textContent = on ? "uninstall hooks" : "install hooks";
    btn.classList.toggle("on", on);
  }
}
refreshAgentState();

for (const btn of agentBtns) {
  btn.addEventListener("click", async () => {
    const agent = btn.dataset.agent;
    const installed = btn.classList.contains("on");
    try {
      await invoke(installed ? "uninstall_agent_hook" : "install_agent_hook", { agent });
      agentStatus.textContent = installed
        ? `${agent} hooks removed`
        : `${agent} hooks installed — relaunch ${agent}`;
    } catch (e) {
      agentStatus.textContent = `✗ ${e}`;
    }
    refreshAgentState();
  });
}
