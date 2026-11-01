const vscode = require("vscode");

function readBackupSettings(configuration = vscode.workspace.getConfiguration?.("mojigoto")) {
  const interval = Number(configuration?.get("backupIntervalMinutes", 0));
  const limit = configuration?.get("backupMaxPerFile", 50);
  return {
    intervalMinutes: Number.isFinite(interval) ? Math.max(0, Math.min(1440, interval)) : 0,
    maxPerFile: Number.isInteger(limit) && limit >= 1 && limit <= 50 ? limit : 50,
  };
}

module.exports = { readBackupSettings };
