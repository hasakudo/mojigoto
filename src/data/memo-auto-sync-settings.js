const vscode = require("vscode");
const { keepExistingMemosDisabled } = require("./memo-auto-sync-migration");

const SETTINGS = [
  {
    key: "noteMemoAutoSyncEnabled",
    confirmedKey: "mojigoto.noteMemoAutoSyncEnabled.confirmed",
    label: "項目メモから構想メモへの自動反映",
  },
  {
    key: "conceptMemoAutoSyncEnabled",
    confirmedKey: "mojigoto.conceptMemoAutoSyncEnabled.confirmed",
    label: "構想メモから項目メモへの自動反映",
  },
];

const lifecycles = new WeakMap();
function lifecycle(context) {
  let state = lifecycles.get(context);
  if (!state) {
    state = { disposed: false };
    lifecycles.set(context, state);
  }
  return state;
}

function assertActive(context) {
  if (!lifecycle(context).disposed) return;
  throw Object.assign(new Error("自動反映設定の処理は終了しました。"), { code: "cancelled" });
}

async function confirmFirstEnable(context, setting, beforeEnable = false) {
  assertActive(context);
  const config = vscode.workspace.getConfiguration("mojigoto");
  if (!beforeEnable && config.get(setting.key, false) !== true) return false;
  if (context.workspaceState.get(setting.confirmedKey, false) === true) return true;

  const accepted = await vscode.window.showInformationMessage(
    `${setting.label}をONにします。既存の個別設定がないメモも、すべて自動反映にしますか？`,
    { modal: true },
    "すべてONにする",
    "既存はOFFのまま",
  );
  assertActive(context);

  if (accepted === "すべてONにする") {
    await context.workspaceState.update(setting.confirmedKey, true);
    return true;
  }

  if (accepted === "既存はOFFのまま") {
    const updated = await keepExistingMemosDisabled(setting.key, () => assertActive(context));
    assertActive(context);
    await context.workspaceState.update(setting.confirmedKey, true);
    assertActive(context);
    vscode.window.showInformationMessage(
      `既存メモ${updated}件はOFFのままにしました。今後追加するメモには全体設定が適用されます。`,
    );
    return true;
  }

  if (!beforeEnable) await config.update(setting.key, false, vscode.ConfigurationTarget.Workspace);
  return false;
}

const queues = new WeakMap();
function enqueueSetting(context, action) {
  const job = (queues.get(context) || Promise.resolve()).catch(() => undefined).then(() => {
    assertActive(context);
    return action();
  });
  queues.set(context, job);
  const cleanup = () => { if (queues.get(context) === job) queues.delete(context); };
  job.then(cleanup, cleanup);
  return job;
}

function setMemoAutoSyncDefault(context, key, enabled) {
  const setting = SETTINGS.find((item) => item.key === key);
  if (!setting || typeof enabled !== "boolean") return Promise.reject(new Error("自動反映設定を確認してください。"));
  return enqueueSetting(context, async () => {
    const config = vscode.workspace.getConfiguration("mojigoto");
    if (config.get(key, false) === enabled) return { cancelled: false };
    if (enabled && !(await confirmFirstEnable(context, setting, true))) return { cancelled: true };
    assertActive(context);
    await config.update(key, enabled, vscode.ConfigurationTarget.Workspace);
    return { cancelled: false };
  });
}

function registerMemoAutoSyncSettings(context) {
  const state = lifecycle(context);
  const report = (error) => {
    if (!state.disposed) vscode.window.showErrorMessage(`自動反映設定を更新できませんでした: ${error.message || error}`);
  };
  const enqueue = (setting) => {
    if (state.disposed) return;
    enqueueSetting(context, async () => {
      try {
        await confirmFirstEnable(context, setting);
      } catch (error) {
        if (state.disposed) return;
        try {
          await vscode.workspace.getConfiguration("mojigoto").update(setting.key, false, vscode.ConfigurationTarget.Workspace);
        } catch (rollbackError) {
          report(new Error(`${error.message || error}（設定をOFFへ戻せませんでした: ${rollbackError.message || rollbackError}）`));
          return;
        }
        report(error);
      }
    }).catch(report);
  };

  for (const setting of SETTINGS) enqueue(setting);

  context.subscriptions.push(
    { dispose() { state.disposed = true; } },
    vscode.workspace.onDidChangeConfiguration((event) => {
      for (const setting of SETTINGS) {
        if (event.affectsConfiguration(`mojigoto.${setting.key}`)) {
          enqueue(setting);
        }
      }
    }),
  );
}

module.exports = { registerMemoAutoSyncSettings, setMemoAutoSyncDefault };
