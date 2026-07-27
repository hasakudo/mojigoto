const vscode = require("vscode");
const { readHighlightGroups } = require("./highlight-core");

function getHighlightGroupsDefaultValue() {
  return [
    {
      name: "weakWords",
      label: "頻出語",
      enabled: true,
      words: ["こと", "もの"],
      style: {
        backgroundColor: "rgba(255,220,120,.35)",
      },
    },
    {
      name: "demonstratives",
      label: "指示語（こそあど）",
      enabled: true,
      words: ["この", "その", "あの", "どの"],
      style: {
        backgroundColor: "rgba(255,180,120,.35)",
      },
    },
    {
      name: "conjunction",
      label: "接続詞",
      enabled: true,
      words: ["しかし", "そして", "だが"],
      style: {
        backgroundColor: "rgba(120,200,255,.35)",
      },
    },
    {
      name: "kinsokuHead",
      label: "行頭禁則",
      enabled: true,
      regex: "^[、。，．）」』]",
      style: {
        backgroundColor: "rgba(255,80,80,.25)",
      },
    },
    {
      name: "kinsokuTail",
      label: "行末禁則",
      enabled: true,
      regex: "[（「『]$",
      style: {
        backgroundColor: "rgba(255,80,80,.25)",
      },
    },
    {
      name: "ellipsisError",
      label: "三点リーダー崩れ",
      enabled: true,
      type: "lineRule",
      rule: "oddEllipsis",
      style: {
        backgroundColor: "rgba(255,120,120,.30)",
      },
    },
    {
      name: "dashError",
      label: "ダッシュ崩れ",
      enabled: true,
      type: "lineRule",
      rule: "oddDash",
      style: {
        backgroundColor: "rgba(255,120,120,.30)",
      },
    },
    {
      name: "trailingSpace",
      label: "行末スペース",
      enabled: true,
      regex: "[ 　]+$",
      style: {
        backgroundColor: "rgba(255,120,120,.20)",
      },
    },
    {
      name: "paragraphIndentMissing",
      label: "段落先頭スペースなし",
      enabled: true,
      type: "lineRule",
      rule: "missingIndent",
      excludeStartsWith: ["#", "「", "『", "（"],
      style: {
        backgroundColor: "rgba(255,120,120,.20)",
        border: "1px solid rgba(255,120,120,.45)",
      },
    },
    {
      name: "missingPeriod",
      label: "行末「。」なし",
      enabled: true,
      type: "lineRule",
      rule: "missingPeriod",
      excludeStartsWith: ["#", "「", "『", "（"],
      excludeEndsWith: ["―", "…", "？", "！"],
      style: {
        backgroundColor: "rgba(255,150,150,.22)",
        border: "1px solid rgba(255,120,120,.35)",
      },
    },
    {
      name: "doublePeriod",
      label: "連続。。",
      enabled: true,
      regex: "。{2,}",
      style: {
        backgroundColor: "rgba(255,140,140,.30)",
      },
    },
    {
      name: "doubleComma",
      label: "連続、、",
      enabled: true,
      regex: "、{2,}",
      style: {
        backgroundColor: "rgba(255,140,140,.30)",
      },
    },
    {
      name: "Markers",
      label: "記号",
      enabled: true,
      countable: false,
      regex: "[｜|《》]",
      style: {
        color: "rgba(153, 137, 137, 0.85)",
        fontWeight: "bold",
      },
    },
    {
      name: "heading",
      label: "見出し",
      enabled: false,
      countable: false,
      regex: "[#]",
      style: {
        color: "rgba(218, 191, 191, 0.85)",
        fontWeight: "bold",
      },
    },
    {
      name: "halfPunctuation",
      label: "半角!?",
      enabled: false,
      regex: "[!?]",
      style: {
        backgroundColor: "rgba(255,180,120,.25)",
      },
    },
    {
      name: "punctuationMixedWidth",
      label: "!?全半角混在",
      enabled: false,
      regex: "(?:[!?][！？]|[！？][!?])+",
      style: {
        backgroundColor: "rgba(255,140,120,.28)",
      },
    },
    {
      name: "multiPunctuation",
      label: "連続！？",
      enabled: false,
      regex: "[!?！？]{2,}",
      style: {
        backgroundColor: "rgba(255,160,120,.25)",
      },
    },
  ];
}

async function ensureWorkspaceHighlightGroupsSetting() {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showWarningMessage(
      "もじごと: ワークスペースが開かれていません。",
    );
    return null;
  }

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const inspected = cfg.inspect("highlightGroups");

  if (inspected?.workspaceValue === undefined) {
    await cfg.update(
      "highlightGroups",
      getHighlightGroupsDefaultValue(),
      vscode.ConfigurationTarget.Workspace,
    );
  }

  const settingsUri = vscode.Uri.joinPath(wf.uri, ".vscode", "settings.json");

  try {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(wf.uri, ".vscode"),
    );
  } catch {}

  try {
    await vscode.workspace.fs.stat(settingsUri);
  } catch {
    await vscode.workspace.fs.writeFile(
      settingsUri,
      Buffer.from("{\n}\n", "utf8"),
    );
  }

  const doc = await vscode.workspace.openTextDocument(settingsUri);
  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });

  return doc;
}

function getPreferredHighlightEditor() {
  const active = vscode.window.activeTextEditor;
  if (active) return active;

  const visible = vscode.window.visibleTextEditors || [];
  for (const editor of visible) {
    const fsPath = String(editor?.document?.uri?.fsPath || "").toLowerCase();
    if (fsPath.endsWith(".txt") || fsPath.endsWith(".md")) {
      return editor;
    }
  }

  return null;
}

async function toggleHighlightsEnabled(deps = {}) {
  const { highlightManager } = deps;
  if (!highlightManager) return false;

  const enabled = highlightManager.toggleEnabled();

  return enabled;
}

function registerHighlightCommands(context, deps = {}) {
  const { highlightManager } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.refreshHighlights", () => {
      if (!highlightManager) return;
      highlightManager.refreshActiveEditor();
      vscode.window.showInformationMessage(highlightManager.getSummaryText());
    }),

    vscode.commands.registerCommand("mojigoto.toggleHighlights", async () => {
      await toggleHighlightsEnabled({ highlightManager });
    }),

    vscode.commands.registerCommand(
      "mojigoto.openHighlightSettings",
      async () => {
        const doc = await ensureWorkspaceHighlightGroupsSetting();
        if (!doc) return;

        vscode.window.showInformationMessage(
          "もじごと: ワークスペースの settings.json を開きました。mojigoto.highlightGroups の編集が可能です。",
        );
      },
    ),
  );
}

function registerHighlightPanelSync(context, deps = {}) {
  const {
    highlightManager,
    refreshStatsPanel = () => {},
    getContext = () => null,
  } = deps;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || !highlightManager) return;
      highlightManager.scheduleRefresh(editor);
      setTimeout(() => {
        const ctx = getContext();
        if (ctx) refreshStatsPanel(ctx, highlightManager);
      }, 150);
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (!active || !highlightManager) return;
      if (event.document !== active.document) return;

      highlightManager.scheduleRefresh(active);
      setTimeout(() => {
        const ctx = getContext();
        if (ctx) refreshStatsPanel(ctx, highlightManager);
      }, 150);
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      const active = vscode.window.activeTextEditor;
      if (!active || !highlightManager) return;
      if (doc !== active.document) return;

      highlightManager.scheduleRefresh(active);
      setTimeout(() => {
        const ctx = getContext();
        if (ctx) refreshStatsPanel(ctx, highlightManager);
      }, 150);
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("mojigoto.highlightGroups") ||
        e.affectsConfiguration("mojigoto.highlightsEnabled") ||
        e.affectsConfiguration("mojigoto.highlightDecorationsEnabled")
      ) {
        if (highlightManager) {
          const editor = getPreferredHighlightEditor();
          if (editor) {
            highlightManager.refreshEditor(editor);
          } else {
            highlightManager.clearAllEditors();
          }
        }

        const ctx = getContext();
        if (ctx) refreshStatsPanel(ctx, highlightManager);
      }
    }),
  );
}

async function applyHighlightGroupEnabled(name, enabled, deps = {}) {
  const { highlightManager } = deps;

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const groups = readHighlightGroups();

  const next = groups.map((g) => {
    if (g.name === name) {
      return { ...g, enabled: !!enabled };
    }
    return g;
  });

  await cfg.update(
    "highlightGroups",
    next,
    vscode.ConfigurationTarget.Workspace,
  );

  const editor = getPreferredHighlightEditor();
  if (editor && highlightManager) {
    highlightManager.refreshEditor(editor);
  } else if (highlightManager) {
    highlightManager.refreshActiveEditor();
  }
}

module.exports = {
  getHighlightGroupsDefaultValue,
  ensureWorkspaceHighlightGroupsSetting,
  getPreferredHighlightEditor,
  registerHighlightCommands,
  registerHighlightPanelSync,
  applyHighlightGroupEnabled,
  toggleHighlightsEnabled,
};
