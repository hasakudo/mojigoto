(() => {
  const DEBUG = false;
  const dlog = (...args) => {
    if (DEBUG) console.log(...args);
  };


  dlog("[Mojigoto reorder] loaded NEW FILE 2026-03-09");

  const vscode = acquireVsCodeApi();
  const boot = window.__Mojigoto_REORDER_BOOT__ || {};
  const state = {
    rootDir: boot.rootDir || "",
    folders: (boot.folders || []).map((f) => ({
      ...f,
      dirty: false,
    })),
    folderOriginals: JSON.parse(JSON.stringify(boot.folders || [])),
    selectedFolderPath: boot.selectedFolderPath || "",
    files: boot.files || [],
    originalFiles: JSON.parse(JSON.stringify(boot.files || [])),
    dirtyMap: {},
    fileDrafts: {},
    fileOriginalsByFolder: {},
    dirty: false,

    viewMode: "arrow",
    dragIndex: -1,

    folderDirty: false,
    folderDragIndex: -1,
    folderViewMode: "arrow",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const $folderList = document.getElementById("folderList");
  const $fileList = document.getElementById("fileList");
  const $filePaneTitle = document.getElementById("filePaneTitle");
  const $fileCount = document.getElementById("fileCount");
  const $currentTarget = document.getElementById("currentTarget");
  const $dirtyBadge = document.getElementById("dirtyBadge");
  const $emptyState = document.getElementById("emptyState");
  const $saveBtn = document.getElementById("saveBtn");
  const $discardBtn = document.getElementById("discardBtn");
  const $reloadBtn = document.getElementById("reloadBtn");
  const $closeBtn = document.getElementById("closeBtn");
  const $modeArrowBtn = document.getElementById("modeArrowBtn");
  const $modeDragBtn = document.getElementById("modeDragBtn");
  const $saveFolderOrderBtn = document.getElementById("saveFolderOrderBtn");
  const $discardFolderOrderBtn = document.getElementById(
    "discardFolderOrderBtn",
  );
  const $reloadFolderListBtn = document.getElementById("reloadFolderListBtn");
  const $folderModeArrowBtn = document.getElementById("folderModeArrowBtn");
  const $folderModeDragBtn = document.getElementById("folderModeDragBtn");

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  if (state.selectedFolderPath) {
    state.fileDrafts[state.selectedFolderPath] = clone(state.files);
    state.fileOriginalsByFolder[state.selectedFolderPath] = clone(
      state.originalFiles,
    );
  }

  function normalizedDisplayName(item) {
    return String(item?.displayName || "").trim();
  }

  function hasFileOrderChanged() {
    const current = state.files.map((item) => String(item?.id || item?.path || ""));
    const original = state.originalFiles.map((item) => String(item?.id || item?.path || ""));
    return JSON.stringify(current) !== JSON.stringify(original);
  }

  function hasFileDisplayNameChanged() {
    const originals = new Map(
      state.originalFiles.map((item) => [
        String(item?.id || item?.path || ""),
        normalizedDisplayName(item),
      ]),
    );
    return state.files.some((item) => {
      const key = String(item?.id || item?.path || "");
      return normalizedDisplayName(item) !== String(originals.get(key) || "");
    });
  }

  function hasFileChanges() {
    return hasFileOrderChanged() || hasFileDisplayNameChanged();
  }

  function editableFolders(items = state.folders) {
    return items.filter((item) => item?.kind === "folder");
  }

  function isTopLevelFolder(item) {
    if (!item || item.kind !== "folder") return false;
    if (Number(item.depth) === 1) return true;
    return !!state.rootDir && item.parentPath === state.rootDir;
  }

  function getFolderBreadcrumb(folder) {
    if (!folder) return "";
    if (folder.kind === "root") return folder.cleanName || folder.name || "manuscript";

    const byPath = new Map(state.folders.map((item) => [item.path, item]));
    const labels = [];
    let current = folder;
    while (current && current.kind === "folder") {
      labels.unshift(current.displayName || current.cleanName || current.name);
      current = byPath.get(current.parentPath);
    }
    return labels.join(" / ");
  }

  function hasFolderOrderChanged() {
    const current = editableFolders().map((item) => String(item?.id || item?.path || ""));
    const original = editableFolders(state.folderOriginals).map((item) => String(item?.id || item?.path || ""));
    return JSON.stringify(current) !== JSON.stringify(original);
  }

  function hasFolderDisplayNameChanged() {
    const originals = new Map(
      editableFolders(state.folderOriginals).map((item) => [
        String(item?.id || item?.path || ""),
        normalizedDisplayName(item),
      ]),
    );
    return editableFolders().some((item) => {
      const key = String(item?.id || item?.path || "");
      return normalizedDisplayName(item) !== String(originals.get(key) || "");
    });
  }

  function updateFolderDirty() {
    state.folderDirty = hasFolderOrderChanged() || hasFolderDisplayNameChanged();
    updateDirtyBadge();
    updateRenameButtons();
  }

  function updateDirtyBadge() {
    const hasDirtyFiles = Object.values(state.dirtyMap || {}).some(Boolean);
    $dirtyBadge.hidden = !hasDirtyFiles && !state.folderDirty;
  }

  function hasPendingChanges() {
    return state.folderDirty || Object.values(state.dirtyMap || {}).some(Boolean);
  }

  function updateRenameButtons() {
    const disabled = hasPendingChanges();
    document
      .querySelectorAll("[data-rename-entry], [data-insert-heading]")
      .forEach((button) => {
        button.disabled = disabled;
        button.title = disabled
          ? "先に表示名・並び順の変更を保存または破棄してください"
          : button.hasAttribute("data-insert-heading")
            ? "このファイル1件の先頭へ見出しを挿入"
            : "実名を個別に変更";
      });
  }

  function updateModeUI() {
    $modeArrowBtn.classList.toggle("mode-active", state.viewMode === "arrow");
    $modeDragBtn.classList.toggle("mode-active", state.viewMode === "drag");
  }
  function updateFolderModeUI() {
    $folderModeArrowBtn?.classList.toggle(
      "mode-active",
      state.folderViewMode === "arrow",
    );
    $folderModeDragBtn?.classList.toggle(
      "mode-active",
      state.folderViewMode === "drag",
    );
  }

  function setDirty(flag) {
    const v = !!flag;
    dlog("[Mojigoto reorder] setDirty", {
      selectedFolderPath: state.selectedFolderPath,
      value: v,
    });

    state.dirty = v;
    state.dirtyMap[state.selectedFolderPath] = v;
    state.fileDrafts[state.selectedFolderPath] = clone(state.files);

    state.folders = state.folders.map((folder) => {
      if (folder.path === state.selectedFolderPath) {
        return { ...folder, dirty: v };
      }
      return {
        ...folder,
        dirty: !!state.dirtyMap[folder.path],
      };
    });

    dlog("[Mojigoto reorder] dirtyMap", state.dirtyMap);
    dlog(
      "[Mojigoto reorder] folders",
      state.folders.map((f) => ({
        name: f.cleanName || f.name,
        dirty: f.dirty,
        path: f.path,
      })),
    );

    updateDirtyBadge();
    updateRenameButtons();
  }

  function reindexLabels(startIndex = 1) {
    const digits = Math.max(
      2,
      String(startIndex + Math.max(state.files.length - 1, 0)).length,
    );
    state.files = state.files.map((item, index) => ({
      ...item,
      previewLabel: `${String(startIndex + index).padStart(digits, "0")}. ${item.cleanName}${item.ext}`,
    }));
  }

  function moveItem(from, to) {
    if (to < 0 || to >= state.files.length || from === to) return;

    const copy = [...state.files];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    state.files = copy;

    reindexLabels(1);
    setDirty(hasFileChanges());

    dlog("[Mojigoto reorder] file move -> dirtyMap", state.dirtyMap);

    renderFiles();
    renderFolders();
  }

  function onFolderDragStart(index, row) {
    const item = state.folders[index];
    if (!isTopLevelFolder(item)) return;

    state.folderDragIndex = index;
    row.classList.add("is-dragging");
  }

  function onFolderDragEnd(row) {
    row.classList.remove("is-dragging");
    state.folderDragIndex = -1;

    document.querySelectorAll(".folder-item.is-drag-over").forEach((el) => {
      el.classList.remove("is-drag-over");
    });
  }

  function onFolderDragOver(event, index, row) {
    const target = state.folders[index];
    if (!isTopLevelFolder(target)) return;

    event.preventDefault();
    row.classList.add("is-drag-over");
  }

  function onFolderDragLeave(row) {
    row.classList.remove("is-drag-over");
  }

  function onFolderDrop(event, index, row) {
    event.preventDefault();
    row.classList.remove("is-drag-over");

    const from = state.folderDragIndex;
    if (from < 0 || from === index) return;

    const fromItem = state.folders[from];
    const toItem = state.folders[index];

    if (!isTopLevelFolder(fromItem)) return;
    if (!isTopLevelFolder(toItem)) return;

    moveFolder(from, index);
    state.folderDragIndex = -1;
  }

  function getFirstFolderIndex() {
    return state.folders.findIndex(isTopLevelFolder);
  }

  function getLastFolderIndex() {
    for (let i = state.folders.length - 1; i >= 0; i--) {
      const item = state.folders[i];
      if (isTopLevelFolder(item)) return i;
    }
    return -1;
  }

  function moveFolder(from, to) {
    if (to < 0 || to >= state.folders.length || from === to) return;

    const fromItem = state.folders[from];
    const toItem = state.folders[to];

    if (!isTopLevelFolder(fromItem)) return;
    if (!isTopLevelFolder(toItem)) return;

    const rootItems = state.folders.filter((item) => item?.kind === "root");
    const groups = [];
    let currentGroup = null;

    for (const item of state.folders) {
      if (item?.kind === "root") continue;
      if (isTopLevelFolder(item)) {
        currentGroup = [item];
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.push(item);
      }
    }

    const fromGroupIndex = groups.findIndex((group) => group[0] === fromItem);
    const toGroupIndex = groups.findIndex((group) => group[0] === toItem);
    if (fromGroupIndex < 0 || toGroupIndex < 0) return;

    const [group] = groups.splice(fromGroupIndex, 1);
    groups.splice(toGroupIndex, 0, group);

    state.folders = [...rootItems, ...groups.flat()];
    updateFolderDirty();

    console.log(
      "[Mojigoto reorder] folder move -> folderDirty",
      state.folderDirty,
    );

    renderFolders();
  }

  function renderFolders() {
    $folderList.innerHTML = "";

    const movableFolders = state.folders.filter(isTopLevelFolder);
    const canReorderFolders = movableFolders.length >= 2;

    updateFolderModeUI();

    state.folders.forEach((folder, index) => {
      const dirtyClass = folder.dirty ? " is-dirty" : "";
      const activeClass =
        folder.path === state.selectedFolderPath ? " is-active" : "";

      const row = document.createElement("div");
      row.className = `folder-item${activeClass}${dirtyClass}`;
      const visualDepth = Math.max(0, Number(folder.depth || 0) - 1);
      row.style.setProperty("--folder-depth", String(visualDepth));
      if (visualDepth > 0) row.classList.add("is-nested");

      const canMove = canReorderFolders && isTopLevelFolder(folder);

      if (canMove && state.folderViewMode === "drag") {
        row.classList.add("is-draggable");
        row.setAttribute("draggable", "true");
      }

      const dragHandle =
        canMove && state.folderViewMode === "drag"
          ? `<div class="drag-handle folder-drag-handle" title="ドラッグして移動">⋮⋮</div>`
          : "";

      const actionsHtml =
        canMove && state.folderViewMode === "arrow"
          ? `
        <div class="folder-actions">
          <button type="button" data-move="top">先頭</button>
          <button type="button" data-move="up">↑</button>
          <button type="button" data-move="down">↓</button>
          <button type="button" data-move="bottom">末尾</button>
        </div>`
          : "";

      const dragNoteHtml =
        canMove && state.folderViewMode === "drag"
          ? `<div class="folder-actions drag-mode-note"><span class="muted">ドラッグで移動</span></div>`
          : "";

      row.innerHTML = `
      <div class="folder-main-wrap">
        ${dragHandle}
        <div class="folder-main">
          <button type="button" class="folder-select-button">
            <span class="folder-name">${escapeHtml(folder.displayName || folder.cleanName || folder.name)}</span>
          </button>
          ${folder.kind === "folder" ? `
            <label class="display-name-field">
              <span>表示名</span>
              <input
                type="text"
                data-folder-display-name="${index}"
                value="${escapeHtml(folder.displayName || "")}"
                placeholder="${escapeHtml(folder.cleanName || folder.name)}"
                aria-label="${escapeHtml(folder.cleanName || folder.name)}の表示名"
              >
            </label>
            <div class="actual-name-row">
              <div class="actual-name" title="${escapeHtml(folder.name)}">実フォルダ名: ${escapeHtml(folder.name)}</div>
              <button
                type="button"
                class="rename-entry-button"
                data-rename-entry="folder"
                data-entry-index="${index}"
              >実名変更</button>
            </div>
          ` : ""}
          <div class="folder-meta">直下ファイル: ${Number(folder.count || 0)}件</div>
        </div>
      </div>
      ${state.folderViewMode === "arrow" ? actionsHtml : dragNoteHtml}
    `;

      row.querySelector(".folder-select-button").addEventListener("click", () => {
        vscode.postMessage({ type: "select-folder", folderPath: folder.path });
      });

      row.querySelector("[data-folder-display-name]")?.addEventListener("input", (event) => {
        state.folders[index].displayName = String(event.target.value || "");
        const name = row.querySelector(".folder-name");
        if (name) {
          name.textContent =
            String(event.target.value || "").trim() || folder.cleanName || folder.name;
        }
        if (folder.path === state.selectedFolderPath) {
          const activeLabel =
            String(event.target.value || "").trim() || folder.cleanName || folder.name;
          $filePaneTitle.textContent = `${activeLabel} のファイル`;
          $currentTarget.textContent = `対象: ${getFolderBreadcrumb(state.folders[index])}`;
        }
        updateFolderDirty();
        if ($saveFolderOrderBtn) {
          const hasDirtyFiles = Object.values(state.dirtyMap || {}).some(Boolean);
          $saveFolderOrderBtn.disabled = !state.folderDirty || hasDirtyFiles;
        }
      });

      row.querySelector('[data-rename-entry="folder"]')?.addEventListener("click", () => {
        vscode.postMessage({
          type: "rename-entry",
          kind: "folder",
          entryPath: folder.path,
          selectedFolderPath: state.selectedFolderPath,
        });
      });

      if (canMove && state.folderViewMode === "arrow") {
        row.querySelectorAll("button[data-move]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const kind = btn.getAttribute("data-move");

            if (kind === "top") {
              const firstFolderIndex = getFirstFolderIndex();
              if (firstFolderIndex >= 0) moveFolder(index, firstFolderIndex);
            }

            if (kind === "up") {
              let target = -1;
              for (let i = index - 1; i >= 0; i--) {
                const item = state.folders[i];
                if (isTopLevelFolder(item)) {
                  target = i;
                  break;
                }
              }
              if (target >= 0) moveFolder(index, target);
            }

            if (kind === "down") {
              let target = -1;
              for (let i = index + 1; i < state.folders.length; i++) {
                const item = state.folders[i];
                if (isTopLevelFolder(item)) {
                  target = i;
                  break;
                }
              }
              if (target >= 0) moveFolder(index, target);
            }

            if (kind === "bottom") {
              const lastFolderIndex = getLastFolderIndex();
              if (lastFolderIndex >= 0) moveFolder(index, lastFolderIndex);
            }
          });
        });
      }

      if (canMove && state.folderViewMode === "drag") {
        row.addEventListener("dragstart", () => onFolderDragStart(index, row));
        row.addEventListener("dragend", () => onFolderDragEnd(row));
        row.addEventListener("dragover", (event) =>
          onFolderDragOver(event, index, row),
        );
        row.addEventListener("dragleave", () => onFolderDragLeave(row));
        row.addEventListener("drop", (event) =>
          onFolderDrop(event, index, row),
        );
      }

      $folderList.appendChild(row);
    });

    updateRenameButtons();

    const hasEditableFolders = movableFolders.length > 0;

    if ($saveFolderOrderBtn) {
      $saveFolderOrderBtn.hidden = !hasEditableFolders;
      const hasDirtyFiles = Object.values(state.dirtyMap || {}).some(Boolean);
      $saveFolderOrderBtn.disabled = !state.folderDirty || hasDirtyFiles;
      $saveFolderOrderBtn.title = hasDirtyFiles
        ? "先にファイル側の変更を保存または破棄してください"
        : "";
    }

    if ($discardFolderOrderBtn) {
      $discardFolderOrderBtn.hidden = !hasEditableFolders;
      $discardFolderOrderBtn.disabled = !state.folderDirty;
    }

    if ($reloadFolderListBtn) {
      $reloadFolderListBtn.hidden = !hasEditableFolders;
    }

    if ($folderModeArrowBtn) {
      $folderModeArrowBtn.hidden = !canReorderFolders;
    }

    if ($folderModeDragBtn) {
      $folderModeDragBtn.hidden = !canReorderFolders;
    }
  }

  function onDragStart(index, row) {
    state.dragIndex = index;
    row.classList.add("is-dragging");
  }

  function onDragEnd(row) {
    row.classList.remove("is-dragging");
    state.dragIndex = -1;
    document.querySelectorAll(".file-row.is-drag-over").forEach((el) => {
      el.classList.remove("is-drag-over");
    });
  }

  function onDragOver(event, row) {
    event.preventDefault();
    row.classList.add("is-drag-over");
  }

  function onDragLeave(row) {
    row.classList.remove("is-drag-over");
  }

  function onDrop(event, index, row) {
    event.preventDefault();
    row.classList.remove("is-drag-over");

    if (state.dragIndex < 0 || state.dragIndex === index) return;
    moveItem(state.dragIndex, index);
    state.dragIndex = -1;
  }

  function renderFiles() {
    const active = state.folders.find(
      (f) => f.path === state.selectedFolderPath,
    );

    const activeLabel = active
      ? active.displayName || active.cleanName || active.name
      : "フォルダ";
    $filePaneTitle.textContent = `${activeLabel} のファイル`;
    $fileCount.textContent = `全 ${state.files.length} 件`;
    $currentTarget.textContent = `対象: ${active ? getFolderBreadcrumb(active) : ""}`;
    $fileList.innerHTML = "";
    $emptyState.hidden = state.files.length > 0;

    updateModeUI();

    state.files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-row";

      if (state.viewMode === "drag") {
        row.classList.add("is-draggable");
        row.setAttribute("draggable", "true");
      }

      const dragHandle =
        state.viewMode === "drag"
          ? `<div class="drag-handle" title="ドラッグして移動">⋮⋮</div>`
          : "";

      const actionHtml =
        state.viewMode === "arrow"
          ? `
        <div class="file-actions">
          <button type="button" data-move="top">先頭</button>
          <button type="button" data-move="up">↑</button>
          <button type="button" data-move="down">↓</button>
          <button type="button" data-move="bottom">末尾</button>
        </div>`
          : `
        <div class="file-actions drag-mode-note">
          <span class="muted">ドラッグで移動</span>
        </div>`;

      const orderNumber = String(index + 1).padStart(
        Math.max(2, String(Math.max(state.files.length, 1)).length),
        "0",
      );

      row.innerHTML = `
      <div class="file-main-wrap">
        ${dragHandle}
        <div class="order-number" aria-label="並び順 ${index + 1}">${orderNumber}</div>
        <div class="file-main">
          <label class="display-name-field file-display-name-field">
            <span>表示名</span>
            <input
              type="text"
              data-file-display-name="${index}"
              value="${escapeHtml(file.displayName || "")}"
              placeholder="${escapeHtml(file.cleanName || file.originalName)}"
              aria-label="${escapeHtml(file.cleanName || file.originalName)}の表示名"
            >
          </label>
          <div class="actual-name-row">
            <div class="actual-name" title="${escapeHtml(file.originalName)}">実ファイル名: ${escapeHtml(file.originalName)}</div>
            <div class="entry-row-actions">
              <button
                type="button"
                class="insert-heading-button"
                data-insert-heading
                data-entry-index="${index}"
              >見出し挿入</button>
              <button
                type="button"
                class="rename-entry-button"
                data-rename-entry="file"
                data-entry-index="${index}"
              >実名変更</button>
            </div>
          </div>
        </div>
      </div>
      ${actionHtml}
    `;

      row.querySelector("[data-file-display-name]")?.addEventListener("input", (event) => {
        state.files[index].displayName = String(event.target.value || "");
        setDirty(hasFileChanges());
        $saveBtn.disabled = !state.dirty;
        $discardBtn.disabled = !state.dirty;
        renderFolders();
      });

      row.querySelector('[data-rename-entry="file"]')?.addEventListener("click", () => {
        vscode.postMessage({
          type: "rename-entry",
          kind: "file",
          entryPath: file.path,
          selectedFolderPath: state.selectedFolderPath,
        });
      });

      row.querySelector("[data-insert-heading]")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "insert-heading",
          filePath: file.path,
        });
      });

      if (state.viewMode === "arrow") {
        row.querySelectorAll("button[data-move]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const kind = btn.getAttribute("data-move");
            if (kind === "top") moveItem(index, 0);
            if (kind === "up") moveItem(index, index - 1);
            if (kind === "down") moveItem(index, index + 1);
            if (kind === "bottom") moveItem(index, state.files.length - 1);
          });
        });
      }

      if (state.viewMode === "drag") {
        row.addEventListener("dragstart", () => onDragStart(index, row));
        row.addEventListener("dragend", () => onDragEnd(row));
        row.addEventListener("dragover", (event) => onDragOver(event, row));
        row.addEventListener("dragleave", () => onDragLeave(row));
        row.addEventListener("drop", (event) => onDrop(event, index, row));
      }

      $fileList.appendChild(row);
    });

    $saveBtn.disabled = !state.dirty;
    $discardBtn.disabled = !state.dirty;
    updateRenameButtons();
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};

    if (msg.type === "webviewUiSettingsChanged") {
      const scale = Number(msg.payload?.fontScale || 1);
      document.body.style.setProperty(
        "--mojigoto-content-font-scale",
        String(Math.min(1.6, Math.max(0.8, scale))),
      );
      return;
    }

    if (msg.type === "folder-order-saved") {
      state.folders = (msg.folders || []).map((f) => ({
        ...f,
        dirty: false,
      }));
      state.folderOriginals = clone(msg.folders || []);
      state.folderDirty = false;
      state.selectedFolderPath =
        msg.selectedFolderPath || state.selectedFolderPath;
      if (Array.isArray(msg.files)) {
        state.files = msg.files;
        state.originalFiles = clone(msg.files);
        state.dirty = false;
        state.dirtyMap = {};
        state.fileDrafts = {
          [state.selectedFolderPath]: clone(msg.files),
        };
        state.fileOriginalsByFolder = {
          [state.selectedFolderPath]: clone(msg.files),
        };
      }

      renderFolders();
      renderFiles();
      updateDirtyBadge();
    }

    if (msg.type === "entry-renamed") {
      state.folders = (msg.folders || []).map((folder) => ({
        ...folder,
        dirty: false,
      }));
      state.folderOriginals = clone(msg.folders || []);
      state.folderDirty = false;
      state.selectedFolderPath =
        msg.selectedFolderPath || state.selectedFolderPath;
      state.files = msg.files || [];
      state.originalFiles = clone(state.files);
      state.dirty = false;
      state.dirtyMap = {};
      state.fileDrafts = {
        [state.selectedFolderPath]: clone(state.files),
      };
      state.fileOriginalsByFolder = {
        [state.selectedFolderPath]: clone(state.files),
      };

      renderFolders();
      renderFiles();
      updateDirtyBadge();
    }

    if (msg.type === "folder-data") {
      const folderPath = msg.selectedFolderPath || state.selectedFolderPath;
      const serverFiles = msg.files || [];
      const hasDraft = !!state.dirtyMap[folderPath] && !!state.fileDrafts[folderPath];

      state.selectedFolderPath = folderPath;
      if (!state.fileOriginalsByFolder[folderPath] || !hasDraft) {
        state.fileOriginalsByFolder[folderPath] = clone(serverFiles);
      }
      if (!state.fileDrafts[folderPath] || !hasDraft) {
        state.fileDrafts[folderPath] = clone(serverFiles);
      }
      state.files = clone(
        hasDraft ? state.fileDrafts[folderPath] : serverFiles,
      );
      state.originalFiles = clone(state.fileOriginalsByFolder[folderPath]);

      state.dirty = !!state.dirtyMap[folderPath];

      state.folders = state.folders.map((folder) => ({
        ...folder,
        dirty: !!state.dirtyMap[folder.path],
      }));

      updateDirtyBadge();

      renderFolders();
      renderFiles();
    }

    if (msg.type === "folder-list-data") {
      state.folders = (msg.folders || []).map((f) => ({
        ...f,
        dirty: false,
      }));
      state.folderOriginals = clone(msg.folders || []);
      state.folderDirty = false;

      renderFolders();
      updateDirtyBadge();
    }

    if (msg.type === "saved") {
      state.files = msg.files || [];
      state.originalFiles = clone(state.files);
      state.fileDrafts[state.selectedFolderPath] = clone(state.files);
      state.fileOriginalsByFolder[state.selectedFolderPath] = clone(state.files);
      setDirty(false);
      renderFolders();
      renderFiles();
    }

    if (msg.type === "error") {
      console.error(msg.message || "unknown error");
    }
  });

  $saveBtn.addEventListener("click", () => {
    vscode.postMessage({
      type: "save-order",
      folderPath: state.selectedFolderPath,
      orderedItems: state.files,
      orderChanged: hasFileOrderChanged(),
    });
  });

  $discardBtn.addEventListener("click", () => {
    state.files = clone(state.originalFiles);
    state.fileDrafts[state.selectedFolderPath] = clone(state.originalFiles);
    setDirty(false);
    renderFolders();
    renderFiles();
  });

  $reloadBtn.addEventListener("click", () => {
    state.dirtyMap[state.selectedFolderPath] = false;
    delete state.fileDrafts[state.selectedFolderPath];
    delete state.fileOriginalsByFolder[state.selectedFolderPath];
    vscode.postMessage({
      type: "reload",
      folderPath: state.selectedFolderPath,
    });
  });

  $closeBtn?.addEventListener("click", () => {
    const hasFileDirty = Object.values(state.dirtyMap || {}).some(Boolean);
    const hasFolderDirty = !!state.folderDirty;

    if (!hasFileDirty && !hasFolderDirty) {
      vscode.postMessage({ type: "close" });
      return;
    }

    vscode.postMessage({
      type: "request-close",
      hasFileDirty,
      hasFolderDirty,
    });
  });

  $modeArrowBtn.addEventListener("click", () => {
    state.viewMode = "arrow";
    renderFiles();
  });

  $modeDragBtn.addEventListener("click", () => {
    state.viewMode = "drag";
    renderFiles();
  });

  $saveFolderOrderBtn?.addEventListener("click", () => {
    vscode.postMessage({
      type: "save-folder-order",
      orderedFolders: state.folders,
      selectedFolderPath: state.selectedFolderPath,
      orderChanged: hasFolderOrderChanged(),
    });
  });

  $discardFolderOrderBtn?.addEventListener("click", () => {
    state.folders = clone(state.folderOriginals).map((f) => ({
      ...f,
      dirty: false,
    }));
    state.folderDirty = false;
    renderFolders();
    updateDirtyBadge();
  });

  $reloadFolderListBtn?.addEventListener("click", () => {
    vscode.postMessage({ type: "reload-folder-list" });
  });

  $folderModeArrowBtn?.addEventListener("click", () => {
    state.folderViewMode = "arrow";
    renderFolders();
  });

  $folderModeDragBtn?.addEventListener("click", () => {
    state.folderViewMode = "drag";
    renderFolders();
  });

  setDirty(false);
  state.folderDirty = false;
  renderFolders();
  renderFiles();
  vscode.postMessage({ type: "ready" });
})();
