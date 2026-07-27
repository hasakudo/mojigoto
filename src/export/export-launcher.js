const vscode = require("vscode");

const { exportMergedManuscript } = require("./merged-manuscript-export-ui");
const { exportViewBundle } = require("./export-bundle-service");
const { exportTreeItem } = require("./export-service");
const { isSingleMode } = require("../core/mojigoto-context");

function isTreeItemExportable(item) {
  const kind = String(item?.kind || "");
  return kind === "settingsEntry" || kind === "noteFile";
}

function resolveWorkBundleItem(treeProvider, item) {
  if (item?.workDir) {
    return {
      fsPath: item.workDir,
      workName: item.workName || "",
      workDir: item.workDir,
      kind: item.kind || "",
    };
  }

  if (
    item?.kind === "work" ||
    item?.kind === "currentViewRoot" ||
    item?.kind === "plotRoot" ||
    item?.kind === "referenceRoot"
  ) {
    return {
      fsPath: item.fsPath || "",
      workName: item.workName || "",
      workDir: item.workDir || item.fsPath || "",
      kind: item.kind || "",
    };
  }

  const currentViewItem =
    typeof treeProvider?.resolveCurrentViewWork === "function"
      ? treeProvider.resolveCurrentViewWork()
      : null;

  if (currentViewItem?.workDir) {
    return {
      fsPath: currentViewItem.workDir,
      workName: currentViewItem.workName || "",
      workDir: currentViewItem.workDir,
      kind: "currentViewRoot",
    };
  }

  return null;
}

async function pickExportEntry(item) {
  const picks = [
    {
      label: "原稿：書き出し",
      description: "Viewの原稿を結合して書き出します",
      value: "merged_manuscript",
    },
    {
      label: "ノート：設定 / プロット / 資料をまとめて書き出し",
      description: "Viewのノートをまとめて出力します（選択可）",
      value: "work_bundle",
    },
  ];

  const picked = await vscode.window.showQuickPick(picks, {
    title: "もじごと: 書き出し内容を選択",
    ignoreFocusOut: true,
  });

  return picked?.value || "";
}

async function launchExport(context, treeProvider, item) {
  const entry = await pickExportEntry(item);
  if (!entry) return;

  if (entry === "merged_manuscript") {
    return exportMergedManuscript(context);
  }

  if (entry === "tree_item") {
    if (!isTreeItemExportable(item)) {
      vscode.window.showWarningMessage(
        "もじごと: 単体書き出しは設定またはノートを選択した状態で使ってください。",
      );
      return;
    }

    return exportTreeItem(context, item);
  }

  if (entry === "work_bundle") {
    if (isSingleMode()) {
      return exportViewBundle(context, null);
    }

    const bundleItem = resolveWorkBundleItem(treeProvider, item);
    if (!bundleItem?.workDir) {
      vscode.window.showWarningMessage(
        "もじごと: 書き出し対象の作品を取得できませんでした。",
      );
      return;
    }

    return exportViewBundle(context, bundleItem);
  }
}

module.exports = {
  launchExport,
};
