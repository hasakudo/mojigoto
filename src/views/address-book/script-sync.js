function getAddressBookSaveScript() {
  return `    function addressBookDirty() { return addressBookEditVersion !== addressBookSavedVersion; }
    function setAddressBookStatus(text) { if (addressStatusEl) addressStatusEl.textContent = text; }
    function requestAddressBookLoad() {
      addressBookLoadRequest = { id: "load-" + (++addressBookLoadSerial), version: addressBookEditVersion };
      vscode.postMessage({ type: "requestAddressBook", requestId: addressBookLoadRequest.id, dirty: addressBookDirty() });
    }
    function finishAddressBookAction() {
      if (!addressBookPendingAction || addressBookDirty() || addressBookSaveInFlight || addressBookSaveBlocked) return;
      const message = addressBookPendingAction;
      addressBookPendingAction = null;
      vscode.postMessage({ ...message, payload: ensureAddressBookState() });
    }
    function flushAddressBookSave() {
      if (addressBookSaveTimer) clearTimeout(addressBookSaveTimer);
      addressBookSaveTimer = null;
      if (!addressBookLoaded || addressBookSaveInFlight || addressBookSaveBlocked) return;
      if (!addressBookDirty()) { finishAddressBookAction(); return; }
      addressBookSaveInFlight = { version: addressBookEditVersion };
      vscode.postMessage({ type: "saveAddressBook", requestId: addressBookEditVersion, payload: ensureAddressBookState() });
      setAddressBookStatus("保存中…");
    }
    function requestAddressBookAction(message) {
      if (message.type === "close" && !addressBookDirty() && !addressBookSaveInFlight) {
        vscode.postMessage(message);
        return;
      }
      addressBookPendingAction = message;
      flushAddressBookSave();
    }
`;
}

function getAddressBookSaveTimerScript() {
  return `    function scheduleAddressBookSave() {
      addressBookEditVersion += 1;
      if (addressBookSaveTimer) clearTimeout(addressBookSaveTimer);
      if (addressBookSaveBlocked) { setAddressBookStatus("未保存の入力を保持中。コピーしてから「最新を読み直す」を押してください。"); return; }
      if (addressStatusEl) addressStatusEl.textContent = "保存待ち";
      addressBookSaveTimer = setTimeout(flushAddressBookSave, 350);
    }
`;
}

function getAddressBookMessageScript() {
  return `    function handleAddressBookMessage(msg) {
      if (msg.type === "addressBookTabOpened") { setAddressBookOpen(false); return true; }
      if (msg.type === "addressBookRefreshRequested") {
        if (addressBookLoaded && !addressBookDirty() && !addressBookSaveInFlight) requestAddressBookLoad();
        return true;
      }
      if (msg.type === "addressBookUpdated") {
        if (!addressBookLoaded) return true;
        if (addressBookDirty() || addressBookSaveInFlight) {
          setAddressBookStatus("他の画面で更新されました。未保存の入力は保持しています。");
        } else {
          addressBookEditVersion += 1;
          addressBookSavedVersion = addressBookEditVersion;
          const previousIds = new Set(workAddressBookState.characters.map((person) => person.id));
          workAddressBookState = normalizeAddressBookForEditor(msg.book);
          workAddressBookState.characters.forEach((person) => { if (!previousIds.has(person.id)) addressVisibleIds.add(person.id); });
          renderAddressBook();
          setAddressBookStatus("他の画面の更新を反映しました");
        }
        return true;
      }
      if (msg.type === "addressBookLoaded") {
        if (!addressBookLoadRequest || msg.requestId !== addressBookLoadRequest.id) return true;
        if (addressBookLoadRequest.version !== addressBookEditVersion || addressBookSaveInFlight) {
          setAddressBookStatus("編集中の入力を保持しました。読み直す場合は再度ボタンを押してください。");
          return true;
        }
        if (addressBookSaveTimer) clearTimeout(addressBookSaveTimer);
        addressBookSaveTimer = null;
        const firstLoad = !addressBookLoaded;
        addressBookLoaded = true;
        addressBookSaveBlocked = false;
        addressBookSavedVersion = addressBookEditVersion;
        if (!firstLoad) addressBookPendingAction = null;
        workAddressBookState = normalizeAddressBookForEditor(msg.book);
        addressCandidateState = Array.isArray(msg.candidates) ? msg.candidates : [];
        addressVisibleIds = new Set(workAddressBookState.characters.map((character) => character.id));
        renderAddressBook();
        if (addressStatusEl) addressStatusEl.textContent = "保存済み";
        finishAddressBookAction();
        return true;
      }
      if (msg.type === "addressBookSaved") {
        if (!addressBookSaveInFlight || msg.requestId !== addressBookSaveInFlight.version) return true;
        addressBookSavedVersion = addressBookSaveInFlight.version;
        addressBookSaveInFlight = null;
        workAddressBookState.storageRevision = msg.book.storageRevision;
        setAddressBookStatus(addressBookDirty() ? "保存待ち" : "保存済み");
        flushAddressBookSave();
        return true;
      }
      if (msg.type === "addressBookFailed") {
        if (msg.operation === "saveAddressBook" && addressBookSaveInFlight?.version === msg.requestId) {
          addressBookSaveInFlight = null;
          addressBookSaveBlocked = true;
          addressBookPendingAction = null;
        }
        setAddressBookStatus("保存・読込を完了できませんでした。入力は保持しています。" + (msg.conflict ? " コピーしてから「最新を読み直す」を押してください。" : " " + msg.message));
        return true;
      }
      if (msg.type === "addressBookExported") {
        setStatus("呼び名一覧を書き出しました。", true);
        return true;
      }
      return false;
    }`;
}

module.exports = { getAddressBookSaveScript, getAddressBookSaveTimerScript, getAddressBookMessageScript };
