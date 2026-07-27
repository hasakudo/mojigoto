const vscode = require("vscode");

function getStatsConfig() {
  return vscode.workspace.getConfiguration("mojigoto");
}

function getWebhookUrl() {
  return String(getStatsConfig().get("webhookUrl", "") || "").trim();
}

function getWebhookSecret() {
  return String(getStatsConfig().get("webhookSecret", "") || "").trim();
}

function sheetsEnabled() {
  return !!getStatsConfig().get("sheetsEnabled", false);
}

function webhookEnabledOnSave() {
  if (!sheetsEnabled()) return false;
  return !!getStatsConfig().get("webhookSendOnSave", true);
}

function webhookProgressMode() {
  const cfg = getStatsConfig();
  const m = String(cfg.get("webhookProgressMode", "") || "").trim();
  if (m === "off" || m === "onSave") return m;
  return cfg.get("webhookSendProgressOnSave", true) ? "onSave" : "off";
}

function webhookEventsMode() {
  const v = String(getStatsConfig().get("webhookEventsMode", "onSave") || "onSave");
  return v === "off" || v === "onSave" || v === "onCommand" ? v : "onSave";
}

function shouldSendProgressOnSave() {
  if (!sheetsEnabled()) return false;
  if (!webhookEnabledOnSave()) return false;
  return webhookProgressMode() === "onSave";
}

function shouldSendEventsOnSave() {
  if (!sheetsEnabled()) return false;
  if (!webhookEnabledOnSave()) return false;
  return webhookEventsMode() === "onSave";
}

function getStatsRetentionSettings() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");

  const eventLogIntervalMinutes =
    Number(cfg.get("eventLogIntervalMinutes", 5)) || 0;
  const eventsMaxCount = Math.max(
    0,
    Number(cfg.get("eventsMaxCount", 4000)) || 4000,
  );
  const eventsRetentionDays = Math.max(
    0,
    Number(cfg.get("eventsRetentionDays", 90)) || 90,
  );
  const dailyRetentionDays = Math.max(
    0,
    Number(cfg.get("dailyRetentionDays", 365)) || 365,
  );

  return {
    eventLogIntervalMinutes,
    eventLogIntervalMs: eventLogIntervalMinutes * 60 * 1000,
    eventsMaxCount,
    eventsRetentionDays,
    dailyRetentionDays,
  };
}

module.exports = {
  getStatsConfig,
  getWebhookUrl,
  getWebhookSecret,
  sheetsEnabled,
  webhookEnabledOnSave,
  webhookProgressMode,
  webhookEventsMode,
  shouldSendProgressOnSave,
  shouldSendEventsOnSave,
  getStatsRetentionSettings,
};