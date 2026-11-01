function getAddressBookCellActionsScript() {
  return `    function updateAddressValue(input) {
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
`;
}

function getAddressBookEventsScript(standalone) {
  return `    function addAddressCharacter() {
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
      if (!isAddressBookOpen) setAddressPreviewOpen(false);
      if (!isAddressBookOpen) flushAddressBookSave();
      if (isAddressBookOpen) {
        if (!addressBookDirty() && !addressBookSaveInFlight) requestAddressBookLoad();
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
      closeAddressBookBtn?.addEventListener("click", () => {
        if (${standalone}) requestAddressBookAction({ type: "close" });
        else setAddressBookOpen(false);
      });
      document.getElementById("addressOpenTabBtn")?.addEventListener("click", () => requestAddressBookAction({ type: "openAddressBookTab" }));
      document.getElementById("addressReloadBtn")?.addEventListener("click", requestAddressBookLoad);
      window.addEventListener("beforeunload", flushAddressBookSave);
      addressPreviewBtn?.addEventListener("click", () => setAddressPreviewOpen(true));
      closeAddressPreviewBtn?.addEventListener("click", () => setAddressPreviewOpen(false));
      addressPreviewPanel?.addEventListener("click", (event) => {
        if (event.target === addressPreviewPanel) setAddressPreviewOpen(false);
      });
      addressFocusSelect?.addEventListener("change", renderAddressMatrix);
      addressShowAllBtn?.addEventListener("click", () => {
        ensureAddressBookState().characters.forEach((character) => addressVisibleIds.add(character.id));
        renderAddressBook();
      });
      addressBookPanel?.addEventListener("click", (event) => {
        if (${!standalone} && event.target === addressBookPanel) setAddressBookOpen(false);
      });
      addressMatrixRoot?.addEventListener("scroll", closeAddressTermPicker);
      document.addEventListener("pointerdown", (event) => {
        if (!activeAddressTermInput || addressTermPicker?.contains(event.target) || event.target === activeAddressTermInput) return;
        closeAddressTermPicker();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && addressPreviewPanel && !addressPreviewPanel.hidden) {
          setAddressPreviewOpen(false);
        }
      });
      addressExportHtmlBtn?.addEventListener("click", () => {
        requestAddressBookAction({ type: "exportAddressBook", format: "html" });
      });
      addressExportCsvBtn?.addEventListener("click", () => {
        requestAddressBookAction({ type: "exportAddressBook", format: "csv" });
      });
    }
`;
}

module.exports = { getAddressBookCellActionsScript, getAddressBookEventsScript };
