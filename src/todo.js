// Floating to-do list — shows tasks from shared localStorage; clicking one
// completes (deletes) it. Source of truth is `todos`; settings edits it too,
// so we re-render on the `todos-changed` event. No timer, no ghost effect.
const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;
const appWindow = window.__TAURI__.window.getCurrentWindow();
const listEl = document.getElementById("list");
const TODO_SRC = "todo"; // tag our emits so settings/us can skip the echo

let todos = [];

function save() {
  invoke("save_todos", { todos }); // persists to todos.json
  emit("todos-changed", { src: TODO_SRC, todos }); // tell the settings tab
}

function render() {
  listEl.replaceChildren();
  if (!todos.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "all clear ✦";
    listEl.appendChild(empty);
    return;
  }
  todos.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "item";
    item.textContent = t.text || "(empty task)";
    item.addEventListener("click", () => {
      todos.splice(i, 1);
      save();
      render();
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

// ponytail: close just hides; the settings "show list" toggle stays the real
// switch, so its checkbox may read stale-on after this. Re-toggle to resync.
document.getElementById("close").addEventListener("click", () => appWindow.hide());
