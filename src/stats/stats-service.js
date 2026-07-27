const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const {
  nowJstParts,
  gsGet,
  gsSet,
  pruneDateMapByRetentionDays,
  ensureDailyObj,
  ensureFilesObj,
  pruneEventsByPolicy,
} = require("./stats-utils");

const {
  getStatsRetentionSettings,
  sheetsEnabled,
  shouldSendProgressOnSave,
  shouldSendEventsOnSave,
  webhookEventsMode,
  getWebhookUrl,
  getWebhookSecret,
} = require("./stats-config");

const {
  keyDaily,
  keyFiles,
  keyEvents,
  keyEventsLastLoggedAt,
} = require("./stats-keys");

const { countLikeCountChars } = require("../core/text-count");
const {
  getCurrentWorkDisplayName,
  getWorkId,
  getCurrentWorkGoal,
} = require("../work/work-settings");

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listTextFiles(dirPath) {
  const result = [];
  const exts = new Set([".txt", ".md"]);

  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
        result.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return result;
}

function countChars(text) {
  return countLikeCountChars(text);
}

function diffKeyForWork(context, scope, key) {
  const workName = String(
    context.globalState.get("mojigoto.currentWorkName", "") || "default",
  );
  return `mojigoto.diff.${workName}.${scope}.${key}`;
}

function detectChapter(root, filePath) {
  try {
    const rel = path.relative(root, filePath);
    if (!rel || rel.startsWith("..")) return null;
    const first = rel.split(path.sep)[0];
    return first && first !== path.basename(filePath) ? first : null;
  } catch {
    return null;
  }
}

async function resetDiffForCurrentWork(context) {
  const root = String(
    vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ||
      "",
  ).trim();
  if (!root || !fs.existsSync(root)) return;

  // その作品の現時点を prev として保存（差分ゼロ開始）
  let total = 0;
  for (const f of listTextFiles(root)) total += countChars(safeRead(f));
  await context.globalState.update(
    diffKeyForWork(context, "total", "all"),
    total,
  );

  // 章は「今開いてる章」だけ合わせる（軽量）
  const ed = vscode.window.activeTextEditor;
  const p = ed?.document?.uri?.fsPath || "";
  const chap = p ? detectChapter(root, p) : null;
  if (chap) {
    const chapDir = path.join(root, chap);
    let sum = 0;
    for (const f of listTextFiles(chapDir)) sum += countChars(safeRead(f));
    await context.globalState.update(
      diffKeyForWork(context, "chap", chap),
      sum,
    );
  }
}

function getDashboardNotesPlaceholder() {
  return {
    normal: [],
    list: [],
    todo: [],
  };
}

// ===============================
// helper
// ===============================

function isDebug() {
  try {
    return !!vscode.workspace.getConfiguration("mojigoto").get("debug", false);
  } catch {
    return false;
  }
}

const _saveGuard = new Map();
function saveGuardShouldSkip(fsPath, windowMs = 800) {
  const now = Date.now();
  const last = _saveGuard.get(fsPath) || 0;
  if (now - last < windowMs) return true;
  _saveGuard.set(fsPath, now);
  return false;
}

function safeRelPath(root, absPath) {
  try {
    if (!root || !absPath) return "";
    const rel = path.relative(root, absPath);

    return rel.replace(/\\/g, "/");
  } catch {
    return "";
  }
}

function detectChapterFromRoot(root, filePath) {
  const chap = detectChapter(root, filePath);
  return chap || "（章なし）";
}

// ===============================
// Log on Save
// ===============================

async function logOnSave(context, doc) {
  try {
    if (!doc) return;

    const p = doc.uri?.fsPath || "";

    console.log("[mojigoto] onDidSave fired", {
      file: doc.uri.fsPath,
      t: Date.now(),
      version: doc.version,
    });

    if (saveGuardShouldSkip(p, 800)) {
      if (isDebug()) console.log("[mojigoto] saveGuard skip", p);
      return;
    }

    const low = p.toLowerCase();
    if (!(low.endsWith(".txt") || low.endsWith(".md"))) return;

    const cfg = vscode.workspace.getConfiguration("mojigoto");
    const root = String(cfg.get("manuscriptRoot", "") || "").trim();
    const goal = getCurrentWorkGoal(context);

    if (!root || !fs.existsSync(root)) return;

    const rel = safeRelPath(root, p);
    if (!rel || rel.startsWith("..")) return;

    const chap = detectChapterFromRoot(root, p) || "";

    const totalCount = await calcTotalCount(root);
    const chapTotal = chap ? await calcChapterTotal(root, chap) : 0;

    const nowMs = Date.now();
    const { dateJst, dateTimeJst } = nowJstParts(new Date(nowMs));

    const prevTotal = gsGet(
      context,
      diffKeyForWork(context, "total", "all"),
      0,
    );
    const prevChap = chap
      ? gsGet(context, diffKeyForWork(context, "chap", chap), 0)
      : 0;

    const deltaTotal = totalCount - prevTotal;
    const deltaChap = chap ? chapTotal - prevChap : 0;

    const {
      eventLogIntervalMinutes,
      eventsMaxCount,
      eventsRetentionDays,
      dailyRetentionDays,
    } = getStatsRetentionSettings();

    const eventLogIntervalMs = eventLogIntervalMinutes * 60 * 1000;
    
    // -------------------------------
    // daily（進捗データ）: 365日などで整理
    // -------------------------------
    const dailyRaw = gsGet(context, keyDaily(context), {});
    const daily = pruneDateMapByRetentionDays(dailyRaw, dailyRetentionDays);

    const row = ensureDailyObj(daily, dateJst);
    row.deltaTotal += deltaTotal;
    row.totalSaved = totalCount;
    row.goal = goal;
    row.pct =
      goal > 0 ? Math.max(0, Math.min(999, (totalCount / goal) * 100)) : 0;

    if (chap) {
      if (!row.chapters[chap]) row.chapters[chap] = { delta: 0, total: 0 };
      row.chapters[chap].delta += deltaChap;
      row.chapters[chap].total = chapTotal;
    }
    row.updatedAtJst = dateTimeJst;

    await gsSet(context, keyDaily(context), daily);

    // -------------------------------
    // Progress は毎回送信
    // -------------------------------
    if (shouldSendProgressOnSave()) {
      const url = getWebhookUrl();
      const secret = getWebhookSecret();
      const projectName = getProjectName(context);
      const projectKey = getWorkId(context);

      if (url && secret && projectName) {
        const dailyValue = row.deltaTotal ?? 0;

        const okPr = await postJsonToUrl(url, {
          type: "progress",
          secret,
          project: projectName,
          projectKey,
          date: dateJst,
          total: totalCount,
          daily: dailyValue,
          updatedAt: Date.now(),
        });

        if (!okPr) {
          try {
            if (isDebug()) console.log("[mojigoto] webhook progress failed");
          } catch {}
        }
      }
    }

    // -------------------------------
    // files（更新ファイル履歴）: 365日などで整理
    // -------------------------------
    const filesRaw = gsGet(context, keyFiles(context), {});
    const files = pruneDateMapByRetentionDays(filesRaw, dailyRetentionDays);

    ensureFilesObj(files, dateJst)[rel] = 1;
    await gsSet(context, keyFiles(context), files);

    // -------------------------------
    // events（日時ログ）: 間隔に応じて間引き
    // -------------------------------
    const lastLoggedAt =
      Number(gsGet(context, keyEventsLastLoggedAt(context), 0)) || 0;
    const shouldStoreEvent =
      eventLogIntervalMs <= 0 ||
      !lastLoggedAt ||
      nowMs - lastLoggedAt >= eventLogIntervalMs;

    let events = pruneEventsByPolicy(
      gsGet(context, keyEvents(context), []),
      eventsMaxCount,
      eventsRetentionDays,
    );

    if (shouldStoreEvent) {
      events.push({
        savedAtJst: dateTimeJst,
        dateJst,
        file: rel,
        chapter: chap,
        deltaTotal,
        totalSaved: totalCount,
        deltaChap,
        chapTotalSaved: chapTotal,
        sent: false,
      });

      await gsSet(context, keyEventsLastLoggedAt(context), nowMs);

      // ---- Apps Script webhook: 日時ログ（Daily_Log） ----
      if (shouldSendEventsOnSave()) {
        try {
          const url = getWebhookUrl();
          const secret = getWebhookSecret();
          const projectName = getProjectName(context);
          const projectKey = getWorkId(context);

          if (url && secret && projectName) {
            const payloadEv = {
              type: "mojigoto_event",
              secret,
              project: projectName,
              projectKey,

              savedAtJst: dateTimeJst,
              dateJst,
              file: rel,
              chapter: chap,
              deltaTotal,
              totalSaved: totalCount,
              deltaChap,
              chapTotalSaved: chapTotal,
            };

            const okEv = await postJsonToUrl(url, payloadEv);

            if (okEv) {
              const last = events[events.length - 1];
              if (
                last &&
                last.savedAtJst === dateTimeJst &&
                last.file === rel
              ) {
                last.sent = true;
              }
            } else {
              try {
                if (isDebug())
                  console.log("[mojigoto] webhook mojigoto_event failed");
              } catch {}
            }
          }
        } catch (e) {
          try {
            if (isDebug())
              console.log(
                "[mojigoto] webhook mojigoto_event exception:",
                String(e),
              );
          } catch {}
        }
      }
    } else {
      if (isDebug()) {
        console.log("[mojigoto] event log skipped by interval", {
          file: rel,
          intervalMs: eventLogIntervalMs,
          lastLoggedAt,
          nowMs,
        });
      }
    }

    // 4000件 または 90日 を超えたものを整理
    events = pruneEventsByPolicy(events, eventsMaxCount, eventsRetentionDays);
    await gsSet(context, keyEvents(context), events);

    await context.globalState.update(
      diffKeyForWork(context, "total", "all"),
      totalCount,
    );
    if (chap) {
      await context.globalState.update(
        diffKeyForWork(context, "chap", chap),
        chapTotal,
      );
    }

    // refreshStatsPanel(context);

    // 送信忘れ通知（未送信がある場合のみ）
    // await maybeRemindEventsSend(context, "onSave");
  } catch (e) {
    try {
      if (isDebug()) console.log("[mojigoto] logOnSave error:", e);
    } catch {}
  }
}

async function sendUnsyncedMojigotoEventsToWebhook(context) {
  if (!sheetsEnabled())
    throw new Error("Sheets送信がOFFです（mojigoto.sheetsEnabled）");
  if (webhookEventsMode() === "off")
    throw new Error(
      "日時ログの送信モードが off です（mojigoto.webhookEventsMode）",
    );
  const url = getWebhookUrl();
  const secret = getWebhookSecret();
  const projectName = getProjectName(context);
  const projectKey = getWorkId(context);
  if (!url || !secret || !projectName)
    throw new Error("webhookUrl / webhookSecret / projectName が未設定です");

  const events = gsGet(context, keyEvents(context), []);
  if (!Array.isArray(events) || events.length === 0) return { sent: 0 };

  let sent = 0;
  for (const ev of events) {
    if (ev && ev.sent === true) continue;

    const ok = await postJsonToUrl(url, {
      type: "mojigoto_event",
      secret,
      project: projectName,
      projectKey,
      ...ev,
    });

    if (ok) {
      ev.sent = true;
      sent++;
    }
  }

  await gsSet(context, keyEvents(context), events);
  return { sent };
}

async function calcTotalCount(root) {
  let sum = 0;
  for (const f of listTextFiles(root)) {
    sum += countChars(safeRead(f));
  }
  return sum;
}

async function calcChapterTotal(root, chap) {
  if (chap === "（章なし）") {
    let sum = 0;
    try {
      const ents = fs.readdirSync(root, { withFileTypes: true });
      for (const e of ents) {
        if (e.isFile() && e.name.toLowerCase().endsWith(".txt")) {
          sum += countChars(safeRead(path.join(root, e.name)));
        }
      }
    } catch {}
    return sum;
  }

  const dir = path.join(root, chap);
  if (!fs.existsSync(dir)) return 0;

  let sum = 0;
  for (const f of listTextFiles(dir)) {
    sum += countChars(safeRead(f));
  }
  return sum;
}

async function postJsonToUrl(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    if (isDebug()) {
      console.log("[mojigoto] webhook response", {
        status: res.status,
        okHttp: res.ok,
        body: text,
      });
    }

    // HTTP成功 かつ GAS本文の ok が true のときだけ成功扱い
    return !!res.ok && !!json?.ok;
  } catch (e) {
    if (isDebug()) {
      console.log("[mojigoto] postJsonToUrl error:", String(e));
    }
    return false;
  }
}

function getProjectName(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const v = String(cfg.get("projectName", "") || "").trim();
  if (v) return v;

  const displayName = String(getCurrentWorkDisplayName(context) || "").trim();
  if (displayName) return displayName;

  return "Project";
}

async function ensureProjectNameFilled(context, reason = "") {
  // NOTE:
  // projectName 設定はユーザーの任意入力。
  // 空の場合は送信時に「現在の作品名」を自動使用するが、設定値自体は書き換えない（作品切替で意図しない固定化を防ぐ）。
  try {
    if (!sheetsEnabled()) return;
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    const cur = String(cfg.get("projectName", "") || "").trim();
    if (cur) return;
    const inferred = String(getCurrentWorkDisplayName(context) || "").trim();
    if (!inferred) return;
    context.globalState.update("mojigoto.lastInferredProjectName", inferred);
    if (isDebug())
      console.log(
        "[mojigoto] projectName inferred (not saved):",
        inferred,
        reason,
      );
  } catch {}
}

module.exports = {
  resetDiffForCurrentWork,
  logOnSave,
  sendUnsyncedMojigotoEventsToWebhook,
  calcTotalCount,
  calcChapterTotal,
  getCurrentWorkGoal,
  getProjectName,
  ensureProjectNameFilled,
  getDashboardNotesPlaceholder,
};
