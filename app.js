const STORAGE_KEY = "memocho.v1";
const BACKUP_PREFIX = "MEMOCHO:";
const MARKERS = ["📝", "🛍️", "📅", "💡", "🏠", "🍳", "📚", "🎁", "🌿", "⭐", "📌", "🧺", "☕", "🧾", "🛠️", "🗒️"];

const app = document.getElementById("app");

let state = loadState();
let view = {
  screen: "home",
  noteId: null,
  selectedLineId: null,
  activeTag: "",
  search: "",
  sort: "updated",
  showArchived: false,
  markerPicker: false,
  quickNoteId: null,
  quickTitle: "",
  quickBody: "",
  backupText: "",
  toast: ""
};

registerServiceWorker();
render();

function uid(prefix) {
  if (crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    schemaVersion: 1,
    notes: [],
    tags: ["買い物", "予定", "アイデア", "仕事"],
    settings: {
      sort: "updated"
    }
  };
}

function defaultLine(text = "") {
  const stamp = now();
  return {
    id: uid("line"),
    text,
    type: "text",
    level: 0,
    checked: false,
    marker: "📝",
    createdAt: stamp,
    updatedAt: stamp
  };
}

function createNote(title = "", body = "") {
  const stamp = now();
  const lines = body
    ? body.split(/\r?\n/).map((line) => defaultLine(line))
    : [defaultLine("")];
  const note = {
    id: uid("note"),
    title,
    tags: [],
    outline: lines,
    pinned: false,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp
  };
  state.notes.unshift(note);
  saveState();
  return note;
}

function normalizeState(input) {
  const base = defaultState();
  if (!input || typeof input !== "object") return base;
  const notes = Array.isArray(input.notes) ? input.notes : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];

  return {
    schemaVersion: 1,
    notes: notes.map((note) => {
      const stamp = note.updatedAt || note.createdAt || now();
      const outline = Array.isArray(note.outline) && note.outline.length
        ? note.outline
        : [defaultLine(note.body || "")];
      return {
        id: note.id || uid("note"),
        title: note.title || "",
        tags: Array.isArray(note.tags) ? uniqueClean(note.tags) : [],
        outline: outline.map((line) => ({
          id: line.id || uid("line"),
          text: line.text || "",
          type: ["text", "heading", "check"].includes(line.type) ? line.type : "text",
          level: clampNumber(line.level, 0, 2),
          checked: Boolean(line.checked),
          marker: line.marker || "📝",
          createdAt: line.createdAt || stamp,
          updatedAt: line.updatedAt || stamp
        })),
        pinned: Boolean(note.pinned),
        archived: Boolean(note.archived),
        createdAt: note.createdAt || stamp,
        updatedAt: stamp
      };
    }),
    tags: uniqueClean(tags),
    settings: {
      ...base.settings,
      ...(input.settings && typeof input.settings === "object" ? input.settings : {})
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load memo data", error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uniqueClean(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function getAllTags() {
  return uniqueClean([
    ...state.tags,
    ...state.notes.flatMap((note) => note.tags || [])
  ]);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeCssValue(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function render() {
  if (view.screen === "detail") renderDetail();
  else if (view.screen === "settings") renderSettings();
  else renderHome();
}

function renderHome() {
  const tags = getAllTags();
  const notes = getFilteredNotes();

  app.innerHTML = `
    <main class="screen home-screen">
      <header class="topbar">
        <h1 class="app-title">メモ帳</h1>
        <div class="top-actions">
          <button class="icon-button" type="button" data-action="refresh" aria-label="最新版を読み込む" title="最新版を読み込む">↻</button>
          <button class="icon-button" type="button" data-action="settings" aria-label="設定とバックアップ" title="設定とバックアップ">⚙</button>
        </div>
      </header>

      <section class="quick-card" aria-label="すぐメモ">
        <span class="section-label">すぐメモ</span>
        <input class="field" data-field="quick-title" type="text" value="${escapeHtml(view.quickTitle)}" placeholder="タイトル" autocomplete="off">
        <textarea class="textarea" data-field="quick-body" placeholder="本文を入力">${escapeHtml(view.quickBody)}</textarea>
      </section>

      <div class="search-row">
        <input class="search-input" data-field="search" type="search" value="${escapeHtml(view.search)}" placeholder="検索" autocomplete="off">
      </div>

      <div class="chip-list" aria-label="タグ">
        <button class="chip ${view.activeTag === "" ? "active" : ""}" type="button" data-action="filter-tag" data-tag="">すべて</button>
        ${tags.map((tag) => `
          <button class="chip ${view.activeTag === tag ? "active" : ""}" type="button" data-action="filter-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
        `).join("")}
        <button class="chip ${view.showArchived ? "active" : ""}" type="button" data-action="toggle-archived">アーカイブ</button>
      </div>

      <section class="section-heading">
        <h2>${view.showArchived ? "アーカイブ" : "最近のメモ"}</h2>
        <select class="select sort-select" data-field="sort" aria-label="並び替え">
          <option value="updated" ${view.sort === "updated" ? "selected" : ""}>更新順</option>
          <option value="created" ${view.sort === "created" ? "selected" : ""}>作成順</option>
          <option value="title" ${view.sort === "title" ? "selected" : ""}>タイトル順</option>
        </select>
      </section>

      <div class="note-list">
        ${notes.length ? notes.map(renderNoteCard).join("") : `<div class="card empty">まだメモがありません</div>`}
      </div>

      <button class="floating-compose" type="button" data-action="new-note" aria-label="新規メモ" title="新規メモ">✎</button>
    </main>
    ${renderToast()}
  `;
}

function renderNoteCard(note) {
  const preview = getNotePreview(note);
  return `
    <article class="card note-card" data-open-note="${escapeHtml(note.id)}">
      <h3 class="note-card-title">${note.pinned ? "📌 " : ""}${escapeHtml(note.title || "無題のメモ")}</h3>
      <p class="preview">${escapeHtml(preview || "普通の文章だけでも使えます")}</p>
      <div class="note-meta">
        ${(note.tags || []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="mini-actions">
        <button class="mini-button" type="button" data-action="toggle-pin" data-note-id="${escapeHtml(note.id)}">${note.pinned ? "固定解除" : "固定"}</button>
        <button class="mini-button" type="button" data-action="toggle-archive" data-note-id="${escapeHtml(note.id)}">${note.archived ? "戻す" : "アーカイブ"}</button>
      </div>
    </article>
  `;
}

function getFilteredNotes() {
  const query = view.search.trim().toLowerCase();
  let notes = state.notes.filter((note) => Boolean(note.archived) === view.showArchived);
  if (view.activeTag) {
    notes = notes.filter((note) => (note.tags || []).includes(view.activeTag));
  }
  if (query) {
    notes = notes.filter((note) => getSearchText(note).includes(query));
  }
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (view.sort === "title") return (a.title || "").localeCompare(b.title || "", "ja");
    if (view.sort === "created") return String(b.createdAt).localeCompare(String(a.createdAt));
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return notes;
}

function getSearchText(note) {
  return [
    note.title,
    ...(note.tags || []),
    ...(note.outline || []).map((line) => line.text)
  ].join(" ").toLowerCase();
}

function getNotePreview(note) {
  return (note.outline || [])
    .filter((line) => line.text.trim())
    .slice(0, 5)
    .map((line) => {
      const prefix = line.type === "heading" ? `${line.marker || "📝"} ` : line.type === "check" ? `${line.checked ? "☑" : "□"} ` : "";
      return `${"  ".repeat(line.level)}${prefix}${line.text.trim()}`;
    })
    .join("\n");
}

function renderDetail() {
  const note = findNote(view.noteId);
  if (!note) {
    view.screen = "home";
    renderHome();
    return;
  }
  if (!note.outline.length) note.outline.push(defaultLine(""));
  if (!view.selectedLineId || !note.outline.some((line) => line.id === view.selectedLineId)) {
    view.selectedLineId = note.outline[0].id;
  }

  app.innerHTML = `
    <main class="screen detail-screen">
      <header class="detail-header">
        <div class="topbar">
          <button class="nav-button" type="button" data-action="home">戻る</button>
          <div class="row-actions">
            <button class="icon-button" type="button" data-action="toggle-pin" data-note-id="${escapeHtml(note.id)}" aria-label="固定" title="固定">${note.pinned ? "📌" : "☆"}</button>
            <button class="nav-button" type="button" data-action="home">完了</button>
          </div>
        </div>
      </header>

      <input class="field title-input" data-field="note-title" type="text" value="${escapeHtml(note.title)}" placeholder="タイトル" autocomplete="off">

      <section class="tag-editor" aria-label="タグ">
        <span class="section-label">タグ</span>
        <div class="chip-list">
          ${(note.tags || []).map((tag) => `<button class="chip active" type="button" data-action="remove-note-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>`).join("")}
        </div>
        <div class="tag-editor-row">
          <select class="select" data-field="tag-select" aria-label="タグを選ぶ">
            <option value="">タグを選ぶ</option>
            ${getAllTags().filter((tag) => !(note.tags || []).includes(tag)).map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}
          </select>
          <button class="primary-button secondary-button" type="button" data-action="add-selected-tag">追加</button>
        </div>
        <div class="tag-editor-row">
          <input class="field" data-field="new-note-tag" type="text" placeholder="新しいタグ" autocomplete="off">
          <button class="primary-button secondary-button" type="button" data-action="add-new-note-tag">作成</button>
        </div>
      </section>

      <section class="panel outline-panel" aria-label="本文">
        <span class="section-label">本文</span>
        ${note.outline.map((line) => renderOutlineRow(note, line)).join("")}
      </section>
    </main>

    <footer class="bottom-toolbar">
      ${view.markerPicker ? renderMarkerPicker() : ""}
      <div class="toolbar" aria-label="編集ツール">
        ${renderToolButton("set-text", "Aa", "通常行")}
        ${renderToolButton("set-heading", "H", "見出し")}
        ${renderToolButton("set-check", "☑", "チェック行")}
        ${renderToolButton("marker-picker", "😀", "見出し絵文字")}
        ${renderToolButton("outdent", "←", "階層を戻す")}
        ${renderToolButton("indent", "→", "階層を下げる")}
        ${renderToolButton("add-line", "＋", "行を追加")}
        ${renderToolButton("delete-line", "🗑", "行を削除")}
      </div>
    </footer>
    ${renderToast()}
  `;
}

function renderOutlineRow(note, line) {
  const selected = line.id === view.selectedLineId ? "selected" : "";
  const checked = line.type === "check" && line.checked ? "checked" : "";
  const parentComplete = isParentComplete(note, line) ? "parent-complete" : "";
  const headingClass = line.type === "heading" ? `heading-level-${line.level}` : "";
  const leading = line.type === "check"
    ? `<input class="check-input" type="checkbox" data-action="toggle-line-check" data-line-id="${escapeHtml(line.id)}" ${line.checked ? "checked" : ""} aria-label="チェック">`
    : line.type === "heading"
      ? `<button class="marker-button line-leading" type="button" data-action="select-line-marker" data-line-id="${escapeHtml(line.id)}" aria-label="見出し絵文字">${escapeHtml(line.marker || "📝")}</button>`
      : `<span class="line-leading"></span>`;
  return `
    <div class="outline-row level-${line.level} ${selected} ${checked} ${parentComplete} ${headingClass}" data-line-row="${escapeHtml(line.id)}">
      <div class="line-leading">${leading}</div>
      <input class="line-input" data-field="line-text" data-line-id="${escapeHtml(line.id)}" type="text" value="${escapeHtml(line.text)}" placeholder="入力" autocomplete="off">
    </div>
  `;
}

function renderToolButton(action, text, label) {
  return `<button class="tool-button" type="button" data-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${escapeHtml(text)}</button>`;
}

function renderMarkerPicker() {
  return `
    <div class="marker-picker" aria-label="見出し絵文字">
      ${MARKERS.map((marker) => `<button class="marker-button" type="button" data-action="set-marker" data-marker="${escapeHtml(marker)}">${escapeHtml(marker)}</button>`).join("")}
    </div>
  `;
}

function renderSettings() {
  const tags = getAllTags();
  app.innerHTML = `
    <main class="screen settings-screen">
      <header class="topbar">
        <button class="nav-button" type="button" data-action="home">戻る</button>
        <h1 class="app-title">設定</h1>
      </header>

      <section class="panel">
        <h2>バックアップ</h2>
        <p class="preview">文字列を作成してコピーできます。復元すると現在の保存データを置き換えます。</p>
        <textarea class="backup-area" data-field="backup-text" placeholder="バックアップ文字列">${escapeHtml(view.backupText)}</textarea>
        <div class="settings-grid">
          <button class="primary-button" type="button" data-action="make-backup">作成</button>
          <button class="primary-button secondary-button" type="button" data-action="copy-backup">コピー</button>
          <button class="primary-button secondary-button" type="button" data-action="paste-backup">貼付</button>
          <button class="primary-button danger-button" type="button" data-action="restore-backup">復元</button>
        </div>
      </section>

      <section class="panel">
        <h2>JSONファイル</h2>
        <div class="settings-grid">
          <button class="primary-button" type="button" data-action="export-json">エクスポート</button>
          <label class="primary-button secondary-button" for="import-json">インポート</label>
        </div>
        <input id="import-json" class="file-input" data-field="import-json" type="file" accept="application/json,.json">
      </section>

      <section class="panel">
        <h2>タグ管理</h2>
        <div class="tag-editor-row">
          <input class="field" data-field="new-global-tag" type="text" placeholder="新しいタグ" autocomplete="off">
          <button class="primary-button secondary-button" type="button" data-action="add-global-tag">追加</button>
        </div>
        ${tags.length ? tags.map((tag) => `
          <div class="tag-manage-row">
            <span class="tag-pill">${escapeHtml(tag)}</span>
            <button class="mini-button" type="button" data-action="rename-tag" data-tag="${escapeHtml(tag)}">変更</button>
            <button class="mini-button danger-button" type="button" data-action="delete-tag" data-tag="${escapeHtml(tag)}">削除</button>
          </div>
        `).join("") : `<p class="preview">タグはまだありません</p>`}
      </section>
    </main>
    ${renderToast()}
  `;
}

function renderToast() {
  return view.toast ? `<div class="toast">${escapeHtml(view.toast)}</div>` : "";
}

function findNote(id) {
  return state.notes.find((note) => note.id === id);
}

function findLine(note, id) {
  return note.outline.find((line) => line.id === id);
}

function selectedLine(note) {
  return findLine(note, view.selectedLineId) || note.outline[0];
}

function touchNote(note) {
  note.updatedAt = now();
}

function openNote(noteId) {
  const note = findNote(noteId);
  if (!note) return;
  view.screen = "detail";
  view.noteId = note.id;
  view.selectedLineId = note.outline[0] ? note.outline[0].id : null;
  view.markerPicker = false;
  render();
}

function home() {
  view.screen = "home";
  view.noteId = null;
  view.selectedLineId = null;
  view.markerPicker = false;
  render();
}

function showToast(message) {
  view.toast = message;
  render();
  window.setTimeout(() => {
    view.toast = "";
    render();
  }, 1600);
}

app.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  const openEl = event.target.closest("[data-open-note]");
  if (actionEl) {
    event.preventDefault();
    handleAction(actionEl);
    return;
  }
  if (openEl) {
    openNote(openEl.dataset.openNote);
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!target.dataset.field) return;
  handleInput(target);
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.dataset.field) return;
  handleChange(target);
});

app.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target.dataset.field === "line-text") {
    view.selectedLineId = target.dataset.lineId;
    document.querySelectorAll("[data-line-row]").forEach((row) => row.classList.toggle("selected", row.dataset.lineRow === view.selectedLineId));
  }
});

app.addEventListener("blur", (event) => {
  if (event.target.dataset.field === "quick-title" || event.target.dataset.field === "quick-body") {
    render();
  }
}, true);

function handleAction(el) {
  const action = el.dataset.action;
  const note = findNote(view.noteId);

  if (action === "home") return home();
  if (action === "settings") {
    view.screen = "settings";
    render();
    return;
  }
  if (action === "refresh") return refreshApp();
  if (action === "new-note") {
    const newNote = createNote("", "");
    openNote(newNote.id);
    return;
  }
  if (action === "filter-tag") {
    view.activeTag = el.dataset.tag || "";
    render();
    return;
  }
  if (action === "toggle-archived") {
    view.showArchived = !view.showArchived;
    render();
    return;
  }
  if (action === "toggle-pin") {
    const targetNote = findNote(el.dataset.noteId);
    if (!targetNote) return;
    targetNote.pinned = !targetNote.pinned;
    touchNote(targetNote);
    saveState();
    render();
    return;
  }
  if (action === "toggle-archive") {
    const targetNote = findNote(el.dataset.noteId);
    if (!targetNote) return;
    targetNote.archived = !targetNote.archived;
    touchNote(targetNote);
    saveState();
    render();
    return;
  }

  if (view.screen === "detail" && note) handleDetailAction(action, el, note);
  if (view.screen === "settings") handleSettingsAction(action, el);
}

function handleDetailAction(action, el, note) {
  const line = selectedLine(note);
  if (!line) return;

  if (action === "add-selected-tag") {
    const select = app.querySelector('[data-field="tag-select"]');
    addTagToNote(note, select ? select.value : "");
    return;
  }
  if (action === "add-new-note-tag") {
    const input = app.querySelector('[data-field="new-note-tag"]');
    addTagToNote(note, input ? input.value : "");
    return;
  }
  if (action === "remove-note-tag") {
    note.tags = note.tags.filter((tag) => tag !== el.dataset.tag);
    touchNote(note);
    saveState();
    render();
    return;
  }
  if (action === "toggle-line-check") {
    const targetLine = findLine(note, el.dataset.lineId);
    if (!targetLine) return;
    targetLine.type = "check";
    targetLine.checked = el.checked;
    targetLine.updatedAt = now();
    updateParentCompletion(note);
    reorderCheckedWithinParent(note, targetLine.id);
    touchNote(note);
    saveState();
    render();
    return;
  }
  if (action === "select-line-marker") {
    view.selectedLineId = el.dataset.lineId;
    view.markerPicker = true;
    render();
    return;
  }
  if (action === "set-text") {
    line.type = "text";
    line.checked = false;
    view.markerPicker = false;
  }
  if (action === "set-heading") {
    line.type = "heading";
    line.checked = false;
    view.markerPicker = true;
  }
  if (action === "set-check") {
    line.type = "check";
    line.checked = Boolean(line.checked);
    view.markerPicker = false;
  }
  if (action === "marker-picker") {
    view.markerPicker = !view.markerPicker;
    line.type = "heading";
  }
  if (action === "set-marker") {
    line.type = "heading";
    line.marker = el.dataset.marker || "📝";
    view.markerPicker = false;
  }
  if (action === "indent") line.level = Math.min(2, line.level + 1);
  if (action === "outdent") line.level = Math.max(0, line.level - 1);
  if (action === "add-line") {
    const index = note.outline.findIndex((item) => item.id === line.id);
    const fresh = defaultLine("");
    fresh.type = line.type;
    fresh.level = line.level;
    fresh.marker = line.marker || "📝";
    note.outline.splice(index + 1, 0, fresh);
    view.selectedLineId = fresh.id;
  }
  if (action === "delete-line") {
    if (note.outline.length === 1) {
      line.text = "";
      line.type = "text";
      line.checked = false;
      line.level = 0;
    } else {
      const index = note.outline.findIndex((item) => item.id === line.id);
      note.outline.splice(index, 1);
      view.selectedLineId = note.outline[Math.max(0, index - 1)].id;
    }
  }

  line.updatedAt = now();
  updateParentCompletion(note);
  touchNote(note);
  saveState();
  render();
  focusSelectedLine();
}

function handleSettingsAction(action, el) {
  if (action === "make-backup") {
    view.backupText = makeBackupString();
    render();
    return;
  }
  if (action === "copy-backup") return copyBackup();
  if (action === "paste-backup") return pasteBackup();
  if (action === "restore-backup") return restoreBackup();
  if (action === "export-json") return exportJson();
  if (action === "add-global-tag") {
    const input = app.querySelector('[data-field="new-global-tag"]');
    addGlobalTag(input ? input.value : "");
    return;
  }
  if (action === "rename-tag") {
    renameTag(el.dataset.tag);
    return;
  }
  if (action === "delete-tag") {
    deleteTag(el.dataset.tag);
  }
}

function handleInput(target) {
  if (target.dataset.field === "quick-title" || target.dataset.field === "quick-body") {
    updateQuickMemo();
    return;
  }
  if (target.dataset.field === "search") {
    view.search = target.value;
    render();
    return;
  }
  if (target.dataset.field === "note-title") {
    const note = findNote(view.noteId);
    if (!note) return;
    note.title = target.value;
    touchNote(note);
    saveState();
    return;
  }
  if (target.dataset.field === "line-text") {
    const note = findNote(view.noteId);
    if (!note) return;
    const line = findLine(note, target.dataset.lineId);
    if (!line) return;
    line.text = target.value;
    line.updatedAt = now();
    touchNote(note);
    saveState();
    return;
  }
  if (target.dataset.field === "backup-text") {
    view.backupText = target.value;
  }
}

function handleChange(target) {
  if (target.dataset.field === "sort") {
    view.sort = target.value;
    state.settings.sort = target.value;
    saveState();
    render();
    return;
  }
  if (target.dataset.field === "import-json") {
    importJsonFile(target.files && target.files[0]);
  }
}

function updateQuickMemo() {
  const titleEl = app.querySelector('[data-field="quick-title"]');
  const bodyEl = app.querySelector('[data-field="quick-body"]');
  const title = titleEl ? titleEl.value : "";
  const body = bodyEl ? bodyEl.value : "";
  view.quickTitle = title;
  view.quickBody = body;
  if (!title.trim() && !body.trim()) return;

  let note = view.quickNoteId ? findNote(view.quickNoteId) : null;
  if (!note) {
    note = createNote(title.trim(), body);
    view.quickNoteId = note.id;
  }
  note.title = title.trim();
  note.outline = body.split(/\r?\n/).map((text) => ({
    ...defaultLine(text),
    type: "text",
    level: 0
  }));
  if (!note.outline.length) note.outline = [defaultLine("")];
  touchNote(note);
  saveState();
}

function addTagToNote(note, value) {
  const tag = String(value || "").trim();
  if (!tag) return;
  state.tags = uniqueClean([...state.tags, tag]);
  note.tags = uniqueClean([...(note.tags || []), tag]);
  touchNote(note);
  saveState();
  render();
}

function addGlobalTag(value) {
  const tag = String(value || "").trim();
  if (!tag) return;
  state.tags = uniqueClean([...state.tags, tag]);
  saveState();
  render();
}

function renameTag(oldTag) {
  const next = window.prompt("新しいタグ名", oldTag);
  const newTag = String(next || "").trim();
  if (!newTag || newTag === oldTag) return;
  state.tags = uniqueClean(state.tags.map((tag) => tag === oldTag ? newTag : tag));
  state.notes.forEach((note) => {
    note.tags = uniqueClean((note.tags || []).map((tag) => tag === oldTag ? newTag : tag));
  });
  saveState();
  render();
}

function deleteTag(tag) {
  if (!window.confirm(`「${tag}」を削除しますか？メモからも外れます。`)) return;
  state.tags = state.tags.filter((item) => item !== tag);
  state.notes.forEach((note) => {
    note.tags = (note.tags || []).filter((item) => item !== tag);
  });
  saveState();
  render();
}

function isParentComplete(note, line) {
  const index = note.outline.findIndex((item) => item.id === line.id);
  if (index < 0) return false;
  const descendants = [];
  for (let i = index + 1; i < note.outline.length; i += 1) {
    if (note.outline[i].level <= line.level) break;
    descendants.push(note.outline[i]);
  }
  const checkDescendants = descendants.filter((item) => item.type === "check");
  return checkDescendants.length > 0 && checkDescendants.every((item) => item.checked);
}

function updateParentCompletion(note) {
  note.outline.forEach((line) => {
    if (line.type === "check" && hasCheckDescendants(note, line)) {
      line.checked = isParentComplete(note, line);
    }
  });
}

function hasCheckDescendants(note, line) {
  const index = note.outline.findIndex((item) => item.id === line.id);
  for (let i = index + 1; i < note.outline.length; i += 1) {
    if (note.outline[i].level <= line.level) break;
    if (note.outline[i].type === "check") return true;
  }
  return false;
}

function reorderCheckedWithinParent(note, lineId) {
  const lineIndex = note.outline.findIndex((item) => item.id === lineId);
  if (lineIndex < 0) return;
  const level = note.outline[lineIndex].level;
  let start = 0;
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    if (note.outline[i].level < level) {
      start = i + 1;
      break;
    }
  }
  let end = note.outline.length;
  for (let i = lineIndex + 1; i < note.outline.length; i += 1) {
    if (note.outline[i].level < level) {
      end = i;
      break;
    }
  }

  const before = note.outline.slice(0, start);
  const zone = note.outline.slice(start, end);
  const after = note.outline.slice(end);
  const blocks = [];
  for (let i = 0; i < zone.length;) {
    const row = zone[i];
    if (row.level !== level) {
      blocks.push([row]);
      i += 1;
      continue;
    }
    let next = i + 1;
    while (next < zone.length && zone[next].level > level) next += 1;
    blocks.push(zone.slice(i, next));
    i = next;
  }
  blocks.sort((a, b) => {
    const aDone = a[0].type === "check" && a[0].checked;
    const bDone = b[0].type === "check" && b[0].checked;
    if (aDone === bDone) return 0;
    return aDone ? 1 : -1;
  });
  note.outline = before.concat(blocks.flat(), after);
}

function focusSelectedLine() {
  window.setTimeout(() => {
    const input = app.querySelector(`[data-field="line-text"][data-line-id="${safeCssValue(view.selectedLineId)}"]`);
    if (input) input.focus();
  }, 0);
}

function makeBackupString() {
  return BACKUP_PREFIX + toBase64(JSON.stringify(state));
}

function parseBackupString(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("バックアップ文字列が空です");
  if (text.startsWith(BACKUP_PREFIX)) {
    return normalizeState(JSON.parse(fromBase64(text.slice(BACKUP_PREFIX.length))));
  }
  return normalizeState(JSON.parse(text));
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function fromBase64(value) {
  return decodeURIComponent(escape(atob(value)));
}

function copyBackup() {
  const text = view.backupText || makeBackupString();
  view.backupText = text;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast("コピーしました"));
  } else {
    const area = app.querySelector('[data-field="backup-text"]');
    if (area) {
      area.value = text;
      area.select();
      document.execCommand("copy");
      showToast("コピーしました");
    }
  }
}

function pasteBackup() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then((text) => {
      view.backupText = text;
      render();
    }).catch(() => showToast("貼付できませんでした"));
    return;
  }
  const area = app.querySelector('[data-field="backup-text"]');
  if (area) area.focus();
  showToast("貼り付けてください");
}

function restoreBackup() {
  try {
    const restored = parseBackupString(view.backupText);
    if (!window.confirm("バックアップから復元します。現在の保存データを置き換えますか？")) return;
    state = restored;
    saveState();
    view.backupText = "";
    showToast("復元しました");
  } catch (error) {
    window.alert("復元できませんでした。バックアップ文字列を確認してください。");
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `memocho-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeState(JSON.parse(String(reader.result)));
      const existingIds = new Set(state.notes.map((note) => note.id));
      const addNotes = imported.notes.filter((note) => !existingIds.has(note.id));
      state.notes = [...addNotes, ...state.notes];
      state.tags = uniqueClean([...state.tags, ...imported.tags, ...addNotes.flatMap((note) => note.tags || [])]);
      saveState();
      showToast(`${addNotes.length}件インポートしました`);
    } catch (error) {
      window.alert("JSONを読み込めませんでした。");
    }
  };
  reader.readAsText(file);
}

function refreshApp() {
  const message = "キャッシュを削除して最新版を読み込みます。入力データは消えません。実行しますか？";
  if (!window.confirm(message)) return;

  const update = navigator.serviceWorker && navigator.serviceWorker.getRegistration
    ? navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return null;
      return registration.update().then(() => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        if (registration.active) registration.active.postMessage({ type: "SKIP_WAITING" });
      });
    })
    : Promise.resolve();

  update
    .then(() => window.caches ? caches.keys() : [])
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .then(() => window.location.reload())
    .catch(() => window.location.reload());
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
