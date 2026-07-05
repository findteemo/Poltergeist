// Floating to-do list — shows tasks from shared localStorage; clicking one
// completes (deletes) it after a short undo grace (a mis-click on an
// always-on-top panel shouldn't silently destroy a task). Source of truth is
// `todos`; settings edits it too, so we re-render on the `todos-changed` event.
const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();
const listEl = document.getElementById("list");
const TODO_SRC = "todo"; // tag our emits so settings/us can skip the echo

let todos = [];
const GRACE_MS = 3000;
const pending = new Map(); // id -> delete timer, while a finish can still be undone

function save() {
  invoke("save_todos", { todos }); // persists to todos.json
  emit("todos-changed", { src: TODO_SRC, todos }); // tell the settings tab
}

function render() {
  listEl.replaceChildren();
  const hintEl = document.querySelector(".hint");
  if (!todos.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = 'all clear ✦<span class="sub">add tasks in settings</span>';
    listEl.appendChild(empty);
    hintEl.style.display = "none"; // nothing to click — drop the "click to finish" hint
    return;
  }
  hintEl.style.display = "";
  todos.forEach((t) => {
    const item = document.createElement("button");
    item.className = "item";
    item.type = "button";
    const key = t.id ?? t; // pre-1.1 tasks can lack ids — object identity still keys them
    const label = t.text || "(empty task)";
    const setDone = (done) => {
      item.classList.toggle("done", done);
      item.innerHTML = "";
      item.append(label);
      if (done) {
        const u = document.createElement("span");
        u.className = "undo";
        u.textContent = "undo ↩";
        item.appendChild(u);
      }
      item.setAttribute("aria-label", done ? `Undo finishing: ${label}` : `Finish task: ${label}`);
    };
    setDone(pending.has(key)); // keep the struck look across re-renders mid-grace
    item.addEventListener("click", () => {
      if (pending.has(key)) { // second click inside the grace = undo
        clearTimeout(pending.get(key));
        pending.delete(key);
        setDone(false);
        return;
      }
      setDone(true);
      pending.set(key, setTimeout(() => {
        pending.delete(key);
        const idx = todos.findIndex((x) => (x.id ?? x) === key);
        if (idx >= 0) { todos.splice(idx, 1); save(); render(); }
      }, GRACE_MS));
    });
    listEl.appendChild(item);
  });
}
invoke("load_todos").then((t) => { todos = t || []; render(); });

// changes from the settings tab: refresh ours (skip our own echo)
listen("todos-changed", (e) => {
  if (!e.payload || e.payload.src === TODO_SRC) return;
  todos = e.payload.todos;
  render();
});

// The window is non-activating, so the data-tauri-drag-region attribute is
// unreliable here — drive the OS move ourselves (same call it makes internally).
document.querySelector(".bar").addEventListener("mousedown", (e) => {
  if (e.target.closest("#close")) return; // let the X click through
  appWindow.startDragging();
});

// close just hides; tell settings so its "show list" toggle flips off to match.
document.getElementById("close").addEventListener("click", () => {
  appWindow.hide();
  emit("todo-visibility", false);
});
