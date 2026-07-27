const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const IGNORED_KEY = "mojigoto.encodingWarning.ignoredFiles.v2";
const LAST_PROMPT_KEY = "mojigoto.encodingWarning.lastPromptByFile.v2";
const PROMPT_DEBOUNCE_MS = 30000;

function isTargetTextDocument(document) {
  if (!document || document.isUntitled) return false;
  if (document.uri?.scheme !== "file") return false;

  const ext = path.extname(document.uri.fsPath || "").toLowerCase();
  return ext === ".txt" || ext === ".md";
}

function isValidUtf8(buffer) {
  let i = 0;

  while (i < buffer.length) {
    const b1 = buffer[i];

    if (b1 <= 0x7f) {
      i += 1;
      continue;
    }

    let needed = 0;
    let minCodePoint = 0;
    let codePoint = 0;

    if (b1 >= 0xc2 && b1 <= 0xdf) {
      needed = 1;
      minCodePoint = 0x80;
      codePoint = b1 & 0x1f;
    } else if (b1 >= 0xe0 && b1 <= 0xef) {
      needed = 2;
      minCodePoint = 0x800;
      codePoint = b1 & 0x0f;
    } else if (b1 >= 0xf0 && b1 <= 0xf4) {
      needed = 3;
      minCodePoint = 0x10000;
      codePoint = b1 & 0x07;
    } else {
      return false;
    }

    if (i + needed >= buffer.length) return false;

    for (let j = 1; j <= needed; j += 1) {
      const bx = buffer[i + j];
      if ((bx & 0xc0) !== 0x80) return false;
      codePoint = (codePoint << 6) | (bx & 0x3f);
    }

    if (codePoint < minCodePoint) return false;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
    if (codePoint > 0x10ffff) return false;

    i += needed + 1;
  }

  return true;
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function getAutoGuessEncodingEnabled() {
  return Boolean(vscode.workspace.getConfiguration("files").get("autoGuessEncoding"));
}

function rememberIgnoredFile(context, document) {
  const ignored = new Set(context.workspaceState.get(IGNORED_KEY, []));
  ignored.add(document.uri.fsPath);
  return context.workspaceState.update(IGNORED_KEY, Array.from(ignored).slice(-300));
}

function getLatestDocumentForUri(document) {
  const uriString = document?.uri?.toString();
  if (!uriString) return document;

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument?.uri?.toString() === uriString) {
    return activeDocument;
  }

  const visibleDocument = vscode.window.visibleTextEditors
    .map((editor) => editor.document)
    .find((candidate) => candidate?.uri?.toString() === uriString);
  if (visibleDocument) return visibleDocument;

  const workspaceDocument = vscode.workspace.textDocuments
    .find((candidate) => candidate?.uri?.toString() === uriString);
  return workspaceDocument || document;
}

async function runCommandSilently(command) {
  try {
    await vscode.commands.executeCommand(command);
    return true;
  } catch {
    // VS Code 側の状態やバージョン差で失敗しても、案内自体は壊さない。
    return false;
  }
}

async function runCommand(command) {
  try {
    await vscode.commands.executeCommand(command);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasReplacementCharacter(document) {
  return document.getText().includes("\uFFFD");
}

function getReadableState(document) {
  return hasReplacementCharacter(document) ? "broken" : "readable";
}

function getPromptSignature(document, kind) {
  // 同じファイルでも、Shift JIS として開き直した後は document の見え方が変わる。
  // その場合は再通知して「UTF-8で保存」を出したいので、文字化け状態も署名に含める。
  return `${kind}:${getReadableState(document)}`;
}

function shouldSkipRecentPrompt(lastPromptByFile, filePath, signature, now, force) {
  if (force) return false;

  const entry = lastPromptByFile[filePath];
  if (!entry) return false;

  // 旧形式（数値）で保存済みの状態も一応扱う。旧形式は署名が分からないので、
  // 文字化け解消後の再通知を妨げないよう、強い抑制には使わない。
  if (typeof entry === "number") {
    return now - entry < 3000;
  }

  const lastTime = Number(entry.time || 0);
  if (!lastTime) return false;

  return entry.signature === signature && now - lastTime < PROMPT_DEBOUNCE_MS;
}

async function rememberPrompt(context, filePath, signature, now) {
  const lastPromptByFile = context.workspaceState.get(LAST_PROMPT_KEY, {});
  lastPromptByFile[filePath] = { time: now, signature };
  await context.workspaceState.update(LAST_PROMPT_KEY, lastPromptByFile);
}

async function openEncodingSavePicker(document) {
  const latestDocument = getLatestDocumentForUri(document);

  try {
    await vscode.window.showTextDocument(latestDocument, { preview: false });
    await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  } catch {
    // 表示に失敗しても、現在のエディタで VS Code 標準のエンコード保存を開く。
  }

  // 通知を閉じた直後はフォーカスが通知側に残ることがあるため、
  // すぐに changeEncoding を呼ぶと Quick Pick が開かない環境がある。
  // まず「エンコード付きで保存」専用コマンドを試し、なければ従来の
  // エンコード変更メニューへフォールバックする。
  await sleep(120);

  const saveWithEncodingResult = await runCommand("workbench.action.files.saveWithEncoding");
  if (saveWithEncodingResult.ok) {
    return;
  }

  const changeEncodingResult = await runCommand("workbench.action.editor.changeEncoding");
  if (changeEncodingResult.ok) {
    return;
  }

  const detail = changeEncodingResult.error?.message || saveWithEncodingResult.error?.message || "VS Code のエンコード選択コマンドを実行できませんでした。";
  await vscode.window.showWarningMessage(
    `もじごと: エンコード選択を自動で開けませんでした。右下のエンコード名をクリックして「エンコード付きで保存」→「UTF-8」を選んでください。${detail ? ` (${detail})` : ""}`,
  );
}

async function writeCurrentTextAsUtf8(document) {
  const text = document.getText();
  await vscode.workspace.fs.writeFile(document.uri, Buffer.from(text, "utf8"));
}

async function removeBomAndSaveAsUtf8(document) {
  const filePath = document.uri.fsPath;
  const buffer = fs.readFileSync(filePath);

  if (hasUtf8Bom(buffer)) {
    await vscode.workspace.fs.writeFile(document.uri, buffer.subarray(3));
    return;
  }

  await writeCurrentTextAsUtf8(document);
}

async function saveAsUtf8(context, document, kind) {
  const latestDocument = getLatestDocumentForUri(document);

  try {
    if (kind === "bom") {
      await removeBomAndSaveAsUtf8(latestDocument);
      vscode.window.showInformationMessage("もじごと: UTF-8 で保存し直しました。");
      return;
    }

    if (hasReplacementCharacter(latestDocument)) {
      await vscode.window.showWarningMessage(
        "もじごと: 画面上に文字化けが残っている可能性があります。先に「エンコードを指定して開く」で読める状態にしてから、UTF-8で保存してください。",
        "エンコードを指定して開く",
      ).then(async (picked) => {
        if (picked === "エンコードを指定して開く") {
          await runCommandSilently("workbench.action.editor.changeEncoding");
        }
      });
      return;
    }

    // Shift JIS など UTF-8 以外として開かれている文書は、拡張側でファイルだけを
    // UTF-8 に書き換えると、VS Code の現在のエディタモデルが Shift JIS のまま残り、
    // 保存直後の表示だけ文字化けして見える場合がある。
    // ここは VS Code 標準の「エンコード付きで保存」を使わせる方が安全。
    await openEncodingSavePicker(latestDocument);
  } catch (error) {
    const detail = error?.message ? ` ${error.message}` : "";
    vscode.window.showWarningMessage(`もじごと: UTF-8 保存の案内を開けませんでした。${detail}`);
  }
}

async function showEncodingWarning(context, document, kind, options = {}) {
  const autoGuessEncoding = getAutoGuessEncodingEnabled();

  if (kind === "bom") {
    const picked = await vscode.window.showWarningMessage(
      "もじごと: この原稿は UTF-8 with BOM の可能性があります。文字化けはしませんが、縦書きプレビューの見出し変換などに影響する場合があります。UTF-8で保存し直すことをおすすめします。",
      "UTF-8で保存",
      "このファイルは表示しない",
    );

    if (picked === "UTF-8で保存") {
      await saveAsUtf8(context, document, kind);
      return;
    }

    if (picked === "このファイルは表示しない") {
      await rememberIgnoredFile(context, document);
    }

    return;
  }

  const looksBroken = hasReplacementCharacter(document);
  const canRecommendSave = autoGuessEncoding || !looksBroken;
  const message = canRecommendSave
    ? "もじごと: この原稿は Shift JIS など、UTF-8 以外の可能性があります。画面上で文字化けしていなければ、VS Code の「エンコード付きで保存」から UTF-8 で保存し直すことをおすすめします。"
    : "もじごと: この原稿は Shift JIS など、UTF-8 以外の可能性があります。文字化けしている場合は、先にエンコードを指定して開き直してください。";

  const actions = canRecommendSave
    ? ["UTF-8で保存", "エンコードを指定して開く", "このファイルは表示しない"]
    : ["エンコードを指定して開く", "このファイルは表示しない"];

  const picked = await vscode.window.showWarningMessage(message, ...actions);

  if (picked === "UTF-8で保存") {
    await saveAsUtf8(context, document, kind);
    return;
  }

  if (picked === "エンコードを指定して開く") {
    const executed = await runCommandSilently("workbench.action.editor.changeEncoding");
    if (executed && typeof options.requestRecheck === "function") {
      setTimeout(() => {
        const latestDocument = getLatestDocumentForUri(document);
        options.requestRecheck(latestDocument);
      }, 1200);
    }
    return;
  }

  if (picked === "このファイルは表示しない") {
    await rememberIgnoredFile(context, document);
  }
}

async function checkDocumentEncoding(context, document, options = {}) {
  if (!isTargetTextDocument(document)) return;

  const ignored = new Set(context.workspaceState.get(IGNORED_KEY, []));
  const filePath = document.uri.fsPath;
  if (ignored.has(filePath)) return;

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return;
  }

  if (!buffer || !buffer.length) return;

  const kind = hasUtf8Bom(buffer) ? "bom" : (!isValidUtf8(buffer) ? "nonUtf8" : "");
  if (!kind) return;

  const now = Date.now();
  const signature = getPromptSignature(document, kind);
  const lastPromptByFile = context.workspaceState.get(LAST_PROMPT_KEY, {});

  if (shouldSkipRecentPrompt(lastPromptByFile, filePath, signature, now, Boolean(options.force))) {
    return;
  }

  await rememberPrompt(context, filePath, signature, now);
  await showEncodingWarning(context, document, kind, {
    requestRecheck: (targetDocument) => {
      checkDocumentEncoding(context, targetDocument, { force: true }).catch(() => {});
    },
  });
}

function registerEncodingWarning(context) {
  const run = (document, options = {}) => {
    checkDocumentEncoding(context, document, options).catch(() => {});
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(run),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event?.document) run(event.document);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document) run(editor.document);
    }),
  );

  if (vscode.window.activeTextEditor?.document) {
    run(vscode.window.activeTextEditor.document);
  }
}

module.exports = {
  registerEncodingWarning,
  isValidUtf8,
};
