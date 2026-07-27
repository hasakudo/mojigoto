(() => {
  const DEBUG = false;
  const dlog = (...args) => {
    if (DEBUG) console.log(...args);
  };


  dlog("[Mojigoto reorder] loaded NEW FILE 2026-03-09");

  const vscode = acquireVsCodeApi();
  const boot = window.__Mojigoto_REORDER_BOOT__ || {};
  const state = {
    folders: (boot.folders || []).map((f) => ({
      ...f,
      dirty: false,
    })),
    folderOriginals: JSON.parse(JSON.stringify(boot.folders || [])),
    selectedFolderPath: boot.selectedFolderPath || "",
    files: boot.files || [],
    originalFiles: JSON.parse(JSON.stringify(boot.files || [])),
    dirtyMap: {},
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
  function updateModeUI() {
    $modeArrowBtn.classList.toggle("mode-active", state.viewMode === "arrow");
    $modeDragBtn.classList.toggle("mode-active", state.viewMode === "drag");
    $folderModeArrowBtn?.addEventListener("click", () => {
      state.folderViewMode = "arrow";
      renderFolders();
    });

    $folderModeDragBtn?.addEventListener("click", () => {
      state.folderViewMode = "drag";
      renderFolders();
    });
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

    $dirtyBadge.hidden = !state.dirty;
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
    setDirty(true);

    dlog("[Mojigoto reorder] file move -> dirtyMap", state.dirtyMap);

    renderFiles();
    renderFolders();
  }

  function onFolderDragStart(index, row) {
    const item = state.folders[index];
    if (!item || item.kind !== "folder") return;

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
    if (!target || target.kind !== "folder") return;

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

    if (!fromItem || fromItem.kind !== "folder") return;
    if (!toItem || toItem.kind !== "folder") return;

    moveFolder(from, index);
    state.folderDragIndex = -1;
  }

  function getFirstFolderIndex() {
    return state.folders.findIndex((item) => item && item.kind === "folder");
  }

  function getLastFolderIndex() {
    for (let i = state.folders.length - 1; i >= 0; i--) {
      const item = state.folders[i];
      if (item && item.kind === "folder") return i;
    }
    return -1;
  }

  function moveFolder(from, to) {
    if (to < 0 || to >= state.folders.length || from === to) return;

    const fromItem = state.folders[from];
    const toItem = state.folders[to];

    if (!fromItem || fromItem.kind !== "folder") return;
    if (!toItem || toItem.kind !== "folder") return;

    const copy = [...state.folders];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);

    state.folders = copy;
    state.folderDirty = true;

    console.log(
      "[Mojigoto reorder] folder move -> folderDirty",
      state.folderDirty,
    );

    renderFolders();
  }

  function renderFolders() {
    $folderList.innerHTML = "";

    const movableFolders = state.folders.filter((f) => f.kind === "folder");
    const canReorderFolders = movableFolders.length >= 2;

    updateFolderModeUI();

    state.folders.forEach((folder, index) => {
      const dirtyClass = folder.dirty ? " is-dirty" : "";
      const activeClass =
        folder.path === state.selectedFolderPath ? " is-active" : "";

      const row = document.createElement("div");
      row.className = `folder-item${activeClass}${dirtyClass}`;

      const canMove = canReorderFolders && folder.kind === "folder";

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
          <div class="folder-name">${escapeHtml(folder.cleanName || folder.name)}</div>
          <div class="folder-meta">対象ファイル: ${Number(folder.count || 0)}件</div>
        </div>
      </div>
      ${state.folderViewMode === "arrow" ? actionsHtml : dragNoteHtml}
    `;

      row.querySelector(".folder-main").addEventListener("click", () => {
        vscode.postMessage({ type: "select-folder", folderPath: folder.path });
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
                if (item && item.kind === "folder") {
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
                if (item && item.kind === "folder") {
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

    if ($saveFolderOrderBtn) {
      $saveFolderOrderBtn.hidden = !canReorderFolders;
      $saveFolderOrderBtn.disabled = !state.folderDirty;
    }

    if ($discardFolderOrderBtn) {
      $discardFolderOrderBtn.hidden = !canReorderFolders;
      $discardFolderOrderBtn.disabled = !state.folderDirty;
    }

    if ($reloadFolderListBtn) {
      $reloadFolderListBtn.hidden = !canReorderFolders;
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

    $filePaneTitle.textContent = `${active ? active.cleanName || active.name : "フォルダ"} のファイル`;
    $fileCount.textContent = `全 ${state.files.length} 件`;
    $currentTarget.textContent = `対象: ${active ? active.cleanName || active.name : ""}`;
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

      row.innerHTML = `
      <div class="file-main-wrap">
        ${dragHandle}
        <div class="file-main">
          <div class="file-label">${escapeHtml(file.previewLabel)}</div>
        </div>
      </div>
      ${actionHtml}
    `;

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
  }

  window.addEventListener("message", (event) => {
    const msg = event.data || {};

    if (msg.type === "folder-order-saved") {
      state.folders = (msg.folders || []).map((f) => ({
        ...f,
        dirty: false,
      }));
      state.folderOriginals = clone(msg.folders || []);
      state.folderDirty = false;

      renderFolders();
    }

    if (msg.type === "folder-data") {
      state.selectedFolderPath =
        msg.selectedFolderPath || state.selectedFolderPath;
      state.files = msg.files || [];
      state.originalFiles = clone(state.files);

      state.dirty = !!state.dirtyMap[state.selectedFolderPath];

      state.folders = state.folders.map((folder) => ({
        ...folder,
        dirty: !!state.dirtyMap[folder.path],
      }));

      $dirtyBadge.hidden = !state.dirty;

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
    }

    if (msg.type === "saved") {
      state.files = msg.files || [];
      state.originalFiles = clone(state.files);
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
    });
  });

  $discardBtn.addEventListener("click", () => {
    state.files = clone(state.originalFiles);
    setDirty(false);
    renderFolders();
    renderFiles();
  });

  $reloadBtn.addEventListener("click", () => {
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
    });
  });

  $discardFolderOrderBtn?.addEventListener("click", () => {
    state.folders = clone(state.folderOriginals).map((f) => ({
      ...f,
      dirty: false,
    }));
    state.folderDirty = false;
    renderFolders();
  });

  $reloadFolderListBtn?.addEventListener("click", () => {
    vscode.postMessage({ type: "reload-folder-list" });
  });

  setDirty(false);
  state.folderDirty = false;
  renderFolders();
  renderFiles();
  vscode.postMessage({ type: "ready" });
})();
