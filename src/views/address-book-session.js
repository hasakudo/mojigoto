const path = require("path");
const store = require("../data/address-book-store");

function createAddressBookSession(panel, workDir, { confirmReload = async () => false } = {}) {
  const source = Symbol("address-book-editor");
  const key = (file) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
  const filePath = store.getAddressBookPath(workDir);
  let disposed = false;
  const post = (message) => {
    if (disposed) return;
    try { Promise.resolve(panel.webview.postMessage(message)).catch(() => {}); } catch {}
  };
  const subscription = store.onWorkAddressBookChanged((event) => {
    if (event.source !== source && key(event.filePath) === key(filePath)) {
      post({ type: "addressBookUpdated", book: event.book });
    }
  });
  const disposable = { dispose() { disposed = true; subscription.dispose(); } };
  panel.onDidDispose(() => disposable.dispose());
  return {
    ...disposable,
    async handle(message) {
      if (!["requestAddressBook", "saveAddressBook"].includes(message?.type)) return false;
      try {
        if (message.type === "requestAddressBook") {
          if (message.dirty && !await confirmReload()) return true;
          const result = await store.loadWorkAddressBook(workDir);
          post({ type: "addressBookLoaded", ...result, requestId: message.requestId });
        } else {
          const book = await store.saveWorkAddressBook(workDir, message.payload || {}, { source });
          post({ type: "addressBookSaved", book, requestId: message.requestId });
        }
      } catch (error) {
        post({ type: "addressBookFailed", requestId: message.requestId, operation: message.type,
          conflict: error.code === "conflict", message: String(error.message || error) });
      }
      return true;
    },
    async exportBook(message) {
      const { book } = await store.loadWorkAddressBook(workDir);
      if (!message.payload?.storageRevision || book.storageRevision !== message.payload.storageRevision) {
        throw new Error("呼び名一覧が更新されています。最新の内容を読み直してから書き出してください。");
      }
      return book;
    },
  };
}

module.exports = { createAddressBookSession };
