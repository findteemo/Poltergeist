const { invoke } = window.__TAURI__.core;
const { emit, listen } = window.__TAURI__.event;

// ghost size: persisted in localStorage, pushed live to the character window
const CELL_KEY = "charCell";
const sizeEl = document.getElementById("size");
sizeEl.value = localStorage.getItem(CELL_KEY) || "9";
sizeEl.addEventListener("input", () => {
  localStorage.setItem(CELL_KEY, sizeEl.value);
  emit("char-cell", Number(sizeEl.value));
});

// chime toggle: persisted locally, pushed live to the character window
const chimeEl = document.getElementById("chime");
chimeEl.checked = localStorage.getItem("chimeMuted") !== "1"; // checked = chime on
chimeEl.addEventListener("change", () => {
  localStorage.setItem("chimeMuted", chimeEl.checked ? "0" : "1");
  emit("chime-toggle", chimeEl.checked);
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

// launch-at-login: toggle the HKCU Run key via the backend. Default on.
const autoEl = document.getElementById("autostart");
autoEl.checked = localStorage.getItem("autostart") !== "0";
autoEl.addEventListener("change", () => {
  localStorage.setItem("autostart", autoEl.checked ? "1" : "0");
  invoke("set_autostart", { enabled: autoEl.checked });
});

// tabs: plain show/hide, no router
document.querySelectorAll(".tabbtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
  });
});

const listEl = document.getElementById("list");
let reminders = [];

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
  const pg = `<button class="pg ${r.poltergeist ? "on" : ""}" data-i="${i}" title="poltergeist mode — angry flames when ignored" aria-label="Poltergeist mode — angry flames when ignored" aria-pressed="${r.poltergeist ? "true" : "false"}">🔥</button>`;
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

function render() {
  listEl.replaceChildren();
  reminders.forEach((r, i) => listEl.appendChild(rowHtml(r, i)));
}

listEl.addEventListener("input", (e) => {
  const i = +e.target.dataset.i;
  const unitOf = () => e.target.closest(".row").querySelector(".unit").value;
  if (e.target.classList.contains("lbl")) reminders[i].label = e.target.value;
  else if (e.target.classList.contains("iv")) reminders[i].interval_secs = Math.max(1, +e.target.value) * factor(unitOf());
  else if (e.target.classList.contains("unit")) {
    // switching unit keeps the same interval, just redisplays the number
    e.target.closest(".row").querySelector(".iv").value = reminders[i].interval_secs / factor(e.target.value);
  } else if (e.target.classList.contains("en")) reminders[i].enabled = e.target.checked;
  else if (e.target.classList.contains("at") && e.target.value) reminders[i].fire_at = localInputToEpoch(e.target.value);
});

listEl.addEventListener("click", (e) => {
  if (e.target.classList.contains("del")) {
    reminders.splice(+e.target.dataset.i, 1);
    render();
  } else if (e.target.classList.contains("pg")) {
    const i = +e.target.dataset.i;
    reminders[i].poltergeist = !reminders[i].poltergeist;
    e.target.classList.toggle("on", reminders[i].poltergeist);
    e.target.setAttribute("aria-pressed", reminders[i].poltergeist ? "true" : "false");
  }
});

function newId() { return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()); }

document.getElementById("add").addEventListener("click", () => {
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
  await invoke("save_reminders", { reminders });
  const s = document.getElementById("saved");
  s.textContent = "saved ✓";
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

(async () => {
  reminders = await invoke("load_reminders");
  render();
})();
