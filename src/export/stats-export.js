const vscode = require("vscode");
const fsp = require("fs/promises");
const path = require("path");

const { gsGet, gsSet, nowJstParts } = require("../stats/stats-utils");

const {
  keyDaily,
  keyEvents,
  keyEventsLastSendAt,
} = require("../stats/stats-keys");

const { getWebhookUrl, getWebhookSecret } = require("../stats/stats-config");
const { getProjectName } = require("../stats/stats-service");
const { getWorkId, getCurrentWorkGoal } = require("../work/work-settings");

const {
  ensureStatsOutDir,
} = require("./manuscript-export");

async function postJsonToUrl(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ===============================
// CSV Export
// ===============================
function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

async function exportStatsCsv(context) {
  const outDir = await ensureStatsOutDir(context);
  if (!outDir) return;

  const daily = gsGet(context, keyDaily(context), {});
  const currentGoal = getCurrentWorkGoal(context, { gsGet });
  const { dateTimeJst } = nowJstParts(new Date());

  const headerDaily = [
    "日付",
    "出力日時(JST)",
    "総差分",
    "総文字数(最終保存)",
    "目標",
    "進捗(%)",
  ];

  const dates = Object.keys(daily).sort();
  const rowsDaily = [headerDaily];

  for (const d of dates) {
    const row = daily[d] || {};

    const goal = Number(currentGoal ?? 0) || Number(row.goal ?? 0) || 0;
    const totalSaved = Number(row.totalSaved ?? 0) || 0;
    const pct =
      goal > 0
        ? Math.max(0, Math.min(999, (totalSaved / goal) * 100))
        : Number(row.pct || 0);

    rowsDaily.push([
      d,
      dateTimeJst,
      row.deltaTotal ?? 0,
      totalSaved,
      goal,
      Number.isFinite(pct) ? pct.toFixed(1) : "",
    ]);
  }

  try {
    await fsp.mkdir(outDir, { recursive: true });

    const p1 = path.join(outDir, "daily_summary.csv");

    await fsp.writeFile(p1, "\uFEFF" + toCsv(rowsDaily), "utf8");

    vscode.window
      .showInformationMessage(
        `もじごと: CSV を出力しました（${path.basename(outDir)}）`,
        "フォルダを開く",
      )
      .then(async (v) => {
        if (v === "フォルダを開く") {
          try {
            await vscode.commands.executeCommand(
              "revealFileInOS",
              vscode.Uri.file(p1),
            );
          } catch {}
        }
      });
  } catch (e) {
    vscode.window.showErrorMessage(
      `もじごと: CSV 出力に失敗しました: ${String(e)}`,
    );
  }
}

async function sendPendingMojigotoEvents(context) {
  try {
    const url = getWebhookUrl();
    const secret = getWebhookSecret();
    const projectName = getProjectName(context);
    const projectKey = getWorkId(context);

    if (!url || !secret || !projectName) {
      return {
        ok: false,
        sent: 0,
        pending: 0,
        error: "Missing webhookUrl/webhookSecret/projectName",
      };
    }

    const events = gsGet(context, keyEvents(context), []);
    if (!Array.isArray(events) || events.length === 0) {
      return { ok: true, sent: 0, pending: 0 };
    }

    const pendingIdx = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || ev.sent) continue;
      pendingIdx.push(i);
    }

    const pending = pendingIdx.length;
    if (pending === 0) return { ok: true, sent: 0, pending: 0 };

    const LIMIT = 200;
    const targets = pendingIdx.slice(0, LIMIT);

    let sentCount = 0;

    for (const i of targets) {
      const ev = events[i];

      const ok = await postJsonToUrl(url, {
        type: "mojigoto_event",
        secret,
        project: projectName,
        projectKey,
        savedAtJst: String(ev.savedAtJst || ""),
        dateJst: String(ev.dateJst || ""),
        file: String(ev.file || ""),
        chapter: String(ev.chapter || ""),
        deltaTotal: Number(ev.deltaTotal),
        totalSaved: Number(ev.totalSaved),
        deltaChap: Number(ev.deltaChap),
        chapTotalSaved: Number(ev.chapTotalSaved),
      });

      if (ok) {
        ev.sent = true;
        sentCount++;
      } else {
        await gsSet(context, keyEvents(context), events);
        return {
          ok: false,
          sent: sentCount,
          pending,
          error: "HTTP failed while sending DailyLog",
        };
      }
    }

    await gsSet(context, keyEvents(context), events);
    if (sentCount > 0) {
      await gsSet(context, keyEventsLastSendAt(context), Date.now());
    }

    return { ok: true, sent: sentCount, pending };
  } catch (e) {
    return { ok: false, sent: 0, pending: 0, error: String(e) };
  }
}

module.exports = {
  csvEscape,
  toCsv,
  exportStatsCsv,
  sendPendingMojigotoEvents,
};
