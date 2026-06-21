const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;

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
  if (r.fire_at != null) {
    row.classList.add("sched");
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" class="en" ${r.enabled ? "checked" : ""} title="enabled" />
      <input type="text" data-i="${i}" class="lbl" value="" placeholder="reminder text" />
      <input type="datetime-local" data-i="${i}" class="at" value="${epochToLocalInput(r.fire_at)}" />
      <button class="del" data-i="${i}" title="delete">✕</button>`;
  } else {
    const d = displayFor(r.interval_secs);
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" class="en" ${r.enabled ? "checked" : ""} title="enabled" />
      <input type="text" data-i="${i}" class="lbl" value="" placeholder="reminder text" />
      <span><input type="number" min="1" step="any" data-i="${i}" class="iv" value="${d.value}" />
      <select data-i="${i}" class="unit">
        <option value="min" ${d.unit === "min" ? "selected" : ""}>min</option>
        <option value="hr" ${d.unit === "hr" ? "selected" : ""}>hr</option>
      </select></span>
      <button class="del" data-i="${i}" title="delete">✕</button>`;
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

(async () => {
  reminders = await invoke("load_reminders");
  render();
})();
