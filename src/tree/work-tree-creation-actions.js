const path = require("path");

// Creation dialogs and sequencing; command registration remains in the tree host.
function createWorkTreeCreationActions({ vscode, fs, context, treeProvider, isSingleMode,
  getWorkRoot, getPreferredManuscriptDirName, openSettingsWebview }) {
  function applyDefaultExtension(fileName) {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
  
    const defaultExtension = String(
      cfg.get("defaultFileExtension", ".txt") || ".txt",
    );
  
    const name = String(fileName || "").trim();
    if (!name) return "";
  
    const extension = path.extname(name).toLowerCase();
    if (extension === ".txt" || extension === ".md") {
      return name;
    }
  
    return name + defaultExtension;
  }
  
  
  async function createManuscriptFile(targetDir) {
    const name = await vscode.window.showInputBox({
      title: "新規原稿ファイル",
      prompt: "ファイル名を入力してください",
      placeHolder: "例: 第1話",
      ignoreFocusOut: true,
    });
  
    if (!name) return;
  
    const fileName = applyDefaultExtension(name);
    const fullPath = path.join(targetDir, fileName);
  
    try {
      await fs.access(fullPath);
      vscode.window.showWarningMessage(
        `もじごと: 同名ファイルがすでに存在します: ${fileName}`,
      );
      return;
    } catch {
      // 存在しなければ作成続行
    }
  
    await fs.writeFile(fullPath, "", "utf8");
  
    const uri = vscode.Uri.file(fullPath);
    await vscode.commands.executeCommand("vscode.open", uri);
  
    vscode.window.showInformationMessage(`原稿を作成しました: ${fileName}`);
  }
  
  async function createManuscriptFolder(targetDir) {
    const name = await vscode.window.showInputBox({
      title: "新規章フォルダ",
      prompt: "フォルダ名を入力してください",
      ignoreFocusOut: true,
    });
  
    if (!name) return;
  
    const dirPath = path.join(targetDir, name.trim());
  
    await fs.mkdir(dirPath, { recursive: true });
  
    vscode.window.showInformationMessage(`フォルダを作成しました: ${name}`);
  }
  
  
  async function treeCreateWork() {
    if (isSingleMode()) {
      vscode.window.showWarningMessage(
        "もじごと: single モードでは新規作品作成は使いません。",
      );
      return;
    }

    const workRoot = getWorkRoot();
    if (!workRoot) {
      vscode.window.showWarningMessage("もじごと: workRoot が未設定です。");
      return;
    }

    const workName = await vscode.window.showInputBox({
      title: "もじごと: 新規作品",
      prompt: "作品フォルダ名を入力してください",
      ignoreFocusOut: true,
    });
    if (!workName) return;

    const workDir = path.join(workRoot, workName);
    const manuscriptDir = path.join(workDir, getPreferredManuscriptDirName());
    const vpDir = path.join(workDir, ".mojigoto");

    try {
      let workAlreadyExists = false;
      try {
        await fs.access(workDir);
        workAlreadyExists = true;
      } catch {
        workAlreadyExists = false;
      }
      if (workAlreadyExists) {
        vscode.window.showWarningMessage(
          `もじごと: 同名の作品フォルダ「${workName}」が既に存在するため、作成を中止しました。`,
        );
        return;
      }

      await fs.mkdir(manuscriptDir, { recursive: true });
      await fs.mkdir(path.join(vpDir, "plots"), { recursive: true });
      await fs.mkdir(path.join(vpDir, "references"), { recursive: true });

      const workJson = path.join(vpDir, "work.json");
      const payload = {
        schemaVersion: 1,
        folderName: workName,
        title: workName,
        subtitle: "",
        genre: "",
        genres: [],
        status: "planning",
        targetChars: 0,
        deadline: "",
        summary: "",
      };
      await fs.writeFile(workJson, JSON.stringify(payload, null, 2), "utf8");

      treeProvider.refresh();

      const createdWorkItem = {
        kind: "work",
        fsPath: workDir,
        workDir,
        workName,
      };

      const copyChoice = await vscode.window.showInformationMessage(
        `もじごと: 作品「${workName}」を作成しました。ほかの作品から作品設定・プロット・資料をコピーしますか？`,
        "他作品からコピー",
        "コピーせず続ける",
      );
      if (copyChoice === "他作品からコピー") {
        await vscode.commands.executeCommand(
          "mojigoto.copyFromOtherWork",
          createdWorkItem,
        );
      }

      await openSettingsWebview(context, treeProvider, createdWorkItem);

      if (copyChoice !== "他作品からコピー") {
        vscode.window.showInformationMessage(
          `もじごと: 作品「${workName}」を作成しました。`,
        );
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 新規作品の作成に失敗しました: ${String(e)}`,
      );
    }
  }

  async function createManuscriptFileFromTree(item) {
    await createManuscriptFile(item.fsPath);
    treeProvider.refresh();
  }

  async function createManuscriptFolderFromTree(item) {
    await createManuscriptFolder(item.fsPath);
    treeProvider.refresh();
  }

  return { treeCreateWork, createManuscriptFileFromTree, createManuscriptFolderFromTree };
}

module.exports = { createWorkTreeCreationActions };
