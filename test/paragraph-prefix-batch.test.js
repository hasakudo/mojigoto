const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createHarness(sourceLines, { confirm = () => "付与する", editResult = true } = {}) {
  const lines = [...sourceLines];
  const warnings = [];
  const errors = [];
  const edits = [];
  let receiveMessage;
  let refreshCount = 0;
  const document = {
    uri: { fsPath: path.resolve("manuscript.txt") },
    fileName: "manuscript.txt",
    lineCount: lines.length,
    version: 1,
    lineAt: (index) => ({ text: lines[index] }),
  };
  const editor = {
    document,
    async edit(callback, options) {
      edits.push(options);
      if (!editResult) return false;
      callback({ insert: (position, prefix) => {
        assert.equal(position.character, 0);
        lines[position.line] = prefix + lines[position.line];
      } });
      document.version += 1;
      return true;
    },
  };
  const disposable = () => ({ dispose() {} });
  const vscode = {
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    ViewColumn: { One: 1, Beside: 2 },
    workspace: { onDidChangeConfiguration: disposable },
    window: {
      activeTextEditor: editor,
      visibleTextEditors: [editor],
      onDidChangeActiveTextEditor: disposable,
      onDidChangeVisibleTextEditors: disposable,
      showWarningMessage: async (message, options) => {
        warnings.push(message);
        return options?.modal ? confirm(document, lines) : undefined;
      },
      showErrorMessage: (message) => errors.push(message),
      showInformationMessage() {},
      showTextDocument: async () => editor,
      createWebviewPanel: () => ({
        webview: { onDidReceiveMessage: (handler) => { receiveMessage = handler; } },
        onDidDispose() {},
      }),
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/stats/stats-panel.js"), "utf8"), {
    module, console, process,
    require: (name) => {
      if (name === "./dashboard-stats-correction-actions") return require("../src/stats/dashboard-stats-correction-actions");
      if (name === "./dashboard-progress-image-actions") return require("../src/stats/dashboard-progress-image-actions");
      if (name === "./dashboard-writing-memo-actions") return require("../src/stats/dashboard-writing-memo-actions");
      if (name === "./dashboard-writing-memo-operations") return require("../src/stats/dashboard-writing-memo-operations");
      if (name === "./dashboard-writing-memo-navigation") return require("../src/stats/dashboard-writing-memo-navigation");
      if (name === "./dashboard-memo-actions") return require("../src/stats/dashboard-memo-actions");
      if (name === "./dashboard-highlight-actions") return require("../src/stats/dashboard-highlight-actions");
      if (name === "./dashboard-events") return require("../src/stats/dashboard-events");
      if (name === "./dashboard-settings-actions") return require("../src/stats/dashboard-settings-actions");
      if (name === "vscode") return vscode;
      if (name === "../views/shared/restored-webviews") return require("../src/views/shared/restored-webviews");
      if (name === "fs" || name === "path") return require(name);
      if (name === "./stats-html") return { makeStatsHtml: () => "" };
      if (name === "./stats-utils") return { setStatsRefreshHandler() {} };
      if (name === "../views/shared/webview-panel-icon") return { setWebviewPanelThemeIcon() {} };
      return {};
    },
  });
  const controller = module.exports.createStatsPanelController({
    context: {}, buildStatsState: async () => ({}),
    getHighlightManager: () => ({ refreshEditor: () => { refreshCount += 1; } }),
  });
  controller.open();
  return {
    lines, document, warnings, errors, edits,
    get refreshCount() { return refreshCount; },
    apply: (type, targets, extra = {}) => receiveMessage({
      type, filePath: document.uri.fsPath, targets, ...extra,
    }),
  };
}

const target = (startLine, preview) => ({ startLine, preview });

test("選択した行に全角スペース1文字を付与し、不適格・重複行を除外する", async () => {
  const original = ["本文", "次の段落", "　字下げ済み", " 半角", "\tタブ", "# 見出し", "", "変更後", "未選択"];
  const harness = createHarness(original);
  await harness.apply("applyIndentBatch", [
    ...original.slice(0, 7).map((text, line) => target(line, text)),
    target(0, "本文"), target(7, "変更前"), target(-1, "本文"), target(99, "本文"),
  ]);
  assert.deepEqual(harness.lines, ["　本文", "　次の段落", ...original.slice(2)]);
  assert.equal(harness.edits.length, 1);
  assert.equal(harness.edits[0].undoStopBefore, true);
  assert.equal(harness.edits[0].undoStopAfter, true);
  assert.equal(harness.refreshCount, 1);
  assert.equal(harness.errors.length, 0);
  assert.match(harness.warnings[0], /2行の先頭に全角スペース1文字/);
  // 古い検出結果から再実行しても二重に字下げしない。
  await harness.apply("applyIndentBatch", [target(0, "本文")]);
  assert.equal(harness.edits.length, 1);
});

test("既存の大・中・小見出し付与を維持する", async () => {
  for (const level of [1, 2, 3]) {
    const harness = createHarness(["章題", "## 既存"]);
    await harness.apply("applyHeadingBatch", [target(0, "章題"), target(1, "## 既存")], { level });
    assert.deepEqual(harness.lines, [`${"#".repeat(level)} 章題`, "## 既存"]);
    assert.equal(harness.errors.length, 0);
  }
});

test("キャンセル・対象原稿の不一致・確認中の本文変更では編集しない", async () => {
  for (const type of ["applyIndentBatch", "applyHeadingBatch"]) {
    const cancelled = createHarness(["本文"], { confirm: () => undefined });
    await cancelled.apply(type, [target(0, "本文")]);
    assert.equal(cancelled.edits.length, 0);

    const wrongFile = createHarness(["本文"]);
    await wrongFile.apply(type, [target(0, "本文")], { filePath: path.resolve("other.txt") });
    assert.equal(wrongFile.edits.length, 0);

    const changed = createHarness(["本文"], { confirm: (document, lines) => {
      lines[0] = "変更後";
      document.version += 1;
      return "付与する";
    } });
    await changed.apply(type, [target(0, "本文")]);
    assert.equal(changed.edits.length, 0);
    assert.deepEqual(changed.lines, ["変更後"]);
    assert.match(changed.warnings.at(-1), /確認中に原稿が変更/);
  }
});

test("編集に失敗した場合は成功扱いせず本文を維持する", async () => {
  const harness = createHarness(["本文"], { editResult: false });
  await harness.apply("applyIndentBatch", [target(0, "本文")]);
  assert.deepEqual(harness.lines, ["本文"]);
  assert.equal(harness.refreshCount, 0);
  assert.match(harness.errors[0], /全角スペースを付与できません/);
});
