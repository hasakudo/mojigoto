const vscode = require("vscode");
const path = require("path");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  getWritingMemosPathForSingle,
  getWritingMemosPathForWork,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const { getWorkName } = require("../work/work-settings");
const { readWritingMemos } = require("../writing-memo/writing-memo-store");
const {
  isSameWritingMemoFilePath,
} = require("../writing-memo/writing-memo-resolver");

let _refreshWritingMemoDecorations = null;

function escapeMarkdownText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, "  \n");
}

function createWritingMemoHoverMessage(memo, target) {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = true;

  const body = String(memo?.body || "").trim();
  const label =
    String(memo?.status || "active") === "hold"
      ? "保留の執筆メモ"
      : "未処理の執筆メモ";

  md.appendMarkdown(`${escapeMarkdownText(body || label)}\n\n`);

  const args = encodeURIComponent(
    JSON.stringify([
      {
        memoId: String(memo?.id || ""),
        filePath: String(memo?.filePath || target?.relativeFilePath || ""),
        absoluteFilePath: String(target?.absoluteFilePath || ""),
        writingMemoFilePath: String(target?.writingMemoFilePath || ""),
        excerpt: String(memo?.excerpt || ""),
        startLine: Number(memo?.startLine || 0),
        startCharacter: Number(memo?.startCharacter || 0),
        endLine: Number(memo?.endLine || 0),
        endCharacter: Number(memo?.endCharacter || 0),
      },
    ]),
  );

  md.appendMarkdown(
    `[執筆メモを開く](command:mojigoto.openWritingMemoFromHover?${args})`,
  );

  return md;
}

function findWritingMemoRangeByExcerpt(document, memo) {
  const excerpt = String(memo?.excerpt || "").trim();
  if (!document || !excerpt) return null;

  const fullText = document.getText();

  const storedLine = Math.max(0, Number(memo?.startLine || 0));
  const storedCharacter = Math.max(0, Number(memo?.startCharacter || 0));

  let storedOffset = 0;
  try {
    storedOffset = document.offsetAt(
      new vscode.Position(storedLine, storedCharacter),
    );
  } catch {
    storedOffset = 0;
  }

  const indexes = [];
  let from = 0;

  while (from <= fullText.length) {
    const index = fullText.indexOf(excerpt, from);
    if (index < 0) break;

    indexes.push(index);
    from = index + Math.max(1, excerpt.length);
  }

  if (!indexes.length) return null;

  const bestIndex = indexes.sort(
    (a, b) => Math.abs(a - storedOffset) - Math.abs(b - storedOffset),
  )[0];

  const start = document.positionAt(bestIndex);
  const end = document.positionAt(bestIndex + excerpt.length);

  return new vscode.Range(start, end);
}

function makeWritingMemoRange(document, memo) {
  const byExcerpt = findWritingMemoRangeByExcerpt(document, memo);
  if (byExcerpt) return byExcerpt;

  const start = new vscode.Position(
    Math.max(0, Number(memo?.startLine || 0)),
    Math.max(0, Number(memo?.startCharacter || 0)),
  );

  const end = new vscode.Position(
    Math.max(0, Number(memo?.endLine || memo?.startLine || 0)),
    Math.max(0, Number(memo?.endCharacter || memo?.startCharacter || 0)),
  );

  return new vscode.Range(start, end);
}

function setWritingMemoDecorationRefreshHandler(fn) {
  _refreshWritingMemoDecorations = typeof fn === "function" ? fn : null;
}

async function triggerWritingMemoDecorationRefresh(editor) {
  if (typeof _refreshWritingMemoDecorations !== "function") {
    return false;
  }

  if (editor) {
    await _refreshWritingMemoDecorations(editor);
    return true;
  }

  const editors = vscode.window.visibleTextEditors || [];
  for (const visibleEditor of editors) {
    await _refreshWritingMemoDecorations(visibleEditor);
  }
  return true;
}

function createWritingMemoDecorationController(context) {
  const activeDecorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: "underline dotted 1.5px",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  const holdDecorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: "underline dotted 1.5px",
    opacity: "0.85",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  function resolveWritingMemoTargetForEditor(context, editor) {
    const fsPath = editor?.document?.uri?.fsPath || "";
    if (!fsPath) {
      return {
        relativeFilePath: "",
        writingMemoFilePath: "",
        absoluteFilePath: "",
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
          absoluteFilePath: "",
        };
      }

      const rel = path.relative(configuredManuscriptRoot, fsPath);
      if (!rel || rel.startsWith("..")) {
        return {
          relativeFilePath: "",
          writingMemoFilePath: "",
          absoluteFilePath: "",
        };
      }

      return {
        relativeFilePath: rel.replace(/\\/g, "/"),
        writingMemoFilePath: getWritingMemosPathForSingle(),
        absoluteFilePath: fsPath,
      };
    }

    const candidates = [];

    if (configuredManuscriptRoot) {
      candidates.push({
        manuscriptRoot: configuredManuscriptRoot,
        writingMemoFilePath: "",
        isView: true,
        workDir: "",
      });
    }

    for (const work of listWorkDirectories()) {
      if (!work?.fsPath) continue;

      const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);
      if (!manuscriptRoot) continue;

      candidates.push({
        manuscriptRoot,
        writingMemoFilePath: getWritingMemosPathForWork(work.fsPath),
        isView: false,
        workDir: work.fsPath,
      });
    }

    for (const candidate of candidates) {
      const rel = path.relative(candidate.manuscriptRoot, fsPath);
      if (rel && !rel.startsWith("..")) {
        const relativeFilePath = rel.replace(/\\/g, "/");

        if (candidate.isView) {
          const currentWorkName = String(getWorkName(context) || "").trim();
          const currentWork = listWorkDirectories().find(
            (item) => String(item?.name || "") === currentWorkName,
          );

          return {
            relativeFilePath,
            writingMemoFilePath: currentWork?.fsPath
              ? getWritingMemosPathForWork(currentWork.fsPath)
              : "",
            absoluteFilePath: fsPath,
          };
        }

        return {
          relativeFilePath,
          writingMemoFilePath: candidate.writingMemoFilePath,
          absoluteFilePath: fsPath,
        };
      }
    }

    return {
      relativeFilePath: "",
      writingMemoFilePath: "",
      absoluteFilePath: "",
    };
  }

  function clearWritingMemoDecorations(
    editor = vscode.window.activeTextEditor,
  ) {
    if (!editor) return;
    editor.setDecorations(activeDecorationType, []);
    editor.setDecorations(holdDecorationType, []);
  }

  async function refreshWritingMemoDecorations(
    editor = vscode.window.activeTextEditor,
  ) {
    if (!editor) return;

    const enabled = vscode.workspace
      .getConfiguration("mojigoto")
      .get("writingMemoDecorationsEnabled", true);

    if (!enabled) {
      clearWritingMemoDecorations(editor);
      return;
    }

    const doc = editor.document;
    const filePath = doc?.uri?.fsPath || "";
    if (
      !filePath ||
      (!filePath.endsWith(".txt") && !filePath.endsWith(".md"))
    ) {
      clearWritingMemoDecorations(editor);
      return;
    }

    const target = resolveWritingMemoTargetForEditor(context, editor);
    if (!target.relativeFilePath || !target.writingMemoFilePath) {
      clearWritingMemoDecorations(editor);
      return;
    }

    try {
      const data = await readWritingMemos(target.writingMemoFilePath);
      const memos = Array.isArray(data?.memos) ? data.memos : [];

      const visible = memos.filter((memo) => {
        const status = String(memo?.status || "active");
        return (
          !memo?.isArchived &&
          (status === "active" || status === "hold") &&
          isSameWritingMemoFilePath(
            memo?.filePath || "",
            target.relativeFilePath,
          )
        );
      });

      const activeRanges = [];
      const holdRanges = [];

      for (const memo of visible) {
        const range = makeWritingMemoRange(doc, memo);

        const hoverMessage = createWritingMemoHoverMessage(memo, target);

        if (String(memo?.status || "active") === "hold") {
          holdRanges.push({
            range,
            hoverMessage,
          });
        } else {
          activeRanges.push({
            range,
            hoverMessage,
          });
        }
      }

      editor.setDecorations(activeDecorationType, activeRanges);
      editor.setDecorations(holdDecorationType, holdRanges);
    } catch {
      clearWritingMemoDecorations(editor);
    }
  }

  const changeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      refreshWritingMemoDecorations(editor);
    },
  );

  const changeDocumentDisposable = vscode.workspace.onDidOpenTextDocument(
    (doc) => {
      const editor = vscode.window.visibleTextEditors.find(
        (item) => item.document.uri.toString() === doc.uri.toString(),
      );
      if (editor) {
        refreshWritingMemoDecorations(editor);
      }
    },
  );

  const saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
    const editor = vscode.window.visibleTextEditors.find(
      (item) => item.document.uri.toString() === doc.uri.toString(),
    );
    if (editor) {
      refreshWritingMemoDecorations(editor);
    }
  });

  const visibleEditorsDisposable = vscode.window.onDidChangeVisibleTextEditors(
    (editors) => {
      for (const editor of editors) {
        refreshWritingMemoDecorations(editor);
      }
    },
  );

  function dispose() {
    clearWritingMemoDecorations();
    activeDecorationType.dispose();
    holdDecorationType.dispose();
    changeEditorDisposable.dispose();
    changeDocumentDisposable.dispose();
    saveDisposable.dispose();
    visibleEditorsDisposable.dispose();
  }

  setWritingMemoDecorationRefreshHandler(refreshWritingMemoDecorations);

  return {
    refreshWritingMemoDecorations,
    clearWritingMemoDecorations,
    dispose,
  };
}

module.exports = {
  createWritingMemoDecorationController,
  setWritingMemoDecorationRefreshHandler,
  triggerWritingMemoDecorationRefresh,
};
