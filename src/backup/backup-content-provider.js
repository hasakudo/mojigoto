const vscode = require("vscode");

const BACKUP_CONTENT_SCHEME = "mojigoto-backup";
const backupContents = new Map();
let sequence = 0;
let registered = false;

function registerBackupContentProvider(extensionContext) {
  if (registered) return;
  registered = true;
  const provider = {
    provideTextDocumentContent(uri) {
      return backupContents.get(uri.toString()) || "";
    },
  };
  extensionContext.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BACKUP_CONTENT_SCHEME, provider),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document?.uri?.scheme === BACKUP_CONTENT_SCHEME) backupContents.delete(document.uri.toString());
    }),
  );
}

function createBackupContentUri(content, fileName = "backup.txt") {
  sequence += 1;
  const safeName = String(fileName || "backup.txt").replace(/[^\p{L}\p{N}._-]+/gu, "_");
  const uri = vscode.Uri.from({
    scheme: BACKUP_CONTENT_SCHEME,
    path: `/${Date.now()}-${sequence}/${safeName}`,
  });
  backupContents.set(uri.toString(), String(content || ""));
  return uri;
}

function releaseBackupContentUri(uri) {
  if (uri) backupContents.delete(uri.toString());
}

module.exports = {
  BACKUP_CONTENT_SCHEME,
  registerBackupContentProvider,
  createBackupContentUri,
  releaseBackupContentUri,
};
