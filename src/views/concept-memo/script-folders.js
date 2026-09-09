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
        const folderId = String(memo?.folderId || "");
        if (!folderId) {
          unclassified += 1;
          return;
        }
        if (byFolder.has(folderId)) {
          byFolder.set(folderId, byFolder.get(folderId) + 1);
        }
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

    function setActiveMemoFolder(folderId) {
      activeFolderId = String(folderId ?? "__all__");
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
      currentState.data.memos = currentState.data.memos.map((memo) =>
        memo.folderId === folderId ? { ...memo, folderId: "" } : memo,
      );
      if (activeFolderId === folderId) activeFolderId = "__all__";
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
      button.classList.toggle("isActive", activeFolderId === value);
      return button;
    }

    function renderMemoFolders() {
      const quickList = document.getElementById("folderQuickList");
      const overflow = document.getElementById("folderOverflowSelect");
      const manager = document.getElementById("folderManager");
      const managerList = document.getElementById("folderManagerList");
      const manageButton = document.getElementById("toggleFolderManagerButton");
      const editorSelect = document.getElementById("memoFolderSelect");
      const folders = getMemoFolders();
      const folderCounts = getMemoFolderCounts();

      if (
        activeFolderId !== "__all__" &&
        activeFolderId !== "" &&
        !folders.some((folder) => folder.id === activeFolderId)
      ) {
        activeFolderId = "__all__";
      }

      if (quickList) {
        quickList.innerHTML = "";
        quickList.appendChild(
          createFolderFilterButton("__all__", "すべて", folderCounts.total),
        );
        folders.slice(0, 3).forEach((folder) => {
          quickList.appendChild(
            createFolderFilterButton(
              folder.id,
              folder.name,
              folderCounts.byFolder.get(folder.id) || 0,
            ),
          );
        });
        if (folders.length <= 3) {
          quickList.appendChild(
            createFolderFilterButton("", "未分類", folderCounts.unclassified),
          );
        }
      }

      if (overflow) {
        const extraFolders = folders.slice(3);
        overflow.hidden = extraFolders.length === 0;
        overflow.innerHTML = '<option value="__more__">その他のフォルダ…</option>' +
          extraFolders.map((folder) =>
            '<option value="' + escapeHtml(folder.id) + '"' +
            (activeFolderId === folder.id ? ' selected' : '') + '>' +
            escapeHtml(folder.name) + '（' +
            String(folderCounts.byFolder.get(folder.id) || 0) + '）</option>',
          ).join("") +
          '<option value=""' + (activeFolderId === "" ? ' selected' : '') +
          '>未分類（' + String(folderCounts.unclassified) + '）</option>';
      }

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

      if (editorSelect) {
        const memo = getSelectedMemo();
        editorSelect.innerHTML = folders.map((folder) =>
            '<option value="' + escapeHtml(folder.id) + '">' + escapeHtml(folder.name) + '</option>',
          ).join("") + '<option value="">未分類</option>';
        editorSelect.value = String(memo?.folderId || "");
        editorSelect.disabled = !memo;
      }

      const folderValue = document.getElementById("memoFolderMenuValue");
      const selectedMemo = getSelectedMemo();
      if (folderValue) {
        folderValue.textContent = getMemoFolderName(selectedMemo?.folderId || "") || "未分類";
      }
    }

    function bindMemoFolderActions() {
      document.getElementById("folderQuickList")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-folder-filter]");
        if (!button) return;
        setActiveMemoFolder(button.dataset.folderFilter ?? "__all__");
      });

      document.getElementById("folderOverflowSelect")?.addEventListener("change", (event) => {
        const folderId = String(event.target.value ?? "__more__");
        if (folderId !== "__more__") setActiveMemoFolder(folderId);
      });

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

      document.getElementById("memoFolderSelect")?.addEventListener("change", (event) => {
        updateSelectedMemo({ folderId: String(event.target.value || "") });
        renderAll();
      });
    }
  `;
}

module.exports = {
  getConceptMemoFoldersScript,
};
