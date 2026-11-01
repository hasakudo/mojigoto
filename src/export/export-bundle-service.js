const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");

const { readNoteFile, listNotesWithMeta } = require("../data/note-store");
const {
  resolveExportDirForTarget,
  getEffectiveExportOptions,
  ensureNamedExportDir,
} = require("./export-utils");
const {
  readSettingsFile,
  resolveSettingsTarget,
  getGenreDisplayText,
} = require("../data/settings-store");
const { resolveTargetWorkContext } = require("../core/mojigoto-paths");
const { isSingleMode } = require("../core/mojigoto-context");
const { pickIncludeNoteMemos } = require("./note-memo-export");
const { createBundleExportFormatters } = require("./bundle-export-formatters");
const {
  buildBundleTxt, buildBundleMd, buildBundleHtml,
  buildNoteTypeBundleTxt, buildNoteTypeBundleMd, buildNoteTypeBundleHtml,
} = createBundleExportFormatters({ getEffectiveExportOptions, getGenreDisplayText });

function sanitizeFileName(input, fallback = "作品まとめ") {
  const s = String(input || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return s || fallback;
}

async function resolveViewBundleExportDir(context) {
  const dir = await ensureNamedExportDir(context, "ノート書き出し");
  return dir || "";
}

async function resolveTargetBundleExportDir(context, item) {
  if (isSingleMode()) {
    const dir = await ensureNamedExportDir(context, "ノート書き出し");

    return dir || "";
  }

  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  const dir = await resolveExportDirForTarget(
    context,
    targetWork,
    "ノート書き出し",
  );

  return dir || "";
}

function buildStableBundleFileName(title, label, ext) {
  const baseName = sanitizeFileName(`${title}_${label}`, label);
  return `${baseName}.${ext}`;
}

function resolveBundleTitle(item, settings, fallback = "作品") {
  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  return (
    String(targetWork?.workTitle || "").trim() ||
    String(settings?.title || "").trim() ||
    String(item?.workTitle || "").trim() ||
    String(settings?.folderName || "").trim() ||
    String(targetWork?.workName || "").trim() ||
    String(item?.workName || "").trim() ||
    fallback
  );
}

function normalizeViewBundleItem(item) {
  const targetWork = resolveTargetWorkContext({
    workDir: String(item?.workDir || item?.fsPath || ""),
    workName: String(item?.workName || ""),
    workTitle: String(item?.workTitle || ""),
  });

  return {
    fsPath: targetWork.workDir,
    workDir: targetWork.workDir,
    workName: targetWork.workName,
    workTitle: targetWork.workTitle,
    kind: "work",
  };
}

async function pickBundleFormat() {
  const picked = await vscode.window.showQuickPick(
    [
      { label: "Markdown (.md)", value: "md" },
      { label: "テキスト (.txt)", value: "txt" },
      {
        label: "HTML (.html)",
        value: "html",
        description: "ブラウザ表示 / PDF保存向け",
      },
    ],
    {
      title: "もじごと: まとめ書き出し形式を選択",
      ignoreFocusOut: true,
    },
  );

  return picked?.value || "";
}

async function pickIncludeSettings() {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "設定を含める",
        value: true,
        detail:
          "HTMLでは、フォルダ名・目標文字数・締切日・ペンネーム・メモの出力は作品設定の書き出し設定に従います。",
      },
      {
        label: "設定を含めない",
        value: false,
      },
    ],
    {
      title: "もじごと: 設定を含めますか？",
      ignoreFocusOut: true,
    },
  );

  if (!picked) return null;
  return picked.value;
}

async function pickPlotNotes(plotNotesMeta) {
  if (!Array.isArray(plotNotesMeta) || plotNotesMeta.length === 0) {
    return [];
  }

  const items = plotNotesMeta.map((meta) => ({
    label:
      meta.title || path.basename(meta.fsPath || "", ".json") || "プロット",
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "もじごと: 含めるプロットを選択",
    placeHolder: "複数選択できます。何も選ばないとプロットなしで出力します。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

async function pickReferenceNotes(referenceNotesMeta) {
  if (!Array.isArray(referenceNotesMeta) || referenceNotesMeta.length === 0) {
    return [];
  }

  const items = referenceNotesMeta.map((meta) => ({
    label: meta.title || path.basename(meta.fsPath || "", ".json") || "資料",
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "もじごと: 含める資料を選択",
    placeHolder: "複数選択できます。何も選ばないと資料なしで出力します。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

async function loadBundleData(item, options = {}) {
  const includeSettings = options.includeSettings !== false;
  const selectedPlotMetas = Array.isArray(options.selectedPlotMetas)
    ? options.selectedPlotMetas
    : null;
  const selectedReferenceMetas = Array.isArray(options.selectedReferenceMetas)
    ? options.selectedReferenceMetas
    : null;

  let settings = null;
  if (includeSettings) {
    const settingsTarget = await resolveSettingsTarget(item);
    settings = await readSettingsFile(settingsTarget.path, item);
  }

  const allPlotNotesMeta = await listNotesWithMeta("plot", item);
  const allReferenceNotesMeta = await listNotesWithMeta("reference", item);

  const plotNotesMeta = selectedPlotMetas ?? allPlotNotesMeta;
  const referenceNotesMeta = selectedReferenceMetas ?? allReferenceNotesMeta;

  const plotNotes = [];
  for (const meta of plotNotesMeta) {
    plotNotes.push(await readNoteFile(meta.fsPath, "plot"));
  }

  const referenceNotes = [];
  for (const meta of referenceNotesMeta) {
    referenceNotes.push(await readNoteFile(meta.fsPath, "reference"));
  }

  const title = resolveBundleTitle(item, settings, "作品");

  return {
    title,
    settings,
    plotNotes,
    referenceNotes,
    allPlotNotesMeta,
    allReferenceNotesMeta,
  };
}

async function exportViewBundle(context, item) {
  if (
    !item &&
    !vscode.workspace
      .getConfiguration("mojigoto")
      .get("mode", "single")
      .includes("single")
  ) {
    throw new Error(
      "View対象作品を取得できませんでした。Viewから実行してください。",
    );
  }

  const format = await pickBundleFormat();
  if (!format) return;

  const includeSettings = await pickIncludeSettings();
  if (includeSettings === null) return;

  const bundleItem = normalizeViewBundleItem(item);

  const previewBundle = await loadBundleData(bundleItem, {
    includeSettings,
  });

  const selectedPlotMetas = await pickPlotNotes(previewBundle.allPlotNotesMeta);
  if (selectedPlotMetas === null) return;

  const selectedReferenceMetas = await pickReferenceNotes(
    previewBundle.allReferenceNotesMeta,
  );
  if (selectedReferenceMetas === null) return;

  const bundle = await loadBundleData(bundleItem, {
    includeSettings,
    selectedPlotMetas,
    selectedReferenceMetas,
  });

  const includeItemMemos = format === "html" ? await pickIncludeNoteMemos(vscode, [...bundle.plotNotes, ...bundle.referenceNotes]) : false;
  if (includeItemMemos === undefined) return;
  const dir = await resolveViewBundleExportDir(context);
  if (!dir) return;

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildBundleTxt(bundle);
  } else if (format === "md") {
    content = buildBundleMd(bundle);
  } else if (format === "html") {
    content = buildBundleHtml(bundle, { includeItemMemos });
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const fileName = buildStableBundleFileName(
    bundle.title,
    "設定・プロット・資料まとめ",
    ext,
  );
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: Viewまとめを書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

async function exportTargetWorkBundle(context, item) {
  if (!item?.fsPath && !item?.workDir) {
    throw new Error(
      "作品情報を取得できませんでした。作品ツリーから実行してください。",
    );
  }

  const format = await pickBundleFormat();
  if (!format) return;

  const includeSettings = await pickIncludeSettings();
  if (includeSettings === null) return;

  const previewBundle = await loadBundleData(item, {
    includeSettings,
  });

  const selectedPlotMetas = await pickPlotNotes(previewBundle.allPlotNotesMeta);
  if (selectedPlotMetas === null) return;

  const selectedReferenceMetas = await pickReferenceNotes(
    previewBundle.allReferenceNotesMeta,
  );
  if (selectedReferenceMetas === null) return;

  const bundle = await loadBundleData(item, {
    includeSettings,
    selectedPlotMetas,
    selectedReferenceMetas,
  });

  const includeItemMemos = format === "html" ? await pickIncludeNoteMemos(vscode, [...bundle.plotNotes, ...bundle.referenceNotes]) : false;
  if (includeItemMemos === undefined) return;
  const dir = await resolveTargetBundleExportDir(context, item);
  if (!dir) return;

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildBundleTxt(bundle);
  } else if (format === "md") {
    content = buildBundleMd(bundle);
  } else if (format === "html") {
    content = buildBundleHtml(bundle, { includeItemMemos });
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const fileName = buildStableBundleFileName(
    bundle.title,
    "設定・プロット・資料",
    ext,
  );
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: この作品のまとめを書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

async function pickBundleMode(typeLabel) {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "すべてまとめて書き出し",
        description: `${typeLabel}を全件まとめて出力します`,
        value: "all",
      },
      {
        label: "選択して書き出し",
        description: `${typeLabel}を選んでまとめて出力します`,
        value: "select",
      },
    ],
    {
      title: `もじごと: ${typeLabel}まとめ書き出し`,
      ignoreFocusOut: true,
    },
  );

  return picked?.value || "";
}

async function pickNoteMetasByType(noteMetas, typeLabel) {
  if (!Array.isArray(noteMetas) || noteMetas.length === 0) {
    return [];
  }

  const items = noteMetas.map((meta) => ({
    label: meta.title || path.basename(meta.fsPath || "", ".json") || typeLabel,
    description: meta.fsPath || "",
    picked: true,
    value: meta,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: `もじごと: 含める${typeLabel}を選択`,
    placeHolder: "複数選択できます。何も選ばないと出力対象なしになります。",
    canPickMany: true,
    ignoreFocusOut: true,
    matchOnDescription: true,
  });

  if (!picked) return null;
  return picked.map((item) => item.value);
}

async function loadNoteTypeBundleData(item, noteType, options = {}) {
  const selectedMetas = Array.isArray(options.selectedMetas)
    ? options.selectedMetas
    : null;

  const allMetas = await listNotesWithMeta(noteType, item);
  const targetMetas = selectedMetas ?? allMetas;

  const notes = [];
  for (const meta of targetMetas) {
    notes.push(await readNoteFile(meta.fsPath, noteType));
  }

  let settings = null;
  try {
    const settingsTarget = await resolveSettingsTarget(item);
    settings = await readSettingsFile(settingsTarget.path, item);
  } catch {
    settings = null;
  }

  const titleBase = resolveBundleTitle(
    item,
    settings,
    noteType === "plot" ? "プロット" : "資料",
  );

  return {
    title: titleBase,
    noteType,
    notes,
    allMetas,
  };
}

async function exportNoteTypeBundle(context, item, noteType) {
  const typeLabel = noteType === "plot" ? "プロット" : "資料";

  const format = await pickBundleFormat();
  if (!format) return;

  const mode = await pickBundleMode(typeLabel);
  if (!mode) return;

  const previewBundle = await loadNoteTypeBundleData(item, noteType);

  let selectedMetas = previewBundle.allMetas;
  if (mode === "select") {
    selectedMetas = await pickNoteMetasByType(
      previewBundle.allMetas,
      typeLabel,
    );
    if (selectedMetas === null) return;
  }

  if (!Array.isArray(selectedMetas) || selectedMetas.length === 0) {
    vscode.window.showInformationMessage(
      `もじごと: 出力対象の${typeLabel}がありません。`,
    );
    return;
  }

  const bundle = await loadNoteTypeBundleData(item, noteType, {
    selectedMetas,
  });

  if (!Array.isArray(bundle.notes) || bundle.notes.length === 0) {
    vscode.window.showInformationMessage(
      `もじごと: 出力対象の${typeLabel}がありません。`,
    );
    return;
  }

  const includeItemMemos = format === "html" ? await pickIncludeNoteMemos(vscode, bundle.notes) : false;
  if (includeItemMemos === undefined) return;
  const dir = await resolveTargetBundleExportDir(context, item);
  if (!dir) return;

  let content = "";
  let ext = format;

  if (format === "txt") {
    content = buildNoteTypeBundleTxt(bundle);
  } else if (format === "md") {
    content = buildNoteTypeBundleMd(bundle);
  } else if (format === "html") {
    content = buildNoteTypeBundleHtml(bundle, { includeItemMemos });
  } else {
    throw new Error(`未対応の形式です: ${format}`);
  }

  const label = noteType === "plot" ? "プロットまとめ" : "資料まとめ";
  const fileName = buildStableBundleFileName(bundle.title, label, ext);
  const fullPath = path.join(dir, fileName);

  await fs.writeFile(fullPath, content, "utf8");

  const action = await vscode.window.showInformationMessage(
    `もじごと: ${typeLabel}まとめを書き出しました → ${fileName}`,
    "フォルダを開く",
    "ファイルを開く",
  );

  if (action === "ファイルを開く") {
    await vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.file(fullPath),
    );
  } else if (action === "フォルダを開く") {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(fullPath),
    );
  }

  return fullPath;
}

module.exports = {
  exportViewBundle,
  exportTargetWorkBundle,
  exportNoteTypeBundle,
};
