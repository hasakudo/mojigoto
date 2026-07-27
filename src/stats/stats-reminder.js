const vscode = require("vscode");
const { sheetsEnabled, webhookEventsMode } = require("./stats-config");
const { gsGet, gsSet } = require("./stats-utils");

const {
  keyEvents,
  keyEventsLastSendAt,
  keyEventsLastRemindAt,
} = require("./stats-keys");

function getPendingEventsCount(context) {
  const events = gsGet(context, keyEvents(context), []);
  if (!Array.isArray(events) || events.length === 0) return 0;

  let count = 0;
  for (const ev of events) {
    if (ev && !ev.sent) count += 1;
  }
  return count;
}

function getEventsRemindMode() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  return String(cfg.get("webhookEventsRemindMode", "off") || "off");
}

function daysSince(ts) {
  if (!ts) return Infinity;

  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return Infinity;

  return (Date.now() - value) / (1000 * 60 * 60 * 24);
}

async function maybeRemindEventsSend(context, reason = "") {
  try {
    if (!sheetsEnabled()) return;

    const mode = getEventsRemindMode();
    if (mode === "off") return;

    const pending = getPendingEventsCount(context);
    if (pending <= 0) return;

    const thresholdDays = mode === "weekly" ? 7 : 30;

    const lastSendAt = gsGet(context, keyEventsLastSendAt(context), 0);
    const daysFromLastSend = daysSince(lastSendAt);
    if (daysFromLastSend < thresholdDays) return;

    // 通知しすぎ防止：1日1回まで
    const lastRemindAt = gsGet(context, keyEventsLastRemindAt(context), 0);
    if (daysSince(lastRemindAt) < 1) return;

    await gsSet(context, keyEventsLastRemindAt(context), Date.now());

    const eventsMode = webhookEventsMode();
    const extra =
      eventsMode === "off"
        ? "（※ 現在「Webhook Events Mode」が off です。送信するなら onCommand にするのがおすすめ）"
        : "";

    const elapsedText = Number.isFinite(daysFromLastSend)
      ? `最後の送信から ${Math.floor(daysFromLastSend)} 日経過しています。`
      : "まだ送信履歴がありません。";

    const message =
      `日時ログの未送信が ${pending} 件あります。` + ` ${elapsedText}` + extra;

    const goSend = "今送信";
    const openSettings = "設定を開く";
    const later = "後で";

    const picked = await vscode.window.showInformationMessage(
      message,
      goSend,
      openSettings,
      later,
    );

    if (picked === goSend) {
      await vscode.commands.executeCommand("mojigoto.sendMojigotoEvents");
      return;
    }

    if (picked === openSettings) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "mojigoto.webhookEventsMode",
      );
    }
  } catch (e) {
    try {
      const cfg = vscode.workspace.getConfiguration("mojigoto");
      const debug = !!cfg.get("debug", false);
      if (debug) {
        console.log("[mojigoto] maybeRemindEventsSend error:", e, reason);
      }
    } catch {}
  }
}

module.exports = {
  getPendingEventsCount,
  getEventsRemindMode,
  daysSince,
  maybeRemindEventsSend,
};
