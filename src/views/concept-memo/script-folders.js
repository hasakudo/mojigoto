function getConceptMemoFoldersScript() {
  return `
    function getMemoFolders() {
      const folders = Array.isArray(currentState?.data?.folders)
        ? currentState.data.folders
        : [];
      return [...folders].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
    }

    function getMemoFolderName(folderId) {
      const id = String(folderId || "");
      if (!id) return "";
      return getMemoFolders().find((folder) => folder.id === id)?.name || "";
    }

    function getMemoFolderNames(memo) {
      return normalizeMemoFolderIds(memo)
        .map((folderId) => getMemoFolderName(folderId))
        .filter(Boolean);
    }

    function isProtectedMemoFolder(folderId) {
      return folderId === "writing" || folderId === "note-item";
    }

    function getMemoFolderCounts() {
      const memos = Array.isArray(currentState?.data?.memos)
        ? currentState.data.memos
        : [];
      const byFolder = new Map(getMemoFolders().map((folder) => [folder.id, 0]));
      let unclassified = 0;

      memos.forEach((memo) => {
        const folderIds = normalizeMemoFolderIds(memo);
        if (!folderIds.length) {
          unclassified += 1;
          return;
        }
        folderIds.forEach((folderId) => {
          if (byFolder.has(folderId)) {
            byFolder.set(folderId, byFolder.get(folderId) + 1);
          }
        });
      });

      return {
        total: memos.length,
        unclassified,
        byFolder,
      };
    }

    function ensureVisibleMemoSelection() {
      const visible = getFilteredMemos();
      if (!visible.some((memo) => memo.id === selectedMemoId)) {
        selectedMemoId = visible[0]?.id || "";
      }
    }

    function toggleActiveMemoFolder(folderId) {
      const value = String(folderId ?? "__all__");
      if (value === "__all__") {
        activeFolderIds = [];
      } else {
        activeFolderIds = activeFolderIds.includes(value)
          ? activeFolderIds.filter((id) => id !== value)
          : [...activeFolderIds, value];
      }
      ensureVisibleMemoSelection();
      renderAll();
    }

    function createMemoFolder(name) {
      const trimmed = String(name || "").trim().slice(0, 40);
      if (!trimmed) return;
      if (getMemoFolders().some((folder) => folder.name === trimmed)) {
        showToast("同じ名前のフォルダがあります。");
        return;
      }

      const folders = getMemoFolders();
      folders.push({
        id: "folder_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
        name: trimmed,
        order: folders.length,
      });
      currentState.data.folders = folders;
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderAll();
    }

    function renameMemoFolder(folderId, name) {
      const trimmed = String(name || "").trim().slice(0, 40);
      if (!folderId || !trimmed) {
        renderMemoFolders();
        return;
      }
      const folder = currentState.data.folders.find((item) => item.id === folderId);
      if (!folder || folder.name === trimmed) return;
      folder.name = trimmed;
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderAll();
    }

    function moveMemoFolder(folderId, direction) {
      const folders = getMemoFolders();
      const index = folders.findIndex((folder) => folder.id === folderId);
      const targetIndex = index + Number(direction || 0);
      if (index < 0 || targetIndex < 0 || targetIndex >= folders.length) return;

      const [folder] = folders.splice(index, 1);
      folders.splice(targetIndex, 0, folder);
      folders.forEach((item, itemIndex) => { item.order = itemIndex; });
      currentState.data.folders = folders;
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      renderAll();
    }

    function deleteMemoFolder(folderId) {
      if (!folderId) return;
      if (isProtectedMemoFolder(folderId)) {
        showToast("自動仕分け先のフォルダは削除できません。名前は変更できます。");
        return;
      }
      currentState.data.folders = getMemoFolders().filter((folder) => folder.id !== folderId);
      currentState.data.folders.forEach((folder, index) => { folder.order = index; });
      currentState.data.memos = currentState.data.memos.map((memo) => {
        const folderIds = normalizeMemoFolderIds(memo).filter((id) => id !== folderId);
        return {
          ...memo,
          folderIds,
          folderId: folderIds[0] || "",
        };
      });
      activeFolderIds = activeFolderIds.filter((id) => id !== folderId);
      currentState.data.updatedAt = new Date().toISOString();
      setDirty(true);
      ensureVisibleMemoSelection();
      renderAll();
    }

    function createFolderFilterButton(value, label, count) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folderChip";
      button.dataset.folderFilter = value;
      const labelElement = document.createElement("span");
      labelElement.className = "folderChipLabel";
      labelElement.textContent = label;
      const countElement = document.createElement("span");
      countElement.className = "folderChipCount";
      countElement.textContent = String(Number(count || 0));
      button.append(labelElement, countElement);
      button.title = label + "（" + countElement.textContent + "件）";
      button.classList.toggle(
        "isActive",
        value === "__all__" ? activeFolderIds.length === 0 : activeFolderIds.includes(value),
      );
      return button;
    }

    function getFolderFilterRowCount(quickList) {
      if (!quickList) return 0;
      const tops = [];
      [...quickList.children].forEach((child) => {
        const top = Math.round(child.offsetTop);
        if (!tops.some((value) => Math.abs(value - top) <= 2)) tops.push(top);
      });
      return tops.length;
    }

    function updateFolderFilterLayout() {
      const quickList = document.getElementById("folderQuickList");
      const overflow = document.getElementById("folderOverflowMenu");
      if (!quickList || !overflow) return;

      const wasHidden = quickList.hidden;
      if (wasHidden) {
        quickList.hidden = false;
        quickList.classList.add("isMeasuring");
      }
      const useSelect = getFolderFilterRowCount(quickList) > 2;
      quickList.classList.remove("isMeasuring");
      quickList.hidden = useSelect;
      overflow.hidden = !useSelect;
    }

    function scheduleFolderFilterLayout() {
      requestAnimationFrame(() => updateFolderFilterLayout());
    }

    function renderMemoFolders() {
      const quickList = document.getElementById("folderQuickList");
      const overflow = document.getElementById("folderOverflowMenu");
      const overflowLabel = document.getElementById("folderOverflowLabel");
      const overflowOptions = document.getElementById("folderOverflowOptions");
      const manager = document.getElementById("folderManager");
      const managerList = document.getElementById("folderManagerList");
      const manageButton = document.getElementById("toggleFolderManagerButton");
      const editorOptions = document.getElementById("memoFolderOptions");
      const folders = getMemoFolders();
      const folderCounts = getMemoFolderCounts();

      const validFolderIds = new Set(folders.map((folder) => folder.id));
      activeFolderIds = [...new Set(activeFolderIds)].filter(
        (folderId) => folderId === "" || validFolderIds.has(folderId),
      );

      if (quickList) {
        quickList.innerHTML = "";
        quickList.hidden = false;
        quickList.appendChild(
          createFolderFilterButton("__all__", "すべて", folderCounts.total),
        );
        folders.forEach((folder) => {
          quickList.appendChild(
            createFolderFilterButton(
              folder.id,
              folder.name,
              folderCounts.byFolder.get(folder.id) || 0,
            ),
          );
        });
        quickList.appendChild(
          createFolderFilterButton("", "未分類", folderCounts.unclassified),
        );
      }

      if (overflow && overflowOptions && overflowLabel) {
        overflow.hidden = true;
        const selectedLabels = activeFolderIds.map((folderId) =>
          folderId === "" ? "未分類" : getMemoFolderName(folderId),
        ).filter(Boolean);
        overflowLabel.textContent = selectedLabels.length === 0
          ? "すべて"
          : selectedLabels.length === 1
            ? selectedLabels[0]
            : selectedLabels.length + "件選択";
        overflowOptions.innerHTML =
          '<button type="button" class="folderOverflowClear" data-folder-filter-clear>すべて解除</button>' +
          folders.map((folder) =>
            '<label class="folderOverflowOption">' +
              '<input type="checkbox" value="' + escapeHtml(folder.id) + '"' +
              (activeFolderIds.includes(folder.id) ? ' checked' : '') + ' />' +
              '<span>' + escapeHtml(folder.name) + '</span>' +
              '<span class="folderOverflowCount">' +
                String(folderCounts.byFolder.get(folder.id) || 0) +
              '</span>' +
            '</label>',
          ).join("") +
          '<label class="folderOverflowOption">' +
            '<input type="checkbox" value=""' +
            (activeFolderIds.includes("") ? ' checked' : '') + ' />' +
            '<span>未分類</span>' +
            '<span class="folderOverflowCount">' + String(folderCounts.unclassified) + '</span>' +
          '</label>';
      }

      scheduleFolderFilterLayout();

      if (manager) manager.hidden = !isFolderManagerOpen;
      if (manageButton) {
        manageButton.textContent = isFolderManagerOpen ? "閉じる" : "管理";
        manageButton.classList.toggle("isActive", isFolderManagerOpen);
      }

      if (managerList) {
        managerList.innerHTML = folders.length
          ? folders.map((folder, index) =>
              '<div class="folderManagerRow">' +
                '<input class="input folderNameInput" type="text" maxlength="40" data-folder-rename="' + escapeHtml(folder.id) + '" value="' + escapeHtml(folder.name) + '" />' +
                '<button class="button secondary folderMoveButton" type="button" data-folder-move="-1" data-folder-id="' + escapeHtml(folder.id) + '" title="上へ移動"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                '<button class="button secondary folderMoveButton" type="button" data-folder-move="1" data-folder-id="' + escapeHtml(folder.id) + '" title="下へ移動"' + (index === folders.length - 1 ? ' disabled' : '') + '>↓</button>' +
                (isProtectedMemoFolder(folder.id)
                  ? '<span class="folderProtectedMark" title="自動仕分け先のため削除できません">自動</span>'
                  : '<button class="button secondary folderDeleteButton" type="button" data-folder-delete="' + escapeHtml(folder.id) + '" title="フォルダを削除（メモは未分類へ移動）">×</button>') +
              '</div>',
            ).join("")
          : '<div class="muted folderManagerEmpty">フォルダはまだありません。</div>';
      }

      if (editorOptions) {
        const memo = getSelectedMemo();
        const selected = new Set(normalizeMemoFolderIds(memo));
        editorOptions.innerHTML = folders.length
          ? folders.map((folder) =>
              '<label class="memoFolderOption">' +
                '<input type="checkbox" value="' + escapeHtml(folder.id) + '"' +
                (selected.has(folder.id) ? ' checked' : '') +
                (memo ? '' : ' disabled') + ' />' +
                '<span>' + escapeHtml(folder.name) + '</span>' +
              '</label>',
            ).join("")
          : '<span class="muted">フォルダはまだありません。</span>';
      }

      const folderValue = document.getElementById("memoFolderMenuValue");
      const selectedMemo = getSelectedMemo();
      if (folderValue) {
        const names = getMemoFolderNames(selectedMemo);
        folderValue.textContent = names.length ? names.join("、") : "未分類";
      }
    }

    function bindMemoFolderActions() {
      document.getElementById("folderQuickList")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-folder-filter]");
        if (!button) return;
        toggleActiveMemoFolder(button.dataset.folderFilter ?? "__all__");
      });

      document.getElementById("folderOverflowOptions")?.addEventListener("change", (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        toggleActiveMemoFolder(String(input.value ?? ""));
        requestAnimationFrame(() => {
          const menu = document.getElementById("folderOverflowMenu");
          if (menu) menu.open = true;
        });
      });

      document.getElementById("folderOverflowOptions")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-folder-filter-clear]");
        if (!button) return;
        activeFolderIds = [];
        ensureVisibleMemoSelection();
        renderAll();
      });

      const folderBox = document.querySelector(".memoFolderBox");
      if (typeof ResizeObserver === "function" && folderBox) {
        const observer = new ResizeObserver(() => scheduleFolderFilterLayout());
        observer.observe(folderBox);
      } else {
        window.addEventListener("resize", scheduleFolderFilterLayout);
      }

      document.getElementById("toggleFolderManagerButton")?.addEventListener("click", () => {
        isFolderManagerOpen = !isFolderManagerOpen;
        renderAll();
        if (isFolderManagerOpen) {
          requestAnimationFrame(() => document.getElementById("newFolderNameInput")?.focus());
        }
      });

      const addFolder = () => {
        const input = document.getElementById("newFolderNameInput");
        if (!input) return;
        const name = input.value;
        input.value = "";
        createMemoFolder(name);
      };

      document.getElementById("addFolderButton")?.addEventListener("click", addFolder);
      document.getElementById("newFolderNameInput")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addFolder();
        }
      });

      document.getElementById("folderManagerList")?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-folder-rename]");
        if (input) renameMemoFolder(input.dataset.folderRename || "", input.value);
      });

      document.getElementById("folderManagerList")?.addEventListener("click", (event) => {
        const moveButton = event.target.closest("[data-folder-move]");
        if (moveButton) {
          moveMemoFolder(
            moveButton.dataset.folderId || "",
            Number(moveButton.dataset.folderMove || 0),
          );
          return;
        }

        const button = event.target.closest("[data-folder-delete]");
        if (button) deleteMemoFolder(button.dataset.folderDelete || "");
      });

      document.getElementById("memoFolderOptions")?.addEventListener("change", () => {
        const folderIds = [...document.querySelectorAll('#memoFolderOptions input[type="checkbox"]:checked')]
          .map((input) => String(input.value || ""))
          .filter(Boolean);
        updateSelectedMemo({ folderIds, folderId: folderIds[0] || "" });
        renderAll();
      });
    }
  `;
}

module.exports = {
  getConceptMemoFoldersScript,
};
