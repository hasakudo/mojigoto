function getAddressBookScript() {
  return `
    let workAddressBookState = { characters: [], firstPerson: {}, calls: {}, migratedNoteIds: [] };
    let addressCandidateState = [];
    let addressBookSaveTimer = null;
    let activeAddressTermInput = null;

    function normalizeAddressBookForEditor(value) {
      const seen = new Set();
      const characters = (Array.isArray(value?.characters) ? value.characters : [])
        .map((character) => ({
          noteType: character?.noteType === "plot" ? "plot" : "reference",
          noteId: String(character?.noteId || ""),
          noteFileName: String(character?.noteFileName || ""),
          noteTitle: String(character?.noteTitle || ""),
          groupId: String(character?.groupId || ""),
          groupTitle: String(character?.groupTitle || ""),
          id: String(character?.id || makeId("person")),
          sourceKind: ["group", "divider", "item"].includes(character?.sourceKind)
            ? character.sourceKind
            : "item",
          sourceId: String(character?.sourceId || ""),
          dividerNameSource: character?.dividerNameSource === "label" ? "label" : "value",
          dividerLabel: String(character?.dividerLabel || "").trim(),
          dividerValue: String(character?.dividerValue || "").trim(),
          label: String(character?.label || "").trim(),
        }))
        .filter((character) => {
          if (!character.id || seen.has(character.id)) return false;
          seen.add(character.id);
          return true;
        });
      const normalizeMap = (source) => {
        const result = {};
        if (!source || typeof source !== "object" || Array.isArray(source)) return result;
        Object.entries(source).forEach(([key, text]) => {
          const value = String(text || "").trim();
          if (key && value) result[String(key)] = value;
        });
        return result;
      };
      return {
        characters,
        firstPerson: normalizeMap(value?.firstPerson),
        calls: normalizeMap(value?.calls),
        hiddenTerms: [...new Set((Array.isArray(value?.hiddenTerms) ? value.hiddenTerms : []).map((term) => String(term || "").trim()).filter(Boolean))],
        migratedNoteIds: Array.isArray(value?.migratedNoteIds) ? [...value.migratedNoteIds] : [],
      };
    }

    function ensureAddressBookState() {
      workAddressBookState = normalizeAddressBookForEditor(workAddressBookState);
      return workAddressBookState;
    }

    function getAddressSourceCandidates() {
      return Array.isArray(addressCandidateState) ? addressCandidateState : [];
    }

    function getDividerCandidateLabel(candidate, source) {
      if (candidate?.sourceKind !== "divider") return String(candidate?.label || "").trim();
      const dividerLabel = String(candidate?.dividerLabel || "").trim();
      const dividerValue = String(candidate?.dividerValue || "").trim();
      return source === "label"
        ? dividerLabel || dividerValue
        : dividerValue || dividerLabel;
    }

    function getAddressCharacterLabel(character) {
      const candidate = getAddressSourceCandidates().find((entry) =>
        entry.noteType === character.noteType && entry.noteId === character.noteId &&
        entry.sourceKind === character.sourceKind && entry.sourceId === character.sourceId,
      );
      if (candidate?.sourceKind === "divider") {
        return getDividerCandidateLabel(candidate, character.dividerNameSource) || character.label || "名前未設定";
      }
      return candidate?.label || character.label || "名前未設定";
    }

    function getAddressTermStats() {
      const book = ensureAddressBookState();
      const defaults = ["私", "わたし", "わたくし", "僕", "俺", "自分", "あなた", "君", "お前", "あんた", "貴方", "貴女"];
      const counts = new Map(defaults.map((term) => [term, 0]));
      book.hiddenTerms.forEach((term) => {
        if (!counts.has(term)) counts.set(term, 0);
      });
      [...Object.values(book.firstPerson || {}), ...Object.values(book.calls || {})]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
      return [...counts.entries()]
        .map(([term, count]) => ({ term, count, hidden: book.hiddenTerms.includes(term) }))
        .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term, "ja"));
    }

    function getAddressTerms() {
      return getAddressTermStats().filter((entry) => !entry.hidden).map((entry) => entry.term);
    }

    function renderAddressTermOptions() {
      if (!addressTermManagerList) return;
      const stats = getAddressTermStats();
      const visible = stats.filter((entry) => !entry.hidden);
      const hidden = stats.filter((entry) => entry.hidden);
      const renderTerms = (items, action, label) => items.length
        ? items.map((entry) => '<span class="addressTermChip"><span>' + esc(entry.term) + (entry.count ? " ×" + entry.count : "") + '</span><button type="button" data-address-term-action="' + action + '" data-address-term="' + esc(entry.term) + '">' + label + '</button></span>').join("")
        : '<span class="muted">なし</span>';
      addressTermManagerList.innerHTML = '<div class="addressTermManagerHint">候補を非表示にしても、入力済みのセルは変更されません。</div>'
        + '<div class="addressTermSection"><strong>表示中</strong><div class="addressTermChips">' + renderTerms(visible, "hide", "外す") + '</div></div>'
        + '<div class="addressTermSection"><strong>非表示</strong><div class="addressTermChips">' + renderTerms(hidden, "restore", "戻す") + '</div></div>';
      addressTermManagerList.querySelectorAll("[data-address-term-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const book = ensureAddressBookState();
          const term = String(button.dataset.addressTerm || "").trim();
          if (!term) return;
          if (button.dataset.addressTermAction === "hide") {
            book.hiddenTerms = [...new Set([...book.hiddenTerms, term])];
          } else {
            book.hiddenTerms = book.hiddenTerms.filter((entry) => entry !== term);
          }
          scheduleAddressBookSave();
          renderAddressTermOptions();
          if (activeAddressTermInput) showAddressTermPicker(activeAddressTermInput);
        });
      });
    }

    function closeAddressTermPicker() {
      activeAddressTermInput = null;
      if (addressTermPicker) addressTermPicker.hidden = true;
    }

    function showAddressTermPicker(input) {
      if (!addressTermPicker || !input?.isConnected) return;
      activeAddressTermInput = input;
      const query = String(input.value || "").normalize("NFKC").toLocaleLowerCase();
      const terms = getAddressTerms().filter((term) => !query || term.normalize("NFKC").toLocaleLowerCase().includes(query));
      addressTermPicker.innerHTML = terms.length
        ? terms.map((term) => '<button type="button" data-address-term-pick="' + esc(term) + '">' + esc(term) + '</button>').join("")
        : '<div class="addressTermPickerEmpty">候補がありません</div>';
      const rect = input.getBoundingClientRect();
      const width = Math.max(180, rect.width);
      addressTermPicker.style.left = Math.min(rect.left, window.innerWidth - width - 10) + "px";
      addressTermPicker.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 230)) + "px";
      addressTermPicker.style.width = width + "px";
      addressTermPicker.hidden = false;
      addressTermPicker.querySelectorAll("[data-address-term-pick]").forEach((button) => {
        button.addEventListener("pointerdown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          if (!activeAddressTermInput) return;
          activeAddressTermInput.value = String(button.dataset.addressTermPick || "");
          updateAddressValue(activeAddressTermInput);
          closeAddressTermPicker();
        });
      });
    }

    function renderAddressCandidateOptions() {
      if (!addressCandidateSelect) return;
      const book = ensureAddressBookState();
      const selectedSources = new Set(book.characters.map((character) => character.noteType + ":" + character.noteId + ":" + character.sourceKind + ":" + character.sourceId));
      const previous = String(addressCandidateSelect.value || "");
      const dividerSource = addressDividerNameSource?.value === "label" ? "label" : "value";
      const terms = String(addressCandidateSearch?.value || "").normalize("NFKC").toLocaleLowerCase().split(/\\s+/).filter(Boolean);
      const enabledTypes = new Set([
        addressSourceReference?.checked ? "reference" : "",
        addressSourcePlot?.checked ? "plot" : "",
      ].filter(Boolean));
      const enabledKinds = new Set([
        addressKindGroup?.checked ? "group" : "",
        addressKindDivider?.checked ? "divider" : "",
        addressKindItem?.checked ? "item" : "",
      ].filter(Boolean));
      const candidates = getAddressSourceCandidates().filter((candidate) => {
        if (selectedSources.has(candidate.key)) return false;
        if (!enabledTypes.has(candidate.noteType) || !enabledKinds.has(candidate.sourceKind)) return false;
        const label = getDividerCandidateLabel(candidate, dividerSource);
        const haystack = [label, candidate.label, candidate.dividerLabel, candidate.dividerValue, candidate.noteTitle, candidate.groupTitle, candidate.path]
          .join(" ").normalize("NFKC").toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      addressCandidateSelect.innerHTML = '<option value="">' + (candidates.length ? "名前を選択" : "該当する候補がありません") + '</option>' + candidates
        .map((candidate) => '<option value="' + esc(candidate.key) + '">' + esc(candidate.path + "：" + getDividerCandidateLabel(candidate, dividerSource)) + '</option>')
        .join("");
      addressCandidateSelect.value = candidates.some((candidate) => candidate.key === previous) ? previous : "";
      addressAddBtn.disabled = !addressCandidateSelect.value;
      if (addressCandidateCount) addressCandidateCount.textContent = "候補 " + candidates.length + "件";
    }

    function scheduleAddressBookSave() {
      if (addressBookSaveTimer) clearTimeout(addressBookSaveTimer);
      if (addressStatusEl) addressStatusEl.textContent = "保存待ち";
      addressBookSaveTimer = setTimeout(() => {
        addressBookSaveTimer = null;
        vscode.postMessage({ type: "saveAddressBook", payload: ensureAddressBookState() });
        if (addressStatusEl) addressStatusEl.textContent = "保存中…";
      }, 350);
    }

    function renderAddressVisibilityOptions() {
      if (!addressVisibleOptionsEl) return;
      const book = ensureAddressBookState();
      addressVisibleOptionsEl.innerHTML = book.characters.length
        ? book.characters.map((character) => {
            const checked = addressVisibleIds.has(character.id) ? " checked" : "";
            return '<label><input type="checkbox" data-address-visible-id="' + esc(character.id) + '"' + checked + '> ' + esc(getAddressCharacterLabel(character)) + '</label>';
          }).join("")
        : '<span class="muted">人物がありません</span>';
      addressVisibleOptionsEl.querySelectorAll("[data-address-visible-id]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const id = String(checkbox.dataset.addressVisibleId || "");
          if (checkbox.checked) addressVisibleIds.add(id);
          else addressVisibleIds.delete(id);
          renderAddressMatrix();
        });
      });
    }

    function renderAddressFocusOptions() {
      if (!addressFocusSelect) return;
      const book = ensureAddressBookState();
      const current = String(addressFocusSelect.value || "");
      addressFocusSelect.innerHTML = '<option value="">全員を行に表示</option>' + book.characters
        .map((character) => '<option value="' + esc(character.id) + '">' + esc(getAddressCharacterLabel(character)) + 'だけ</option>')
        .join("");
      addressFocusSelect.value = book.characters.some((character) => character.id === current) ? current : "";
    }

    function updateAddressValue(input) {
      const book = ensureAddressBookState();
      const fromId = String(input.dataset.addressFrom || "");
      const toId = String(input.dataset.addressTo || "");
      const value = String(input.value || "").trim();
      if (!fromId || !toId) return;
      if (fromId === toId) {
        if (value) book.firstPerson[fromId] = value;
        else delete book.firstPerson[fromId];
      } else {
        const key = fromId + "::" + toId;
        if (value) book.calls[key] = value;
        else delete book.calls[key];
      }
      scheduleAddressBookSave();
      renderAddressTermOptions();
    }

    function renderAddressMatrix() {
      if (!addressMatrixRoot) return;
      const book = ensureAddressBookState();
      const allCharacters = book.characters;
      const visible = allCharacters.filter((character) => addressVisibleIds.has(character.id));
      const focusId = String(addressFocusSelect?.value || "");
      const rows = focusId
        ? allCharacters.filter((character) => character.id === focusId)
        : visible;
      const columns = visible;

      if (!allCharacters.length) {
        addressMatrixRoot.innerHTML = '<div class="addressEmpty">「人物を追加」から、作品内のプロット・資料にある大分類・区分・項目を選択してください。</div>';
        return;
      }
      if (!columns.length || !rows.length) {
        addressMatrixRoot.innerHTML = '<div class="addressEmpty">「表示する人物」で1人以上選択してください。</div>';
        return;
      }

      const header = '<tr><th class="addressCorner">呼ぶ人 ＼ 呼ばれる人</th>' + columns
        .map((character) => '<th><div class="addressPersonHead"><span>' + esc(getAddressCharacterLabel(character)) + '</span><button type="button" data-address-remove="' + esc(character.id) + '" title="一覧から外す">×</button></div></th>')
        .join("") + '</tr>';
      const body = rows.map((from) => {
        const cells = columns.map((to) => {
          const diagonal = from.id === to.id;
          const value = diagonal
            ? String(book.firstPerson[from.id] || "")
            : String(book.calls[from.id + "::" + to.id] || "");
          return '<td class="' + (diagonal ? "addressSelfCell" : "") + '"><input type="text" data-address-from="' + esc(from.id) + '" data-address-to="' + esc(to.id) + '" value="' + esc(value) + '" placeholder="' + (diagonal ? "一人称" : "呼び方") + '" title="' + esc(getAddressCharacterLabel(from) + " → " + getAddressCharacterLabel(to)) + '"></td>';
        }).join("");
        return '<tr><th class="addressRowHead">' + esc(getAddressCharacterLabel(from)) + '</th>' + cells + '</tr>';
      }).join("");
      addressMatrixRoot.innerHTML = '<table class="addressMatrix"><thead>' + header + '</thead><tbody>' + body + '</tbody></table>';
      addressMatrixRoot.querySelectorAll("[data-address-from]").forEach((input) => {
        input.addEventListener("focus", () => showAddressTermPicker(input));
        input.addEventListener("input", () => {
          updateAddressValue(input);
          showAddressTermPicker(input);
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Escape") closeAddressTermPicker();
        });
      });
      addressMatrixRoot.querySelectorAll("[data-address-remove]").forEach((button) => {
        button.addEventListener("click", () => removeAddressCharacter(button.dataset.addressRemove));
      });
    }

    function renderAddressBook() {
      const book = ensureAddressBookState();
      const known = new Set(book.characters.map((character) => character.id));
      addressVisibleIds = new Set([...addressVisibleIds].filter((id) => known.has(id)));
      if (!addressVisibleIds.size && book.characters.length) {
        book.characters.forEach((character) => addressVisibleIds.add(character.id));
      }
      renderAddressCandidateOptions();
      renderAddressVisibilityOptions();
      renderAddressFocusOptions();
      renderAddressTermOptions();
      renderAddressMatrix();
      if (addressCountEl) addressCountEl.textContent = "人物 " + book.characters.length + "人";
    }

    function addAddressCharacter() {
      const key = String(addressCandidateSelect?.value || "");
      const candidate = getAddressSourceCandidates().find((entry) => entry.key === key);
      if (!candidate) return;
      const book = ensureAddressBookState();
      const dividerNameSource = addressDividerNameSource?.value === "label" ? "label" : "value";
      const character = {
        ...candidate,
        id: makeId("person"),
        dividerNameSource,
        label: getDividerCandidateLabel(candidate, dividerNameSource),
      };
      book.characters.push(character);
      addressVisibleIds.add(character.id);
      scheduleAddressBookSave();
      renderAddressBook();
    }

    function removeAddressCharacter(characterId) {
      const id = String(characterId || "");
      const book = ensureAddressBookState();
      book.characters = book.characters.filter((character) => character.id !== id);
      delete book.firstPerson[id];
      Object.keys(book.calls).forEach((key) => {
        const [fromId, toId] = key.split("::");
        if (fromId === id || toId === id) delete book.calls[key];
      });
      addressVisibleIds.delete(id);
      scheduleAddressBookSave();
      renderAddressBook();
    }

    function setAddressBookOpen(open) {
      isAddressBookOpen = Boolean(open);
      if (addressBookPanel) addressBookPanel.hidden = !isAddressBookOpen;
      if (!isAddressBookOpen) closeAddressTermPicker();
      if (isAddressBookOpen) {
        if (addressMatrixRoot) addressMatrixRoot.innerHTML = '<div class="addressEmpty">作品内のノートを読み込んでいます…</div>';
        vscode.postMessage({ type: "requestAddressBook" });
      }
    }

    function registerAddressBookEvents() {
      addressAddBtn?.addEventListener("click", addAddressCharacter);
      addressCandidateSelect?.addEventListener("change", () => {
        addressAddBtn.disabled = !addressCandidateSelect.value;
      });
      addressCandidateSearch?.addEventListener("input", renderAddressCandidateOptions);
      [addressSourceReference, addressSourcePlot, addressKindGroup, addressKindDivider, addressKindItem, addressDividerNameSource]
        .forEach((control) => control?.addEventListener("change", renderAddressCandidateOptions));
      closeAddressBookBtn?.addEventListener("click", () => setAddressBookOpen(false));
      addressFocusSelect?.addEventListener("change", renderAddressMatrix);
      addressShowAllBtn?.addEventListener("click", () => {
        ensureAddressBookState().characters.forEach((character) => addressVisibleIds.add(character.id));
        renderAddressBook();
      });
      addressBookPanel?.addEventListener("click", (event) => {
        if (event.target === addressBookPanel) setAddressBookOpen(false);
      });
      addressMatrixRoot?.addEventListener("scroll", closeAddressTermPicker);
      document.addEventListener("pointerdown", (event) => {
        if (!activeAddressTermInput || addressTermPicker?.contains(event.target) || event.target === activeAddressTermInput) return;
        closeAddressTermPicker();
      });
      addressExportHtmlBtn?.addEventListener("click", () => {
        vscode.postMessage({ type: "exportAddressBook", format: "html", payload: ensureAddressBookState() });
      });
      addressExportCsvBtn?.addEventListener("click", () => {
        vscode.postMessage({ type: "exportAddressBook", format: "csv", payload: ensureAddressBookState() });
      });
    }

    function handleAddressBookMessage(msg) {
      if (msg.type === "addressBookLoaded") {
        workAddressBookState = normalizeAddressBookForEditor(msg.book);
        addressCandidateState = Array.isArray(msg.candidates) ? msg.candidates : [];
        addressVisibleIds = new Set(workAddressBookState.characters.map((character) => character.id));
        renderAddressBook();
        if (addressStatusEl) addressStatusEl.textContent = "保存済み";
        return true;
      }
      if (msg.type === "addressBookSaved") {
        workAddressBookState = normalizeAddressBookForEditor(msg.book);
        if (addressStatusEl) addressStatusEl.textContent = "保存済み";
        return true;
      }
      if (msg.type === "addressBookExported") {
        setStatus("呼び名一覧を書き出しました。", true);
        return true;
      }
      return false;
    }
  `;
}

module.exports = {
  getAddressBookScript,
};
