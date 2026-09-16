const vscode = require("vscode");
const path = require("path");

const { openInitialSetupWebview } = require("../views/setup-webview");
const { openGuideWebview } = require("../views/guide-webview");
const {
  openFirstRunBoardWebview,
} = require("../views/first-run-board-webview");

const {
  applyInitialSetup,
  buildInitialSetupState,
} = require("./setup-service");
const { listWorkDirectories } = require("../core/mojigoto-paths");

function needsInitialSetup() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");

  const mode = String(cfg.get("mode", "") || "").trim();
  const workRoot = String(cfg.get("workRoot", "") || "").trim();
  const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();

  if (!mode) return true;

  if (mode === "single") {
    if (!manuscriptRoot) return true;
    return false;
  }

  if (mode === "multi") {
    if (!workRoot) return true;
    if (!manuscriptRoot) return true;
    return false;
  }

  return true;
}

async function openInitialSetup(context, createWorkNow = false) {
  const initialState = await buildInitialSetupState(createWorkNow, context);

  await openInitialSetupWebview(context, initialState, async (payload) => {
    const result = await applyInitialSetup(context, payload);

    if (
      result?.mode === "multi" &&
      result?.createdWork &&
      !payload?.migrateSingleToMulti &&
      listWorkDirectories().length > 1
    ) {
      const choice = await vscode.window.showInformationMessage(
        `もじごと: 作品「${result.workTitle || result.workName}」へ、ほかの作品からデータをコピーしますか？`,
        "他作品からコピー",
        "コピーしない",
      );
      if (choice === "他作品からコピー") {
        await vscode.commands.executeCommand("mojigoto.copyFromOtherWork", {
          kind: "work",
          fsPath: path.join(
            String(payload?.workRoot || ""),
            String(result.workName || ""),
          ),
          workName: result.workName,
        });
      }
    }

    return result;
  });
}

// 初期起動
async function firstRunSetup(context, options = {}) {
  const done = !!context.globalState.get("mojigoto.firstRunSetupDone", false);
  const needsSetup = needsInitialSetup();

  if (done && !needsSetup) return;

  const directSetup = !!options.directSetup;

  if (directSetup) {
    await openInitialSetup(context, true);
    return;
  }

  await openFirstRunBoardWebview(context, {
    openInitialSetup: async () => {
      await openInitialSetup(context, true);
    },
    openGuide: async () => {
      await openGuideWebview(context);
    },
  });
}

function registerSetupCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.resetFirstRun", async () => {
      await context.globalState.update("mojigoto.firstRunSetupDone", false);

      vscode.window.showInformationMessage(
        "もじごと: firstRunSetup フラグをリセットしました。",
      );
    }),

    vscode.commands.registerCommand("mojigoto.openInitialSetup", async () => {
      try {
        await openInitialSetup(context, false);
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 初回セットアップを開けませんでした: ${String(e)}`,
        );
      }
    }),

    vscode.commands.registerCommand("mojigoto.openFirstRunBoard", async () => {
      try {
        await openFirstRunBoardWebview(context, {
          openInitialSetup: async () => {
            await openInitialSetup(context, true);
          },
          openGuide: async () => {
            await openGuideWebview(context);
          },
        });
      } catch (e) {
        vscode.window.showErrorMessage(
          `もじごと: 案内板を開けませんでした: ${String(e)}`,
        );
      }
    }),
  );
}

module.exports = {
  firstRunSetup,
  registerSetupCommands,
  needsInitialSetup,
};
