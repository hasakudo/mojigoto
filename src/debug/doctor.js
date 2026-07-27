const vscode = require("vscode");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  getCurrentWorkDisplayName,
  getCurrentWorkTitleFromSettings,
} = require("../work/work-settings");

function existsPath(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch {
    return false;
  }
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function inferWorkRootFromManuscriptRoot(manuscriptRoot) {
  const mr = String(manuscriptRoot || "").trim();
  if (!mr) return "";

  try {
    const parent = path.dirname(mr); // ...\_WORK
    const base = path.basename(parent);
    if (base !== "_WORK") return "";
    return path.dirname(parent); // workRoot
  } catch {
    return "";
  }
}

function pushCheck(report, level, title, detail = "") {
  report.checks.push({
    level, // ok | warn | error | info
    title,
    detail,
  });
}

function pushRepair(report, text) {
  report.repairPlanLines.push(text);
  report.canRepair = true;
}

function formatCheckLine(item) {
  const mark =
    item.level === "ok"
      ? "✅"
      : item.level === "warn"
        ? "⚠️"
        : item.level === "error"
          ? "❌"
          : "ℹ️";

  return `${mark} ${item.title}${item.detail ? `\n   ${item.detail}` : ""}`;
}

function buildSummaryLines(report) {
  const errors = report.checks.filter((x) => x.level === "error").length;
  const warns = report.checks.filter((x) => x.level === "warn").length;
  const oks = report.checks.filter((x) => x.level === "ok").length;

  return [
    `概要: ✅ ${oks} / ⚠️ ${warns} / ❌ ${errors}`,
    `モード: ${report.mode || "(未設定)"}`,
    `workspace: ${report.wsPath || "(なし)"}`,
    `現在の作品: ${report.currentWorkDisplayName || "未設定"}`,
  ];
}

function buildDoctorText(report) {
  const lines = [];

  lines.push("🩺 Mojigoto Doctor");
  lines.push("");

  lines.push(...buildSummaryLines(report));
  lines.push("");

  lines.push("確認結果:");
  for (const item of report.checks) {
    lines.push(formatCheckLine(item));
  }

  if (report.repairPlanLines.length) {
    lines.push("");
    lines.push("修復候補:");
    for (const line of report.repairPlanLines) {
      lines.push(`- ${line}`);
    }
  }

  return lines.join("\n");
}

async function runDoctor(context, deps = {}) {
  const {
    firstRunSetup = async () => {},
    refreshExplorer = async () => {},
    resolveVerticalDevPath = () => null,
    isPortOpen = async () => false,
    pingServer = async () => false,
    previewState = null,
  } = deps;

  const report = await buildDoctorReport(context, {
    resolveVerticalDevPath,
    isPortOpen,
    pingServer,
    previewState,
  });

  const diagText = buildDoctorText(report);
  const buttons = [];

  if (report.canRepair) buttons.push("修復内容を見る");
  if (report.canRunSetup) buttons.push("初回セットアップを実行");
  buttons.push("閉じる");

  const picked = await vscode.window.showInformationMessage(
    diagText,
    { modal: true },
    ...buttons,
  );

  if (picked === "初回セットアップを実行") {
    await firstRunSetup(context, { directSetup: true });
    return;
  }

  if (picked !== "修復内容を見る") return;

  const planText = [
    "🧰 修復内容（プレビュー）",
    "",
    ...(report.repairPlanLines.length
      ? report.repairPlanLines.map((line) => `- ${line}`)
      : ["- （修復できる項目はありません）"]),
  ].join("\n");

  const picked2 = await vscode.window.showInformationMessage(
    planText,
    { modal: true },
    "修復する",
    "戻る",
  );

  if (picked2 === "戻る") {
    await runDoctor(context, deps);
    return;
  }

  if (picked2 !== "修復する") return;

  const ok = await repairFromReport(context, report, {
    refreshExplorer,
  });
  if (!ok) return;

  const reportAfter = await buildDoctorReport(context, {
    resolveVerticalDevPath,
    isPortOpen,
    pingServer,
    previewState,
  });

  const afterText = [
    "✅ 修復後の診断結果",
    "",
    buildDoctorText(reportAfter),
  ].join("\n");

  await vscode.window.showInformationMessage(
    afterText,
    { modal: true },
    "閉じる",
  );
}

async function buildDoctorReport(context, deps = {}) {
  const {
    resolveVerticalDevPath = () => null,
    isPortOpen = async () => false,
    pingServer = async () => false,
    previewState = null,
  } = deps;

  const report = {
    checks: [],
    repairPlanLines: [],
    canRepair: false,
    canRunSetup: false,
    mode: "",
    workRoot: "",
    manuscriptRoot: "",
    wsPath: "",
    currentWorkName: "",
    currentWorkDisplayName: "",
  };

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  report.mode = String(cfg.get("mode", "") || "").trim();
  report.workRoot = String(cfg.get("workRoot", "") || "").trim();
  report.manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();
  report.currentWorkName = String(
    context.globalState.get("mojigoto.currentWorkName", "") || "",
  ).trim();

  const currentWorkTitle = String(
    getCurrentWorkTitleFromSettings(context) || "",
  ).trim();

  if (report.mode === "multi") {
    report.currentWorkDisplayName = String(
      getCurrentWorkDisplayName(context) || report.currentWorkName || "",
    ).trim();
  } else if (report.mode === "single") {
    report.currentWorkDisplayName = currentWorkTitle || "";
  } else {
    report.currentWorkDisplayName = "";
  }

  const wf = vscode.workspace.workspaceFolders?.[0];
  report.wsPath = wf?.uri?.fsPath || "";

  // Workspace
  pushCheck(
    report,
    wf ? "ok" : "error",
    "ワークスペース",
    wf ? report.wsPath : "File > Open Folder でワークフォルダを開いてください",
  );

  // Mode
  const modeOk = report.mode === "single" || report.mode === "multi";
  pushCheck(
    report,
    modeOk ? "ok" : "error",
    "mojigoto.mode",
    modeOk ? report.mode : "未設定または不正です",
  );

  if (!modeOk) {
    report.canRunSetup = true;
    pushCheck(
      report,
      "warn",
      "初回セットアップ推奨",
      "mode が確定していないため、初回セットアップを実行してください",
    );
    return report;
  }

  // manuscriptRoot
  pushCheck(
    report,
    report.manuscriptRoot ? "ok" : "error",
    "mojigoto.manuscriptRoot",
    report.manuscriptRoot || "未設定です",
  );

  if (report.manuscriptRoot) {
    pushCheck(
      report,
      existsPath(report.manuscriptRoot) ? "ok" : "error",
      "manuscriptRoot の存在",
      report.manuscriptRoot,
    );
  }

  if (report.mode === "single") {
    pushCheck(
      report,
      report.workRoot ? "warn" : "ok",
      "single での workRoot",
      report.workRoot
        ? `single では不要です: ${report.workRoot}`
        : "single では空で問題ありません",
    );

    const singleSettingsPath = report.wsPath
      ? path.join(report.wsPath, ".mojigoto", "singleWork.json")
      : "";

    pushCheck(
      report,
      singleSettingsPath && existsPath(singleSettingsPath) ? "ok" : "warn",
      "Single 設定ファイル",
      singleSettingsPath || ".mojigoto/singleWork.json は未作成です",
    );

    if (!report.manuscriptRoot && report.wsPath) {
      const nextRoot = path.join(report.wsPath, "manuscript");
      pushRepair(report, `manuscript を作成: ${nextRoot}`);
      pushRepair(report, `manuscriptRoot を設定: ${nextRoot}`);
    } else if (report.manuscriptRoot && !existsPath(report.manuscriptRoot)) {
      pushRepair(report, `manuscriptRoot を作成: ${report.manuscriptRoot}`);
    }

    if (report.workRoot) {
      pushRepair(report, "workRoot を空にします（single では不要）");
    }
  }

  if (report.mode === "multi") {
    const inferredWorkRoot = inferWorkRootFromManuscriptRoot(
      report.manuscriptRoot,
    );
    const effectiveWorkRoot = report.workRoot || inferredWorkRoot;

    pushCheck(
      report,
      report.workRoot ? "ok" : inferredWorkRoot ? "warn" : "error",
      "mojigoto.workRoot",
      report.workRoot
        ? report.workRoot
        : inferredWorkRoot
          ? `未設定です（推測候補: ${inferredWorkRoot}）`
          : "未設定です",
    );

    if (!report.workRoot && inferredWorkRoot) {
      pushRepair(report, `workRoot を設定: ${inferredWorkRoot}`);
    }

    if (effectiveWorkRoot) {
      pushCheck(
        report,
        existsPath(effectiveWorkRoot) ? "ok" : "error",
        "workRoot の存在",
        effectiveWorkRoot,
      );

      if (!existsPath(effectiveWorkRoot)) {
        pushRepair(report, `workRoot を作成: ${effectiveWorkRoot}`);
      }
    }

    const workDir = effectiveWorkRoot
      ? path.join(effectiveWorkRoot, "_WORK")
      : "";
    const linkPath = workDir ? path.join(workDir, "manuscript") : "";

    if (effectiveWorkRoot && existsPath(effectiveWorkRoot)) {
      pushCheck(
        report,
        existsPath(workDir) ? "ok" : "error",
        "_WORK フォルダ",
        workDir || "_WORK が解決できません",
      );

      pushCheck(
        report,
        existsPath(linkPath) ? "ok" : "error",
        "_WORK/manuscript",
        linkPath || "_WORK/manuscript が解決できません",
      );

      if (!existsPath(workDir)) {
        pushRepair(report, `_WORK を作成: ${workDir}`);
      }

      if (!existsPath(linkPath)) {
        pushRepair(report, `_WORK/manuscript を作成: ${linkPath}`);
      }

      if (
        report.manuscriptRoot &&
        linkPath &&
        report.manuscriptRoot !== linkPath
      ) {
        pushCheck(
          report,
          "warn",
          "manuscriptRoot と View 先の不一致",
          `設定値: ${report.manuscriptRoot}\n   推奨: ${linkPath}`,
        );
        pushRepair(
          report,
          `manuscriptRoot を _WORK/manuscript に修正: ${linkPath}`,
        );
      }

      if (!report.manuscriptRoot && linkPath) {
        pushCheck(report, "error", "mojigoto.manuscriptRoot", "未設定です");
        pushRepair(report, `manuscriptRoot を設定: ${linkPath}`);
      }

      // 作品候補数
      let workCandidates = [];
      try {
        workCandidates = fs
          .readdirSync(effectiveWorkRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .filter((name) => !name.startsWith("."))
          .filter((name) => name !== "_WORK");
      } catch {
        workCandidates = [];
      }

      pushCheck(
        report,
        workCandidates.length > 0 ? "ok" : "warn",
        "作品候補フォルダ",
        workCandidates.length > 0
          ? `${workCandidates.length}件`
          : "作品候補フォルダが見つかりません",
      );

      // currentWorkName
      pushCheck(
        report,
        report.currentWorkDisplayName
          ? "ok"
          : workCandidates.length > 0
            ? "warn"
            : "info",
        "現在の作品",
        report.currentWorkDisplayName
          ? report.currentWorkDisplayName
          : workCandidates.length > 0
            ? "未選択です（作品切替が必要です）"
            : "未設定",
      );

      if (report.currentWorkName) {
        const currentWorkDir = path.join(
          effectiveWorkRoot,
          report.currentWorkName,
        );
        const currentWorkJson = path.join(
          currentWorkDir,
          ".mojigoto",
          "work.json",
        );

        const currentWorkExists = existsPath(currentWorkDir);

        pushCheck(
          report,
          currentWorkExists ? "ok" : "error",
          "現在作品フォルダの存在",
          currentWorkDir,
        );

        if (!currentWorkExists) {
          pushRepair(
            report,
            "currentWorkName を空にします（現在作品フォルダが見つからないため）",
          );
        }

        pushCheck(
          report,
          existsPath(currentWorkJson)
            ? "ok"
            : currentWorkExists
              ? "warn"
              : "info",
          "現在作品の work.json",
          existsPath(currentWorkJson)
            ? currentWorkJson
            : "work.json が見つかりません",
        );

        const settings = readJsonFileSafe(currentWorkJson);
        if (settings) {
          const folderName = String(settings.folderName || "").trim();

          pushCheck(
            report,
            folderName === report.currentWorkName ? "ok" : "warn",
            "work.json.folderName の整合",
            folderName ? `folderName=${folderName}` : "folderName が未設定です",
          );

          if (folderName && folderName !== report.currentWorkName) {
            pushRepair(
              report,
              `work.json.folderName を現在作品名に修正: ${report.currentWorkName}`,
            );
          }
        }
      } else if (workCandidates.length === 1) {
        pushCheck(
          report,
          "warn",
          "現在作品の未選択",
          `作品候補が1件だけあるため、自動選択候補: ${workCandidates[0]}`,
        );
      }
      try {
        workCandidates = fs
          .readdirSync(effectiveWorkRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .filter((name) => !name.startsWith("."))
          .filter((name) => name !== "_WORK");
      } catch {
        workCandidates = [];
      }
    }
  }

  // Preview / vertical-dev
  const info = resolveVerticalDevPath(context);
  pushCheck(
    report,
    info ? "ok" : "warn",
    "vertical-dev.mjs 解決",
    info ? info.scriptPath : "スクリプトの解決に失敗しました",
  );

  if (info) {
    pushCheck(
      report,
      existsPath(info.scriptPath) ? "ok" : "error",
      "vertical-dev.mjs の存在",
      info.scriptPath,
    );
  }

  pushCheck(
    report,
    previewState?.panel ? "ok" : "info",
    "プレビューパネル",
    previewState?.panel ? "開いています" : "未表示です",
  );

  const serverPort = previewState?.serverPort || null;
  if (serverPort) {
    const open = await isPortOpen(serverPort);
    pushCheck(
      report,
      open ? "ok" : "warn",
      "プレビューサーバーポート",
      `${serverPort} ${open ? "OPEN" : "CLOSED"}`,
    );

    const ok = await pingServer(previewState);
    pushCheck(
      report,
      ok ? "ok" : "warn",
      "/api/chapters 応答",
      ok ? "OK" : "NG",
    );
  } else {
    pushCheck(
      report,
      "info",
      "プレビューサーバー",
      "serverPort 未確定（未起動の可能性）",
    );
  }

  if (!report.repairPlanLines.length) {
    report.repairPlanLines.push("（修復できる項目はありません）");
  }

  return report;
}

async function repairFromReport(context, report, deps = {}) {
  const { refreshExplorer = async () => {} } = deps;

  const cfg = vscode.workspace.getConfiguration("mojigoto");

  try {
    if (report.mode === "multi") {
      const inferredWorkRoot = inferWorkRootFromManuscriptRoot(
        report.manuscriptRoot,
      );
      const workRoot = report.workRoot || inferredWorkRoot || report.wsPath;
      if (!workRoot) {
        vscode.window.showWarningMessage(
          "もじごと: workRoot を決められません（Open Folderしてください）",
        );
        return false;
      }

      const workDir = path.join(workRoot, "_WORK");
      const linkPath = path.join(workDir, "manuscript");

      await fsp.mkdir(linkPath, { recursive: true });

      await cfg.update(
        "workRoot",
        workRoot,
        vscode.ConfigurationTarget.Workspace,
      );
      await cfg.update(
        "manuscriptRoot",
        linkPath,
        vscode.ConfigurationTarget.Workspace,
      );

      await refreshExplorer();

      try {
        await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
      } catch {}
      try {
        await vscode.commands.executeCommand("mojigoto.refreshStats");
      } catch {}
      try {
        await vscode.commands.executeCommand("mojigoto.refreshWorkStatus");
      } catch {}

      vscode.window.showInformationMessage(
        "もじごと: _WORK/manuscript を作成し、設定を修復しました。",
      );
      return true;
    }

    if (report.mode === "single") {
      const wf = vscode.workspace.workspaceFolders?.[0];
      const wsPath = wf?.uri?.fsPath || report.wsPath;

      let manuscriptRoot = report.manuscriptRoot;
      if (!manuscriptRoot) {
        if (!wsPath) {
          vscode.window.showWarningMessage(
            "もじごと: ワークスペースが無いので修復できません（Open Folderしてください）",
          );
          return false;
        }
        manuscriptRoot = path.join(wsPath, "manuscript");
      }

      await fsp.mkdir(manuscriptRoot, { recursive: true });

      await cfg.update(
        "manuscriptRoot",
        manuscriptRoot,
        vscode.ConfigurationTarget.Workspace,
      );
      await cfg.update("workRoot", "", vscode.ConfigurationTarget.Workspace);

      await refreshExplorer();

      try {
        await vscode.commands.executeCommand("mojigoto.refreshWorkTree");
      } catch {}
      try {
        await vscode.commands.executeCommand("mojigoto.refreshStats");
      } catch {}
      try {
        await vscode.commands.executeCommand("mojigoto.refreshWorkStatus");
      } catch {}

      vscode.window.showInformationMessage(
        "もじごと: manuscript を作成し、設定を修復しました。",
      );
      return true;
    }

    vscode.window.showWarningMessage(
      "もじごと: mode が不明です。初回セットアップを実行してください。",
    );
    return false;
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: 修復に失敗しました: ${String(e)}`,
    );
    return false;
  }
}

async function ensureEnvironment(context, deps = {}) {
  const { firstRunSetup = async () => {}, runDoctorImpl = async () => {} } =
    deps;

  const done = context.globalState.get("mojigoto.firstRunSetupDone", false);
  if (!done) {
    try {
      await firstRunSetup(context, { directSetup: true });
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 初回セットアップに失敗しました: ${String(e)}`,
      );
      return false;
    }
  }

  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "") || "").trim();
  const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();

  if (!mode || !manuscriptRoot) {
    const picked = await vscode.window.showWarningMessage(
      "もじごと: 設定が不完全/破損している可能性があります。",
      "Doctor を実行",
      "初回セットアップをやり直す",
      "続行（自己責任）",
    );

    if (picked === "Doctor を実行") {
      await runDoctorImpl(context);
      return false;
    }

    if (picked === "初回セットアップをやり直す") {
      await context.globalState.update("mojigoto.firstRunSetupDone", false);
      await firstRunSetup(context, { directSetup: true });
      return true;
    }
  }

  return true;
}

module.exports = {
  runDoctor,
  buildDoctorReport,
  repairFromReport,
  ensureEnvironment,
};
