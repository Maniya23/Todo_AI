/**
 * Core Todo App — vanilla JS + Bootstrap UI
 * State is kept in memory; each task has id, title, and completed flag.
 *
 * `requestAiCategory` is loaded from gemini.js (must stay before this script in HTML).
 */
/* global requestAiCategory */

const DATA_VERSION = 1;
const API_URL = "/api/todos";

/** Must match Gemini / manual picker */
const KNOWN_CATEGORIES = [
  "Work",
  "Study",
  "Health",
  "Shopping",
  "Personal",
  "Other",
];

/** `<select>` value that triggers Gemini via `requestAiCategory` (see gemini.js). */
const AI_CATEGORY_VALUE = "__ai__";

/** Bootstrap badge classes per category (visual only) */
const CATEGORY_BADGE_CLASS = {
  Work: "text-bg-primary",
  Study: "text-bg-info",
  Health: "text-bg-success",
  Shopping: "text-bg-warning",
  Personal: "text-bg-secondary",
  Other: "text-bg-dark",
};

/** One-time migration from earlier localStorage-only builds */
const LEGACY_STORAGE_KEY = "todo-app-data";
const LEGACY_ARRAY_KEY = "todo-app-items-v1";

/**
 * @typedef {(
 *   "Work" | "Study" | "Health" | "Shopping" | "Personal" | "Other" | null
 * )} TodoCategory
 */

/** @typedef {{ id: string; title: string; completed: boolean; category: TodoCategory }} Todo */

/** @typedef {{ version: number; todos: Todo[] }} AppData */

/** @type {AppData} */
let appData = { version: DATA_VERSION, todos: [] };

/** True after initial GET /api/todos succeeds */
let storageReady = false;

/** Debounce timer for PUT requests */
let saveTimer = 0;

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const categorySelect = document.getElementById("todo-category");
const submitBtn = form.querySelector('button[type="submit"]');
const listEl = document.getElementById("todo-list");
const emptyEl = document.getElementById("empty-state");
const alertEl = document.getElementById("app-alert");

/**
 * Generate a simple unique id (good enough for client-side todos).
 * @returns {string}
 */
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Only allow known category labels; anything else becomes null.
 * @param {unknown} cat
 * @returns {TodoCategory}
 */
function sanitizeCategory(cat) {
  if (cat === null || cat === undefined) return null;
  if (typeof cat !== "string") return null;
  return /** @type {TodoCategory} */ (
    KNOWN_CATEGORIES.includes(cat) ? cat : null
  );
}

/**
 * Normalize one todo object from storage (fills defaults for new fields).
 * @param {unknown} raw
 * @returns {Todo | null}
 */
function normalizeTodo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const t = /** @type {Record<string, unknown>} */ (raw);
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;
  if (typeof t.completed !== "boolean") return null;
  const category = sanitizeCategory(t.category);
  return { id: t.id, title: t.title, completed: t.completed, category };
}

/**
 * Parse JSON into AppData, or return null if invalid.
 * @param {string} json
 * @returns {AppData | null}
 */
function parseStoredJson(json) {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") return null;
    const version = /** @type {{ version?: unknown }} */ (data).version;
    if (version !== DATA_VERSION) return null;
    const rawTodos = /** @type {{ todos?: unknown }} */ (data).todos;
    if (!Array.isArray(rawTodos)) return null;
    const todos = [];
    for (const item of rawTodos) {
      const todo = normalizeTodo(item);
      if (todo) todos.push(todo);
    }
    return { version: DATA_VERSION, todos };
  } catch {
    return null;
  }
}

/**
 * Legacy format was JSON array of { id, title, completed } only.
 * @param {string} json
 * @returns {AppData | null}
 */
function migrateLegacyArrayJson(json) {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    const todos = [];
    for (const item of arr) {
      const t = normalizeTodo(
        item && typeof item === "object"
          ? { ...item, category: null }
          : null
      );
      if (t) todos.push(t);
    }
    return { version: DATA_VERSION, todos };
  } catch {
    return null;
  }
}

/**
 * If the file is empty but localStorage still has old data, copy it once to the server.
 * @returns {Promise<boolean>} whether a migration was written
 */
async function tryMigrateFromLocalStorage() {
  if (appData.todos.length > 0) return false;

  let backup = null;
  const rawDoc = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (rawDoc) backup = parseStoredJson(rawDoc);

  if (!backup || backup.todos.length === 0) {
    const leg = localStorage.getItem(LEGACY_ARRAY_KEY);
    if (leg) backup = migrateLegacyArrayJson(leg);
  }

  if (!backup || backup.todos.length === 0) return false;

  appData = backup;
  await persistToServerImmediate();
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ARRAY_KEY);
  return true;
}

/**
 * @param {string} message
 * @param {"warning" | "danger" | "success"} [variant]
 */
function setAlert(message, variant = "warning") {
  if (!alertEl) return;
  alertEl.className = `alert alert-${variant} mb-4`;
  alertEl.textContent = message;
  alertEl.classList.remove("d-none");
  alertEl.setAttribute("role", "alert");
}

function clearAlert() {
  if (!alertEl) return;
  alertEl.classList.add("d-none");
  alertEl.textContent = "";
}

function setFormEnabled(enabled) {
  input.disabled = !enabled;
  if (submitBtn) submitBtn.disabled = !enabled;
  if (categorySelect) categorySelect.disabled = !enabled;
}

/** GET /api/todos → appData */
async function loadAppDataFromServer() {
  const res = await fetch(API_URL, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Load failed (${res.status})`);
  }
  const text = await res.text();
  const parsed = parseStoredJson(text);
  if (!parsed) {
    throw new Error("Invalid data file");
  }
  appData = parsed;
}

/** Write appData to data/todos.json (debounced) */
function saveAppData() {
  if (!storageReady) return;
  clearAlert();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persistToServer().catch((err) => {
      console.error(err);
      setAlert("Server not connected. Could not save.", "danger");
    });
  }, 200);
}

/** @returns {Promise<void>} */
async function persistToServer() {
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appData),
  });
  if (!res.ok) {
    const hint = await res.text();
    throw new Error(hint || res.statusText);
  }
}

/** Immediate save (migration / critical path) */
async function persistToServerImmediate() {
  const res = await fetch(API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appData),
  });
  if (!res.ok) {
    const hint = await res.text();
    throw new Error(hint || res.statusText);
  }
}

/**
 * Add a new task from the input value (trimmed, non-empty).
 * Uses Gemini when category is Auto (AI); `requestAiCategory` is defined in gemini.js.
 */
async function addTodo() {
  if (!storageReady) return;
  const title = input.value.trim();
  if (!title) return;

  const mode = categorySelect ? categorySelect.value : "Other";
  /** @type {TodoCategory} */
  let category;

  if (mode === AI_CATEGORY_VALUE) {
    const prevBtn = submitBtn ? submitBtn.textContent : "";
    setFormEnabled(false);
    if (submitBtn) submitBtn.textContent = "Working...";
    clearAlert();
    try {
      if (typeof requestAiCategory !== "function") {
        throw new Error("AI helper not loaded. Refresh the page.");
      }
      const raw = await requestAiCategory(title);
      category = sanitizeCategory(raw) ?? "Other";
    } catch (err) {
      console.error(err);
      setAlert(
        err instanceof Error ? err.message : "AI categorization failed.",
        "danger"
      );
      if (submitBtn) submitBtn.textContent = prevBtn;
      setFormEnabled(true);
      return;
    }
    if (submitBtn) submitBtn.textContent = prevBtn;
    setFormEnabled(true);
  } else {
    category = sanitizeCategory(mode) ?? "Other";
  }

  appData.todos.push({
    id: createId(),
    title,
    completed: false,
    category,
  });
  input.value = "";
  input.focus();
  if (categorySelect) categorySelect.value = "Other";
  saveAppData();
  render();
}

/**
 * Toggle completed state for a task by id.
 * @param {string} id
 */
function toggleTodo(id) {
  if (!storageReady) return;
  const todo = appData.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  saveAppData();
  render();
}

/**
 * Remove a task by id.
 * @param {string} id
 */
function deleteTodo(id) {
  if (!storageReady) return;
  appData.todos = appData.todos.filter((t) => t.id !== id);
  saveAppData();
  render();
}

/**
 * Toggle empty state vs list visibility.
 */
function updateEmptyState() {
  const empty = appData.todos.length === 0;
  emptyEl.classList.toggle("d-none", !empty);
  listEl.classList.toggle("d-none", empty);
}

/**
 * Build and mount the list DOM from todos (idempotent: clears first).
 */
function render() {
  listEl.replaceChildren();

  for (const todo of appData.todos) {
    const item = document.createElement("li");
    item.className = `list-group-item todo-item d-flex align-items-start gap-3 ${
      todo.completed ? "todo-item--done" : ""
    }`;
    item.dataset.id = todo.id;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "form-check-input mt-1 todo-item__check";
    check.checked = todo.completed;
    check.disabled = !storageReady;
    check.setAttribute("aria-label", `Mark complete: ${todo.title}`);
    check.addEventListener("change", () => toggleTodo(todo.id));

    const textWrap = document.createElement("div");
    textWrap.className = "flex-grow-1 min-w-0";

    const titleRow = document.createElement("div");
    titleRow.className = "todo-item__title-row";

    const text = document.createElement("span");
    text.className = "todo-item__text";
    text.textContent = todo.title;
    titleRow.appendChild(text);

    if (todo.category) {
      const badge = document.createElement("span");
      badge.className = `badge rounded-pill ${CATEGORY_BADGE_CLASS[todo.category] || "text-bg-secondary"}`;
      badge.textContent = todo.category;
      badge.setAttribute("aria-label", `Category: ${todo.category}`);
      titleRow.appendChild(badge);
    }

    textWrap.appendChild(titleRow);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-outline-danger btn-sm flex-shrink-0";
    delBtn.textContent = "Delete";
    delBtn.disabled = !storageReady;
    delBtn.setAttribute("aria-label", `Delete task: ${todo.title}`);
    delBtn.addEventListener("click", () => deleteTodo(todo.id));

    item.append(check, textWrap, delBtn);
    listEl.appendChild(item);
  }

  updateEmptyState();
}

// --- Event wiring ---

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void addTodo();
});

async function init() {
  try {
    await loadAppDataFromServer();
    storageReady = true;
    setFormEnabled(true);
    clearAlert();
    try {
      await tryMigrateFromLocalStorage();
    } catch (err) {
      console.error(err);
      setAlert(
        "Could not copy old browser data into data/todos.json. Your file-backed list is still loaded.",
        "warning"
      );
    }
    render();
  } catch {
    storageReady = false;
    setFormEnabled(false);
    setAlert("Server not connected.");
    render();
  }
}

setFormEnabled(false);
init();
