function createAddressBookMessageHandler(environment) {
  const { vscode, fsp, path, panel, session, target, getWorkspaceRoot, safeFileName, buildAddressBookExport } = environment;
  return async (message) => {
    try {
      if (message?.type === "close") {
        panel.dispose();
        return;
      }
      if (await session.handle(message)) return;
      if (message?.type === "exportAddressBook") {
        const format = message.format === "csv" ? "csv" : "html";
        const book = await session.exportBook(message);
        const baseDir = target.workDir || getWorkspaceRoot() || "";
        const uri = await vscode.window.showSaveDialog({
          title: `もじごと: 呼び名一覧を${format.toUpperCase()}で書き出し`,
          defaultUri: baseDir
            ? vscode.Uri.file(path.join(baseDir, `${safeFileName(target.title)}-呼び名一覧.${format}`))
            : undefined,
          filters: format === "csv" ? { CSV: ["csv"] } : { HTML: ["html"] },
        });
        if (!uri) return;
        await fsp.writeFile(uri.fsPath, buildAddressBookExport(book, format, target.title), "utf8");
        panel.webview.postMessage({ type: "addressBookExported", format });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`呼び名一覧: ${error?.message || error}`);
    }
  };
}

module.exports = { createAddressBookMessageHandler };
