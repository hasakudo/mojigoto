const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function createCountsStatusController(context, deps) {
  const {
    countChars,
    getCountModeLabel,
    safeRead,
    listTextFiles,
    detectChapter,
    getCurrentWorkGoal,
    getDiffKeyForWork,
    isEnabled,
    getManuscriptRoot,
    getCurrentWorkName,
    listWorkDirectories,
    getWorkManuscriptRoot,
  } = deps;

  const itemTotal = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    103,
  );
  const itemChap = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    102,
  );
  const itemFile = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    101,
  );

  itemTotal.text = "$(book) -";
  itemChap.text = "$(file-directory) -";
  itemFile.text = "$(file) -";

  context.subscriptions.push(itemTotal, itemChap, itemFile);

  itemTotal.command = "mojigoto.selectCountMode";
  itemChap.command = "mojigoto.selectCountMode";
  itemFile.command = "mojigoto.selectCountMode";

  let timer = null;
  let seq = 0;

  function updateTooltips(modeLabel, meta = {}) {
    const tooltipSuffix = `\n現在の方式: ${modeLabel}\nクリックで変更`;
    const scopeLabel = meta.scopeLabel ? `\n対象: ${meta.scopeLabel}` : "";

    itemFile.tooltip = `現在のファイル文字数${tooltipSuffix}`;
    itemChap.tooltip = `章の文字数${scopeLabel}${tooltipSuffix}`;
    itemTotal.tooltip = `原稿全体の文字数と目標達成率${scopeLabel}${tooltipSuffix}`;
  }

  function updateVisibility() {
    const enabled = typeof isEnabled === "function" ? !!isEnabled() : true;

    if (enabled) {
      itemFile.show();
      itemChap.show();
      itemTotal.show();
    } else {
      itemFile.hide();
      itemChap.hide();
      itemTotal.hide();
    }
  }

  function formatWithDiff(label, n, diff) {
    const s = Number(n || 0).toLocaleString("ja-JP");
    if (!diff) return `${label} ${s}`;
    const sign = diff > 0 ? "+" : "";
    return `${label} ${s} (${sign}${Number(diff).toLocaleString("ja-JP")})`;
  }

  function getRoot() {
    try {
      return String(
        typeof getManuscriptRoot === "function" ? getManuscriptRoot() : "",
      ).trim();
    } catch {
      return "";
    }
  }

  function getTotalGoal() {
    try {
      const n = Number(
        typeof getCurrentWorkGoal === "function"
          ? getCurrentWorkGoal(context)
          : 0,
      );
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  function findCurrentWork() {
    try {
      const currentWorkName = String(
        typeof getCurrentWorkName === "function" ? getCurrentWorkName() : "",
      ).trim();

      if (!currentWorkName || typeof listWorkDirectories !== "function") {
        return null;
      }

      return (
        listWorkDirectories().find(
          (item) => String(item?.name || "").trim() === currentWorkName,
        ) || null
      );
    } catch {
      return null;
    }
  }

  function isUnderRoot(root, filePath) {
    try {
      if (!root || !filePath) return false;
      const rel = path.relative(root, filePath);
      return !!rel && !rel.startsWith("..");
    } catch {
      return false;
    }
  }

  function resolveStatusScope(filePath) {
    const viewRoot = getRoot();
    const currentWork = findCurrentWork();
    const currentWorkRoot =
      currentWork && typeof getWorkManuscriptRoot === "function"
        ? String(getWorkManuscriptRoot(currentWork.fsPath) || "").trim()
        : "";

    // Single はそのまま
    if (!currentWorkRoot) {
      return {
        root: viewRoot,
        filePath,
        useDiff: true,
        useProgress: true,
        scopeLabel: "現在の作品（View連携）",
      };
    }

    // 1) まず View 配下を優先
    if (viewRoot && isUnderRoot(viewRoot, filePath)) {
      return {
        root: viewRoot,
        filePath,
        useDiff: true,
        useProgress: true,
        scopeLabel: "現在の作品（View連携）",
      };
    }

    // 2) 連携中作品の実体ファイルなら、View 側へ対応変換
    if (viewRoot && currentWorkRoot && isUnderRoot(currentWorkRoot, filePath)) {
      const rel = path.relative(currentWorkRoot, filePath);
      return {
        root: viewRoot,
        filePath: path.join(viewRoot, rel),
        useDiff: true,
        useProgress: true,
        scopeLabel: "現在の作品（View連携）",
      };
    }

    // 3) 連携していない別作品なら、その作品 root を使う
    if (
      typeof listWorkDirectories === "function" &&
      typeof getWorkManuscriptRoot === "function"
    ) {
      for (const work of listWorkDirectories()) {
        if (!work?.fsPath) continue;

        const manuscriptRoot = String(
          getWorkManuscriptRoot(work.fsPath) || "",
        ).trim();
        if (!manuscriptRoot) continue;

        if (isUnderRoot(manuscriptRoot, filePath)) {
          return {
            root: manuscriptRoot,
            filePath,
            useDiff: false,
            useProgress: false,
            scopeLabel: `作品: ${String(work?.title || work?.name || "").trim() || "現在の作品"}`,
          };
        }
      }
    }

    // 4) 最後の保険
    return {
      root: viewRoot,
      filePath,
      useDiff: true,
      useProgress: true,
      scopeLabel: "現在の作品（View連携）",
    };
  }

  async function recalcAll(reason = "") {
    const mySeq = ++seq;
    const modeLabel = getCountModeLabel();

    const ed = vscode.window.activeTextEditor;
    if (!ed) {
      itemFile.text = "$(file) -";
      itemChap.text = "$(file-directory) -";
      itemTotal.text = "$(book) -";
      updateTooltips(modeLabel);
      return;
    }

    const doc = ed.document;
    const filePath = doc.uri?.fsPath || "";
    const text = doc.getText();
    const fileCount = countChars(text);
    const dirty = doc.isDirty ? " *" : "";
    itemFile.text = `$(file) ${fileCount.toLocaleString("ja-JP")}${dirty}`;

    const scope = resolveStatusScope(filePath);
    updateTooltips(modeLabel, scope);

    const root = String(scope?.root || "").trim();
    const effectiveFilePath = String(scope?.filePath || filePath).trim();

    if (!root || !fs.existsSync(root)) {
      itemChap.text = "$(file-directory) (root?)";
      itemTotal.text = "$(book) (root?)";
      return;
    }

    const chap = detectChapter(root, effectiveFilePath);
    if (!chap) {
      itemChap.text = "$(file-directory) -";
    } else {
      let chapCount = 0;

      if (chap === "（章なし）") {
        try {
          const ents = fs.readdirSync(root, { withFileTypes: true });
          for (const e of ents) {
            if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (ext === ".txt" || ext === ".md") {
                if (mySeq !== seq) return;
                chapCount += countChars(safeRead(path.join(root, e.name)));
              }
            }
          }
        } catch {}
      } else {
        const chapDir = path.join(root, chap);
        for (const f of listTextFiles(chapDir)) {
          if (mySeq !== seq) return;
          chapCount += countChars(safeRead(f));
        }
      }

      let diffChap = 0;
      if (scope.useDiff) {
        const chapKey = getDiffKeyForWork(context, "chap", chap);
        const prevChap = context.globalState.get(chapKey, 0);
        diffChap = chapCount - prevChap;

        if (reason === "save") {
          await context.globalState.update(chapKey, chapCount);
        }
      }

      itemChap.text = formatWithDiff("$(file-directory)", chapCount, diffChap);
    }

    let totalCount = 0;
    for (const f of listTextFiles(root)) {
      if (mySeq !== seq) return;
      totalCount += countChars(safeRead(f));
    }

    let diffTotal = 0;
    if (scope.useDiff) {
      const totalKey = getDiffKeyForWork(context, "total", "all");
      const prevTotal = context.globalState.get(totalKey, 0);
      diffTotal = totalCount - prevTotal;

      if (reason === "save") {
        await context.globalState.update(totalKey, totalCount);
      }
    }

    let pctText = "";
    if (scope.useProgress) {
      const goal = getTotalGoal();
      if (goal > 0) {
        const pct = Math.max(0, Math.min(999, (totalCount / goal) * 100));
        pctText = ` 進捗 ${pct.toFixed(1)}%`;
      }
    }

    itemTotal.text = formatWithDiff("$(book)", totalCount, diffTotal) + pctText;
  }

  function scheduleRecalc(reason = "") {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      recalcAll(reason);
    }, 400);
  }

  function registerEventHandlers() {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() =>
        scheduleRecalc("activeEditor"),
      ),
      vscode.workspace.onDidSaveTextDocument(() => scheduleRecalc("save")),
      vscode.workspace.onDidChangeTextDocument(() => scheduleRecalc("edit")),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("mojigoto.manuscriptRoot") ||
          e.affectsConfiguration("mojigoto.mode") ||
          e.affectsConfiguration("mojigoto.countMode")
        ) {
          scheduleRecalc("config");
        }
        if (e.affectsConfiguration("mojigoto.statusBarCountsEnabled")) {
          updateVisibility();
        }
      }),
    );
  }

  function initialize() {
    updateVisibility();
    registerEventHandlers();
    scheduleRecalc("init");
  }

  function dispose() {
    if (timer) clearTimeout(timer);
    itemFile.dispose();
    itemChap.dispose();
    itemTotal.dispose();
  }

  return {
    initialize,
    updateVisibility,
    scheduleRecalc,
    recalcAll,
    dispose,
    items: {
      itemFile,
      itemChap,
      itemTotal,
    },
  };
}

module.exports = {
  createCountsStatusController,
};
