function getAddressBookCandidatesScript() {
  return `    function renderAddressTermOptions() {
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
      const margin = 8, gap = 4;
      const width = Math.min(Math.max(0, window.innerWidth - margin * 2), Math.max(180, rect.width));
      addressTermPicker.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width)) + "px";
      addressTermPicker.style.width = width + "px";
      addressTermPicker.style.maxHeight = "220px";
      addressTermPicker.hidden = false;
      const height = Math.min(220, addressTermPicker.getBoundingClientRect().height || 220);
      const below = Math.max(0, window.innerHeight - margin - rect.bottom - gap);
      const above = Math.max(0, rect.top - margin - gap);
      const openBelow = below >= height || below >= above;
      const available = openBelow ? below : above;
      if (available < 32) { closeAddressTermPicker(); return; }
      addressTermPicker.style.maxHeight = Math.min(220, available) + "px";
      addressTermPicker.style.top = (openBelow ? rect.bottom + gap : rect.top - gap - Math.min(height, available)) + "px";
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
`;
}

function getAddressBookVisibilityScript() {
  return `    function renderAddressVisibilityOptions() {
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
`;
}

function getAddressBookMatrixScript() {
  return `    function renderAddressMatrix() {
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
        .map((character) => '<th><div class="addressPersonHead"><span class="addressPersonLabel" title="' + esc(getAddressCharacterLabel(character)) + '">' + esc(getAddressCharacterLabel(character)) + '</span><button type="button" data-address-remove="' + esc(character.id) + '" title="一覧から外す">×</button></div></th>')
        .join("") + '</tr>';
      const body = rows.map((from) => {
        const cells = columns.map((to) => {
          const diagonal = from.id === to.id;
          const value = diagonal
            ? String(book.firstPerson[from.id] || "")
            : String(book.calls[from.id + "::" + to.id] || "");
          return '<td class="' + (diagonal ? "addressSelfCell" : "") + '"><input type="text" data-address-from="' + esc(from.id) + '" data-address-to="' + esc(to.id) + '" value="' + esc(value) + '" placeholder="' + (diagonal ? "一人称" : "呼び方") + '" title="' + esc(getAddressCharacterLabel(from) + " → " + getAddressCharacterLabel(to)) + '"></td>';
        }).join("");
        return '<tr><th class="addressRowHead"><span class="addressPersonLabel" title="' + esc(getAddressCharacterLabel(from)) + '">' + esc(getAddressCharacterLabel(from)) + '</span></th>' + cells + '</tr>';
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

    function renderAddressPreview() {
      if (!addressPreviewRoot) return;
      const book = ensureAddressBookState();
      const characters = book.characters;
      if (!characters.length) {
        addressPreviewRoot.innerHTML = '<div class="addressEmpty">プレビューする人物がまだ登録されていません。</div>';
        return;
      }
      const header = '<tr><th class="addressCorner">呼ぶ人 ＼ 呼ばれる人</th>' + characters
        .map((character) => '<th><span class="addressPersonLabel" title="' + esc(getAddressCharacterLabel(character)) + '">' + esc(getAddressCharacterLabel(character)) + '</span></th>')
        .join("") + '</tr>';
      const body = characters.map((from) => {
        const cells = characters.map((to) => {
          const diagonal = from.id === to.id;
          const value = diagonal
            ? String(book.firstPerson[from.id] || "")
            : String(book.calls[from.id + "::" + to.id] || "");
          const display = value || "—";
          return '<td class="' + (diagonal ? "addressSelfCell" : "") + '" title="' + esc(getAddressCharacterLabel(from) + " → " + getAddressCharacterLabel(to)) + '"><span class="addressPreviewValue' + (value ? "" : " isEmpty") + '">' + esc(display) + '</span></td>';
        }).join("");
        return '<tr><th class="addressRowHead"><span class="addressPersonLabel" title="' + esc(getAddressCharacterLabel(from)) + '">' + esc(getAddressCharacterLabel(from)) + '</span></th>' + cells + '</tr>';
      }).join("");
      addressPreviewRoot.innerHTML = '<table class="addressMatrix addressPreviewMatrix"><thead>' + header + '</thead><tbody>' + body + '</tbody></table>';
    }

    function setAddressPreviewOpen(open) {
      if (!addressPreviewPanel) return;
      addressPreviewPanel.hidden = !open;
      if (open) {
        closeAddressTermPicker();
        renderAddressPreview();
      }
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
      if (addressPreviewPanel && !addressPreviewPanel.hidden) renderAddressPreview();
      if (addressCountEl) addressCountEl.textContent = "人物 " + book.characters.length + "人";
    }
`;
}

module.exports = { getAddressBookCandidatesScript, getAddressBookVisibilityScript, getAddressBookMatrixScript };
