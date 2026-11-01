const path = require("path");
const {
  decodeProgressImageDataUrl,
  sanitizeProgressImageFileNamePart,
} = require("../progress/progress-image");

const PROGRESS_IMAGE_SAVE_DIRECTORY_KEY = "mojigoto.progressImageSaveDirectory";

function createDashboardProgressImageActions({
  vscode, context, postToPanel, getCurrentWorkTitleFromSettings, getWorkName,
}) {
  async function saveProgressShareImage(msg) {
    const result = {
      type: "saveProgressShareImage.result",
      ok: false,
      cancelled: false,
      fileName: "",
      error: "",
    };
    try {
      const bytes = decodeProgressImageDataUrl(msg.dataUrl);
      const rawDate = String(msg.date || "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? rawDate.replace(/-/g, "")
        : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const workTitle = msg.titleVisible === false
        ? "作品"
        : sanitizeProgressImageFileNamePart(
          getCurrentWorkTitleFromSettings(context) || getWorkName(context),
          "作品",
        );
      const fileName = `もじごと進捗_${date}_${workTitle}.png`;
      const storedDirectory = String(
        context.globalState.get(PROGRESS_IMAGE_SAVE_DIRECTORY_KEY, "") || "",
      );
      let defaultDirectory = null;
      if (storedDirectory) {
        try {
          defaultDirectory = vscode.Uri.parse(storedDirectory);
        } catch {}
      }
      if (!defaultDirectory) {
        defaultDirectory = vscode.workspace.workspaceFolders?.[0]?.uri || null;
      }
      const defaultUri = defaultDirectory
        ? vscode.Uri.joinPath(defaultDirectory, fileName)
        : undefined;
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { "PNG画像": ["png"] },
        saveLabel: "進捗画像を保存",
        title: "SNS進捗画像を保存",
      });
      if (!saveUri) {
        result.cancelled = true;
        await postToPanel(result);
        return;
      }
      await vscode.workspace.fs.writeFile(saveUri, bytes);
      const parentUri = saveUri.with({
        path: saveUri.path.replace(/\/[^/]*$/, "") || "/",
        query: "",
        fragment: "",
      });
      await context.globalState.update(
        PROGRESS_IMAGE_SAVE_DIRECTORY_KEY,
        parentUri.toString(),
      );
      result.ok = true;
      result.fileName = path.basename(saveUri.fsPath || saveUri.path);
      await postToPanel(result);
      vscode.window.showInformationMessage(
        `もじごと: SNS進捗画像を保存しました（${result.fileName}）`,
      );
    } catch (error) {
      result.error = error?.message || String(error);
      await postToPanel(result);
      vscode.window.showErrorMessage(
        `もじごと: SNS進捗画像を保存できませんでした: ${result.error}`,
      );
    }
  }

  return { saveProgressShareImage };
}

module.exports = { createDashboardProgressImageActions };
