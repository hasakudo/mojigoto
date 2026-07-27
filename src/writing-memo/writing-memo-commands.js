const vscode = require("vscode");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const { triggerStatsRefresh } = require("../stats/stats-utils");
const {
  triggerWritingMemoDecorationRefresh,
} = require("../editor/writing-memo-decorations");
const {
  listWorkDirectories,
  getWritingMemosPathForWork,
  getWritingMemosPathForSingle,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const { getWorkName } = require("../work/work-settings");
const {
  readWritingMemos,
  writeWritingMemos,
  createWritingMemoDraft,
} = require("../writing-memo/writing-memo-store");

function normalizeExcerpt(text) {
  return String(text || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function resolveWritingMemoTargetForFile(context, filePath) {
  if (!filePath) {
    return {
      relativeFilePath: "",
      writingMemoFilePath: "",
      workDir: "",
      manuscriptRoot: "",
    };
  }

  const configuredManuscriptRoot = String(
    vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ||
      "",
  ).trim();

  // Single
  if (isSingleMode()) {
    if (!configuredManuscriptRoot) {
      return {
        relativeFilePath: "",
        writingMemoFilePath: "",
        workDir: "",
        manuscriptRoot: "",
      };
    }

    const rel = path.relative(configuredManuscriptRoot, filePath);
    if (!rel || rel.startsWith("..")) {
      return {
        relativeFilePath: "",
        writingMemoFilePath: "",
        workDir: "",
        manuscriptRoot: "",
      };
    }

    return {
      relativeFilePath: rel.replace(/\\/g, "/"),
      writingMemoFilePath: getWritingMemosPathForSingle(),
      workDir: "",
      manuscriptRoot: configuredManuscriptRoot,
    };
  }

  // Multi
  const candidates = [];

  // 1. View 側
  if (configuredManuscriptRoot) {
    candidates.push({
      manuscriptRoot: configuredManuscriptRoot,
      writingMemoFilePath: getWritingMemosPathForSingle(), // 仮ではなく後で除外
      workDir: "",
      isView: true,
    });
  }

  // 2. 各作品の manuscript 側
  for (const work of listWorkDirectories()) {
    if (!work?.fsPath) continue;

    const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
    if (!manuscriptRoot) continue;

    candidates.push({
      manuscriptRoot,
      writingMemoFilePath: getWritingMemosPathForWork(work.fsPath),
      workDir: work.fsPath,
      isView: false,
    });
  }

  for (const candidate of candidates) {
    const rel = path.relative(candidate.manuscriptRoot, filePath);
    if (rel && !rel.startsWith("..")) {
      // View 側で開いていた場合でも、保存先は現在作品の writing-memos.json
      if (candidate.isView) {
        const currentWorkName = String(getWorkName(context) || "").trim();
        const currentWork = listWorkDirectories().find(
          (item) => String(item?.name || "") === currentWorkName,
        );
        return {
          relativeFilePath: rel.replace(/\\/g, "/"),
          writingMemoFilePath: currentWork?.fsPath
            ? getWritingMemosPathForWork(currentWork.fsPath)
            : "",
          workDir: currentWork?.fsPath || "",
          manuscriptRoot: candidate.manuscriptRoot,
        };
      }

      return {
        relativeFilePath: rel.replace(/\\/g, "/"),
        writingMemoFilePath: candidate.writingMemoFilePath,
        workDir: candidate.workDir,
        manuscriptRoot: candidate.manuscriptRoot,
      };
    }
  }

  return {
    relativeFilePath: "",
    writingMemoFilePath: "",
    workDir: "",
    manuscriptRoot: "",
  };
}

async function addWritingMemo(context) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "もじごと: 執筆メモを追加するエディタが見つかりません。",
    );
    return;
  }

  const document = editor.document;
  const filePath = document?.uri?.fsPath || "";
  const languageTarget =
    filePath.toLowerCase().endsWith(".txt") ||
    filePath.toLowerCase().endsWith(".md");

  if (!languageTarget) {
    vscode.window.showWarningMessage(
      "もじごと: 執筆メモは .txt / .md の原稿に追加してください。",
    );
    return;
  }

  const selection = editor.selection;
  if (!selection || selection.isEmpty) {
    vscode.window.showWarningMessage(
      "もじごと: 執筆メモを追加する範囲を選択してください。",
    );
    return;
  }

  const target = resolveWritingMemoTargetForFile(context, filePath);
  const relativeFilePath = target.relativeFilePath;
  const writingMemoFilePath = target.writingMemoFilePath;

  if (!relativeFilePath) {
    vscode.window.showWarningMessage(
      "もじごと: 原稿フォルダ配下のファイルで実行してください。",
    );
    return;
  }

  if (!writingMemoFilePath) {
    vscode.window.showWarningMessage(
      "もじごと: 執筆メモの保存先を取得できませんでした。",
    );
    return;
  }

  const selectedText = document.getText(selection);
  const excerpt = normalizeExcerpt(selectedText);

  const body = await vscode.window.showInputBox({
    title: "執筆メモを追加",
    prompt: "この箇所に対する執筆メモを入力",
    placeHolder: "ひと言メモ：ダッシュボードに執筆メモ一覧表示",
    value: "",
    ignoreFocusOut: true,
    validateInput: (value) => {
      return String(value || "").trim() ? null : "メモ本文を入力してください。";
    },
  });

  if (body === undefined) {
    return;
  }

  const trimmedBody = String(body || "").trim();
  if (!trimmedBody) {
    return;
  }

  const data = await readWritingMemos(writingMemoFilePath);
  const currentMemos = Array.isArray(data?.memos) ? data.memos : [];

  const nextMemo = createWritingMemoDraft({
    filePath: relativeFilePath,
    fileName: path.basename(relativeFilePath),
    startLine: selection.start.line,
    startCharacter: selection.start.character,
    endLine: selection.end.line,
    endCharacter: selection.end.character,
    excerpt,
    body: trimmedBody,
    status: "active",
  });

  const nextData = {
    ...data,
    memos: [nextMemo, ...currentMemos],
  };

  await writeWritingMemos(writingMemoFilePath, nextData);
  await triggerStatsRefresh();
  await triggerWritingMemoDecorationRefresh(editor);

  vscode.window.showInformationMessage("もじごと: 執筆メモを追加しました。");
}

function registerWritingMemoCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.addWritingMemo", async () => {
      try {
        await addWritingMemo(context);
      } catch (error) {
        vscode.window.showErrorMessage(
          `もじごと: 執筆メモの追加に失敗しました: ${error.message || String(error)}`,
        );
      }
    }),
  );
}

module.exports = {
  registerWritingMemoCommands,
  addWritingMemo,
};
