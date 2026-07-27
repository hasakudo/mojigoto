const vscode = require("vscode");
const {
  isTargetDocument,
  readHighlightGroups,
  makeDecorationOptions,
  collectHighlightMatches,
} = require("./highlight-core");

function readHighlightsEnabled() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  return cfg.get("highlightsEnabled", true) !== false;
}

function readHighlightDecorationsEnabled() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  return cfg.get("highlightDecorationsEnabled", true) !== false;
}

class HighlightManager {
  constructor() {
    this.enabled = true;
    this.decorationTypes = new Map();
    this.lastSummary = [];
    this.lastDetails = [];
    this.lastFilePath = "";
    this.lastFileName = "";
    this.timer = null;
  }

  dispose() {
    for (const deco of this.decorationTypes.values()) {
      try {
        deco.dispose();
      } catch {}
    }
    this.decorationTypes.clear();
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) {
      this.clearAllEditors();
      this.lastSummary = [];
      this.lastDetails = [];
      return;
    }
    this.refreshActiveEditor();
  }

  toggleEnabled() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  clearAllEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
      try {
        for (const deco of this.decorationTypes.values()) {
          editor.setDecorations(deco, []);
        }
      } catch {}
    }
  }

  scheduleRefresh(editor = vscode.window.activeTextEditor) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.refreshEditor(editor);
    }, 120);
  }

  refreshActiveEditor() {
    this.refreshEditor(vscode.window.activeTextEditor);
  }

  refreshEditor(editor) {
    const settingEnabled = readHighlightsEnabled();
    const decorationsEnabled = readHighlightDecorationsEnabled();

    if (!this.enabled || !settingEnabled) {
      this.clearAllEditors();
      this.lastSummary = [];
      this.lastDetails = [];
      this.lastFilePath = "";
      this.lastFileName = "";
      return;
    }

    if (!editor) {
      return;
    }

    if (!isTargetDocument(editor.document)) {
      this.clearAllEditors();
      this.lastSummary = [];
      this.lastDetails = [];
      this.lastFilePath = "";
      this.lastFileName = "";
      return;
    }

    const groups = readHighlightGroups();
    const matches = collectHighlightMatches(editor.document, groups);

    const nextNames = new Set(matches.map((m) => m.name));

    for (const match of matches) {
      let deco = this.decorationTypes.get(match.name);
      if (!deco) {
        deco = vscode.window.createTextEditorDecorationType(
          makeDecorationOptions(match.style),
        );
        this.decorationTypes.set(match.name, deco);
      }

      editor.setDecorations(deco, decorationsEnabled ? match.ranges : []);
    }

    for (const [name, deco] of this.decorationTypes.entries()) {
      if (!nextNames.has(name) || !decorationsEnabled) {
        try {
          editor.setDecorations(deco, []);
        } catch {}
      }
    }

    this.lastFilePath = editor.document.uri.fsPath || "";
    this.lastFileName = editor.document.fileName
      ? editor.document.fileName.split(/[\\/]/).pop() || ""
      : "";

    const matchMap = new Map(matches.map((m) => [m.name, m]));

    this.lastSummary = groups.map((g) => {
      const m = matchMap.get(g.name);

      return {
        name: g.name,
        label: g.label,
        count: m ? m.count : 0,
        enabled: g.enabled !== false,
        countable: g.countable !== false,
      };
    });

    this.lastDetails = groups.map((g) => {
      const m = matchMap.get(g.name);

      return {
        name: g.name,
        label: g.label,
        count: m ? m.count : 0,
        countable: g.countable !== false,
        items: m
          ? m.ranges.slice(0, 50).map((range) => {
              const line = editor.document.lineAt(range.start.line);
              return {
                line: range.start.line + 1,
                preview: line.text,
                startLine: range.start.line,
                startCharacter: range.start.character,
                endLine: range.end.line,
                endCharacter: range.end.character,
              };
            })
          : [],
      };
    });
  }

  getSummaryText() {
    if (!Array.isArray(this.lastSummary) || this.lastSummary.length === 0) {
      return "もじごと: ハイライト対象なし";
    }

    const active = this.lastSummary.filter((x) => x.count > 0);
    if (active.length === 0) {
      return "もじごと: ハイライト 0件";
    }

    const text = active.map((x) => `${x.label} ${x.count}`).join(" / ");

    return `もじごと: ${text}`;
  }

  getUiState() {
    const highlightsEnabled = readHighlightsEnabled();
    const decorationsEnabled = readHighlightDecorationsEnabled();
    const groups = Array.isArray(this.lastSummary) ? this.lastSummary : [];
    const totalCount = groups.reduce((sum, g) => {
      if (g.countable === false) return sum;
      return sum + Number(g.count || 0);
    }, 0);

    return {
      enabled: highlightsEnabled && this.enabled,
      decorationsEnabled,
      currentFile: this.lastFileName || "",
      totalCount,
      groups,
      details: this.lastDetails || [],
    };
  }
}

module.exports = {
  HighlightManager,
};
