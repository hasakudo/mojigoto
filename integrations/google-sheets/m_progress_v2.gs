/**
 * @OnlyCurrentDoc
 */

const MOJIGOTO_PROTOCOL_VERSION = 2;
const MOJIGOTO_EVENT_BATCH_LIMIT = 50;

/**
 * Mojigoto Sheet Template - Webhook Receiver
 * Sheets:
 *  - Progress (upsert by date+project)
 *  - Daily_Log (append)
 *  - Monthly / Year / Dashboard are formula-based (setupReportsで生成)
 *
 * Notes:
 * - Locale-safe formulas: argument separator and array separators differ by spreadsheet locale.
 *   This script generates formulas using the spreadsheet's locale separator.
 */

function setup() {
  const props = PropertiesService.getScriptProperties();

  if (!props.getProperty("TZ")) props.setProperty("TZ", "Asia/Tokyo");
  if (!props.getProperty("SHEET_PROGRESS"))
    props.setProperty("SHEET_PROGRESS", "Progress");
  if (!props.getProperty("SHEET_EVENTS"))
    props.setProperty("SHEET_EVENTS", "Daily_Log");
  if (!props.getProperty("DEBUG_LOG")) props.setProperty("DEBUG_LOG", "0"); // "1"でDebugシートに追記

  if (!props.getProperty("SECRET")) {
    const secret = Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty("SECRET", secret);
  }

  // Setup シート（SECRET等＋導入手順）
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, "Setup");

  let currentWebAppUrl = "";
  let currentOfficialUrl = "https://mojigoto.hasakudo.com";
  if (sh.getLastRow() >= 2) {
    const values = sh
      .getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2)
      .getValues();
    for (const row of values) {
      if (String(row[0]).trim() === "WEB_APP_URL（控え）") {
        currentWebAppUrl = String(row[1] || "");
      }
      if (String(row[0]).trim() === "公式サイトURL") {
        currentOfficialUrl =
          String(row[1] || "").trim() || currentOfficialUrl;
      }
    }
  }

  sh.clear();

  sh.getRange(1, 1, 1, 2).setValues([["KEY", "VALUE"]]);
  sh.getRange(2, 1, 8, 2).setValues([
    ["TZ", props.getProperty("TZ")],
    ["SHEET_PROGRESS", props.getProperty("SHEET_PROGRESS")],
    ["SHEET_EVENTS", props.getProperty("SHEET_EVENTS")],
    ["SECRET", props.getProperty("SECRET")],
    ["DEBUG_LOG", props.getProperty("DEBUG_LOG")],
    ["PROTOCOL_VERSION", String(MOJIGOTO_PROTOCOL_VERSION)],
    ["WEB_APP_URL（控え）", currentWebAppUrl],
    ["公式サイトURL", currentOfficialUrl],
  ]);

  // 導入手順（右側にメモとして出す）
  const howto = [
    "◆ 生成されるシートは「Setup / Progress / Daily_Log / Monthly / Year / Dashboard / Project_View」です。",
    "◆ シートは更新時に上書きされる場合があるため、そのほかのデータは別シートに作成してください。",
    "",
    "■ 注意",
    "- アクセスを『全員』にする代わりに、SECRET が一致しないリクエストは拒否します。",
    "- SECRET は第三者に共有しないでください。",
    "",
    "■ DEBUG_LOGは任意です。",
    "- Setup シートで DEBUG_LOGの VALUE を 1 にする。",
    "- Apps Scriptで applySetupValues を実行",
    "- webhook エラーや受信時に Debug シートが作られる。",
    "",
    "■ 並べ替え機能",
    "シート上部メニューに「もじごと」が追加されます。",
    "Daily_Log / Progress の並び替えをメニューから実行できます。",
    "例：",
    "もじごと → Daily_Log：最新順",
    "",
    "■ シート修正機能",
    "シート上部メニュー「もじごと」から実行可能",
    "作品名、作品フォルダの変更により、作品名/作品キーが意図したものではない場合",
    "Daily_Log / Progress の 作品名/作品キーを統一修正することができます。",
    "自動生成される Project_Identity_Audit シートで手動変更も可能です。",
    "実行後に Apps Scriptで setupReports を実行するとMonthly / Year / Dashboard 側にも反映されます。",
    "",
    "そのほか機能詳細、手順などは同梱の README.md を確認ください。",
  ];
  sh.getRange(1, 4).setValue("HOWTO");
  sh.getRange(2, 4, howto.length, 1).setValues(howto.map((s) => [s]));
  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("B:B").setNumberFormat("@");
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 4, 110);
  sh.setColumnWidth(1, 170); // KEY
  sh.setColumnWidth(2, 850); // VALUE
  sh.setColumnWidth(3, 30); // 空白
  sh.setColumnWidth(4, 150); // HOWTO
  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 26);
}

/**
 * セットアップ（最小構成）
 * - Setup / Progress / Daily_Log を作成（不足分は補完）
 */
function setupMinimum() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setup(); // Setupシート（SECRET等）を作る

  const progress = getOrCreateSheet_(ss, "Progress");
  ensureProgressHeader_(progress);

  const events = getOrCreateSheet_(ss, "Daily_Log");
  ensureEventsHeader_(events);

  return true;
}

/**
 * セットアップ（配布テンプレ想定：全タブ生成）
 * - setupMinimum + Monthly/Dashboard を生成
 */
function setupAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupMinimum();
  setupReports();
  onOpen();
  return true;
}

/**
 * Web app health check
 */
function doGet() {
  return json_({
    ok: true,
    service: "mojigoto-sheets",
    protocolVersion: MOJIGOTO_PROTOCOL_VERSION,
  });
}

/**
 * Web app entry
 */
function doPost(e) {
  let lock = null;
  try {
    const props = PropertiesService.getScriptProperties();
    const SECRET = String(props.getProperty("SECRET") || "");
    const TZ = String(props.getProperty("TZ") || "Asia/Tokyo");
    const SHEET_PROGRESS = String(
      props.getProperty("SHEET_PROGRESS") || "Progress",
    );
    const SHEET_EVENTS = String(
      props.getProperty("SHEET_EVENTS") || "Daily_Log",
    );
    const DEBUG_LOG = String(props.getProperty("DEBUG_LOG") || "0") === "1";

    const payload = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : "{}",
    );

    if (!SECRET || String(payload.secret || "") !== SECRET) {
      debug_(DEBUG_LOG, "Forbidden", payload);
      return json_({ ok: false, error: "Forbidden" });
    }

    const type = String(payload.type || "progress");

    if (type === "ping") {
      return json_({
        ok: true,
        type: "ping",
        service: "mojigoto-sheets",
        protocolVersion: MOJIGOTO_PROTOCOL_VERSION,
        capabilities: ["progress", "event", "events_batch", "event_idempotency"],
      });
    }

    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return json_({ ok: false, error: "Busy", retryable: true });
    }

    if (type === "progress") {
      return handleProgress_(payload, { TZ, SHEET_PROGRESS, DEBUG_LOG });
    }

    if (type === "mojigoto_event") {
      return handleMojigotoEvent_(payload, { SHEET_EVENTS, DEBUG_LOG });
    }

    if (type === "mojigoto_events_batch") {
      return handleMojigotoEventsBatch_(payload, { SHEET_EVENTS, DEBUG_LOG });
    }

    debug_(DEBUG_LOG, "Unknown type", payload);
    return json_({ ok: false, error: "Unknown type" });
  } catch (err) {
    try {
      debug_(true, "doPost exception", { err: String(err) });
    } catch {}
    return json_({ ok: false, error: String(err), retryable: false });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

// -------------------------
// progress（upsert）
// -------------------------
function handleProgress_(payload, opt) {
  const TZ = opt.TZ;
  const SHEET_PROGRESS = opt.SHEET_PROGRESS;
  const DEBUG_LOG = !!opt.DEBUG_LOG;

  const dateStr = String(payload.date || "");
  const total = Number(payload.total);
  const daily = Number(payload.daily);
  const project = String(payload.project || "").trim();
  const projectKey = String(payload.projectKey || "").trim();
  const updatedAtRaw = payload.updatedAt;

  if (
    !dateStr ||
    !Number.isFinite(total) ||
    !Number.isFinite(daily) ||
    !project
  ) {
    debug_(DEBUG_LOG, "progress missing fields", payload);
    return json_({
      ok: false,
      error: "Missing fields (date/total/daily/project)",
    });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, SHEET_PROGRESS);
  ensureProgressHeader_(sh);

  const dateObj = parseYmd_(dateStr);
  const row = findRowByDateAndProject_(sh, dateObj, project, projectKey, TZ);
  const targetRow = row === null ? sh.getLastRow() + 1 : row;

  if (row === null) sh.getRange(targetRow, 1).setValue(dateObj);

  sh.getRange(targetRow, 2).setValue(total);
  sh.getRange(targetRow, 3).setValue(daily);
  sh.getRange(targetRow, 5).setValue(project);
  sh.getRange(targetRow, 6).setValue(projectKey);

  const days = countDataRowsByProject_(sh, projectKey, project, TZ);
  sh.getRange(targetRow, 4).setValue(days);

  const ua = parseUpdatedAt_(updatedAtRaw) || new Date();
  sh.getRange(targetRow, 7).setValue(ua);

  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  debug_(DEBUG_LOG, "progress ok", {
    dateStr,
    total,
    daily,
    project,
    projectKey,
    targetRow,
    updatedAt: ua,
  });
  return json_({ ok: true, type: "progress" });
}

/**
 * Progress のヘッダー/列数を必ず 6 列に揃える（既存シートでも列追加する）
 */
function ensureProgressHeader_(sh) {
  const WANT_COLS = 7;
  const headersWanted = [
    "日付",
    "合計文字数",
    "本日の文字数",
    "執筆日数",
    "作品名",
    "作品キー",
    "最終保存日時",
  ];

  const curCols = Math.max(1, sh.getLastColumn());
  if (curCols < WANT_COLS) {
    sh.insertColumnsAfter(curCols, WANT_COLS - curCols);
  }

  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, WANT_COLS).setValues([headersWanted]);
    sh.setFrozenRows(1);
  } else {
    const current = sh.getRange(1, 1, 1, WANT_COLS).getValues()[0];
    let changed = false;
    for (let i = 0; i < WANT_COLS; i++) {
      const want = headersWanted[i];
      const v = String(current[i] || "").trim();
      if (v !== want) {
        current[i] = want;
        changed = true;
      }
    }
    if (changed) sh.getRange(1, 1, 1, WANT_COLS).setValues([current]);
    sh.setFrozenRows(1);
  }

  sh.setColumnWidths(1, 7, 110);
  sh.setColumnWidth(1, 110); // 日付
  sh.setColumnWidth(2, 110); // 合計
  sh.setColumnWidth(3, 110); // 本日の文字数
  sh.setColumnWidth(4, 90); // 執筆日数
  sh.setColumnWidth(5, 280); // 作品名
  sh.setColumnWidth(6, 220); // 作品キー
  sh.setColumnWidth(7, 150); // 最終保存日時

  sh.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  sh.getRange("B:B").setNumberFormat("#,##0");
  sh.getRange("C:D").setNumberFormat("#,##0");
  sh.getRange("G:G").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  if (!sh.getFilter()) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), 7).createFilter();
  }
}

// -------------------------
// Daily_Log/mojigoto_event（append）
// -------------------------
function handleMojigotoEvent_(payload, opt) {
  const SHEET_EVENTS = opt.SHEET_EVENTS;
  const DEBUG_LOG = !!opt.DEBUG_LOG;
  const parsed = parseMojigotoEvent_(payload);
  if (!parsed.ok) {
    debug_(DEBUG_LOG, "mojigoto_event missing fields", payload);
    return json_({ ok: false, error: parsed.error });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, SHEET_EVENTS);
  ensureEventsHeader_(sh);

  if (parsed.eventId && findEventRowById_(sh, parsed.eventId) !== null) {
    return json_({
      ok: true,
      type: "mojigoto_event",
      duplicate: true,
      eventId: parsed.eventId,
      protocolVersion: MOJIGOTO_PROTOCOL_VERSION,
    });
  }

  sh.appendRow(mojigotoEventRow_(parsed));

  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  debug_(DEBUG_LOG, "mojigoto_event ok", {
    eventId: parsed.eventId,
    savedAtJst: parsed.savedAtJst,
    project: parsed.project,
    projectKey: parsed.projectKey,
  });
  return json_({
    ok: true,
    type: "mojigoto_event",
    duplicate: false,
    eventId: parsed.eventId,
    protocolVersion: MOJIGOTO_PROTOCOL_VERSION,
  });
}

function handleMojigotoEventsBatch_(payload, opt) {
  const events = Array.isArray(payload.events) ? payload.events : [];
  if (!events.length || events.length > MOJIGOTO_EVENT_BATCH_LIMIT) {
    return json_({
      ok: false,
      error: "Events batch must contain 1-" + MOJIGOTO_EVENT_BATCH_LIMIT + " items",
    });
  }

  const parsedEvents = events.map((event) => parseMojigotoEvent_(event || {}));
  const invalidIndex = parsedEvents.findIndex((event) => !event.ok);
  if (invalidIndex >= 0) {
    return json_({
      ok: false,
      error: parsedEvents[invalidIndex].error,
      invalidIndex,
    });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, opt.SHEET_EVENTS);
  ensureEventsHeader_(sh);
  const knownIds = existingEventIds_(sh);
  const rows = [];
  let duplicates = 0;
  for (const event of parsedEvents) {
    if (event.eventId && knownIds.has(event.eventId)) {
      duplicates += 1;
      continue;
    }
    rows.push(mojigotoEventRow_(event));
    if (event.eventId) knownIds.add(event.eventId);
  }
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 11).setValues(rows);
    sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);
  }

  return json_({
    ok: true,
    type: "mojigoto_events_batch",
    processed: events.length,
    inserted: rows.length,
    duplicates,
    requestId: String(payload.requestId || ""),
    protocolVersion: MOJIGOTO_PROTOCOL_VERSION,
  });
}

function parseMojigotoEvent_(payload) {
  const event = {
    ok: true,
    savedAtJst: String(payload.savedAtJst || ""),
    dateJst: String(payload.dateJst || ""),
    file: String(payload.file || ""),
    chapter: String(payload.chapter || ""),
    deltaTotal: Number(payload.deltaTotal),
    totalSaved: Number(payload.totalSaved),
    deltaChap: Number(payload.deltaChap),
    chapTotalSaved: Number(payload.chapTotalSaved),
    project: String(payload.project || "").trim(),
    projectKey: String(payload.projectKey || "").trim(),
    eventId: String(payload.eventId || "").trim(),
  };
  if (!event.savedAtJst || !event.dateJst || !event.project) {
    return { ok: false, error: "Missing fields (savedAtJst/dateJst/project)" };
  }
  if (![event.deltaTotal, event.totalSaved, event.deltaChap, event.chapTotalSaved].every(Number.isFinite)) {
    return { ok: false, error: "Missing numeric fields" };
  }
  return event;
}

function mojigotoEventRow_(event) {
  return [
    event.savedAtJst,
    event.dateJst,
    event.file,
    event.chapter,
    event.deltaTotal,
    event.totalSaved,
    event.deltaChap,
    event.chapTotalSaved,
    event.project,
    event.projectKey,
    event.eventId,
  ];
}

function existingEventIds_(sh) {
  if (sh.getLastRow() < 2) return new Set();
  return new Set(sh.getRange(2, 11, sh.getLastRow() - 1, 1).getDisplayValues().flat().filter(String));
}

function findEventRowById_(sh, eventId) {
  if (!eventId || sh.getLastRow() < 2) return null;
  const match = sh
    .getRange(2, 11, sh.getLastRow() - 1, 1)
    .createTextFinder(eventId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : null;
}

function ensureEventsHeader_(sh) {
  const WANT_COLS = 11;
  const headersWanted = [
    "保存日時",
    "日付",
    "ファイル名",
    "章タイトル",
    "総差分",
    "総文字数",
    "章差分",
    "章総文字数",
    "作品名",
    "作品キー",
    "イベントID",
  ];

  const curCols = Math.max(1, sh.getLastColumn());
  if (curCols < WANT_COLS) {
    sh.insertColumnsAfter(curCols, WANT_COLS - curCols);
  }

  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, WANT_COLS).setValues([headersWanted]);
  } else {
    const current = sh.getRange(1, 1, 1, WANT_COLS).getValues()[0];
    let changed = false;
    for (let i = 0; i < WANT_COLS; i++) {
      const want = headersWanted[i];
      const v = String(current[i] || "").trim();
      if (v !== want) {
        current[i] = want;
        changed = true;
      }
    }
    if (changed) {
      sh.getRange(1, 1, 1, WANT_COLS).setValues([current]);
    }
  }

  sh.setFrozenRows(1);

  sh.setColumnWidths(1, 11, 110);
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 90);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 100);
  sh.setColumnWidth(5, 100);
  sh.setColumnWidth(6, 140);
  sh.setColumnWidth(7, 100);
  sh.setColumnWidth(8, 140);
  sh.setColumnWidth(9, 280);
  sh.setColumnWidth(10, 220);

  sh.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sh.getRange("B:B").setNumberFormat("yyyy-mm-dd");
  sh.getRange("E:H").setNumberFormat("#,##0");

  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  if (!sh.getFilter()) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), 10).createFilter();
  }
}

// -------------------------
// Reports (Monthly/Year/Dashboard)
// -------------------------
function setupReports() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupMonthly_(ss);
  setupYear_(ss);
  setupDashboard_(ss);
  setupProjectView_(ss);
}

function normalizeFormula_(s) {
  return String(s || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocaleSeps_(ss) {
  const loc = String(ss.getSpreadsheetLocale ? ss.getSpreadsheetLocale() : "");
  const useSemicolon = !!loc && !/^ja\b/i.test(loc) && !/^en\b/i.test(loc);
  return { argSep: useSemicolon ? ";" : "," };
}

function setupMonthly_(ss) {
  const progress = ss.getSheetByName("Progress");
  if (!progress) throw new Error("Progress sheet not found");

  const name = "Monthly";
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();

  sh.getRange(1, 1, 1, 6).setValues([
    ["年月", "作品名", "月別執筆量", "執筆日数", "月末合計", "日平均"],
  ]);
  sh.setFrozenRows(1);

  const { argSep } = getLocaleSeps_(ss);

  const formulaRaw = `
  =ARRAYFORMULA(
    IFERROR(
      LET(
        src${argSep} Progress!A2:F,
        d${argSep} INDEX(src${argSep}${argSep}1),
        total${argSep} INDEX(src${argSep}${argSep}2),
        daily${argSep} INDEX(src${argSep}${argSep}3),
        proj${argSep} INDEX(src${argSep}${argSep}5),
        ym${argSep} IF(d=""${argSep}${argSep}TEXT(d${argSep}"yyyy-mm")),
        q${argSep} QUERY(
          HSTACK(ym${argSep}proj${argSep}daily${argSep}total),
          "select Col1,Col2,sum(Col3),count(Col3),max(Col4) " &
          "where Col1 is not null and Col2 is not null " &
          "group by Col1,Col2 order by Col1,Col2 " &
          "label sum(Col3) '', count(Col3) '', max(Col4) ''",
          0
        ),
        chars${argSep} INDEX(q${argSep}${argSep}3),
        days${argSep} INDEX(q${argSep}${argSep}4),
        avg${argSep} IF(days>0${argSep} chars/days${argSep} 0),
        HSTACK(q${argSep} avg)
      ),
      ""
    )
  )`;

  sh.getRange(2, 1).setFormula(normalizeFormula_(formulaRaw));
  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("C:F").setNumberFormat("0");

  // Monthly 見た目調整
  sh.setColumnWidths(1, 6, 110);
  sh.setColumnWidth(1, 90); // 年月
  sh.setColumnWidth(2, 280); // 作品名
  sh.setColumnWidth(3, 110); // 月別執筆量
  sh.setColumnWidth(4, 100); // 執筆日数
  sh.setColumnWidth(5, 110); // 月末合計
  sh.setColumnWidth(6, 100); // 日平均
  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("C:F").setNumberFormat("#,##0");

  if (!sh.getFilter()) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), 6).createFilter();
  }
}

function setupYear_(ss) {
  const monthly = ss.getSheetByName("Monthly");
  if (!monthly) throw new Error("Monthly sheet not found");

  const name = "Year";
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);

  const sh = ss.insertSheet(name);

  sh.getRange(1, 1, 1, 6).setValues([
    ["年", "作品名", "年別執筆量", "執筆月数", "年末合計", "月平均"],
  ]);
  sh.setFrozenRows(1);

  const formula = `
  =ARRAYFORMULA(
    IFERROR(
      LET(
        src, Monthly!A2:F,
        ym, INDEX(src,,1),
        proj, INDEX(src,,2),
        monthlyChars, INDEX(src,,3),
        monthEndTotal, INDEX(src,,5),
        yy, IF(ym="","",LEFT(ym,4)),
        q, QUERY(
          HSTACK(yy, proj, monthlyChars, monthEndTotal),
          "select Col1,Col2,sum(Col3),count(Col3),max(Col4) " &
          "where Col1 is not null and Col2 is not null " &
          "group by Col1,Col2 order by Col1,Col2 " &
          "label sum(Col3) '', count(Col3) '', max(Col4) ''",
          0
        ),
        chars, INDEX(q,,3),
        months, INDEX(q,,4),
        avg, IF(months>0, chars/months, 0),
        HSTACK(q, avg)
      ),
      ""
    )
  )`
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  sh.getRange(2, 1).setFormula(formula);

  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("C:F").setNumberFormat("0");

  // Year 見た目調整
  sh.setColumnWidths(1, 6, 110);
  sh.setColumnWidth(1, 90); // 年
  sh.setColumnWidth(2, 280); // 作品
  sh.setColumnWidth(3, 110); // 年執筆量
  sh.setColumnWidth(4, 100); // 執筆月数
  sh.setColumnWidth(5, 110); // 年末合計
  sh.setColumnWidth(6, 100); // 月平均
  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  sh.getRange("A:A").setNumberFormat("@");
  sh.getRange("C:F").setNumberFormat("#,##0");

  if (!sh.getFilter()) {
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), 6).createFilter();
  }
}

function setupDashboard_(ss) {
  const name = "Dashboard";
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);

  const sh = ss.insertSheet(name);
  const { argSep } = getLocaleSeps_(ss);

  sh.getRange("A1").setValue("作品名（Project）");
  sh.getRange("B1").setValue("ALL");

  sh.getRange("A2").setValue("期間（ALL / YYYY / YYYY-MM）");
  sh.getRange("B2").setNumberFormat("@");
  sh.getRange("B2").setValue("ALL");

  sh.getRange("D1").setValue(
    "※ 作品別グラフは B1 のプルダウンで作品を選ぶと表示されます",
  );
  sh.getRange("D1:E1").merge();
  sh.getRange("D1").setFontColor("#666666").setFontStyle("italic");

  sh.getRange("AA1").setValue("ALL");
  sh.getRange("AA2").setFormula(
    `=IFERROR(SORT(UNIQUE(FILTER(Progress!E2:E${argSep} Progress!E2:E<>""))),"")`,
  );

  refreshDashboardPeriodOptions_(sh, "ALL");

  SpreadsheetApp.flush();

  const projectRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange("AA1:AA"), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange("B1").setDataValidation(projectRule);

  const periodRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange("T1:T"), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange("B2").setDataValidation(periodRule);

  sh.getRange("A4").setValue("選択期間の執筆量");
  sh.getRange("A5").setValue("選択期間の執筆日数");
  sh.getRange("A6").setValue("選択期間の日平均");
  sh.getRange("A7").setValue("合計文字数");
  sh.getRange("A8").setValue("選択年執筆量");
  sh.getRange("B8").setFormula(
    `=IF($AF$2=""${argSep}
      $B$4${argSep}
      IF($B$1="ALL"${argSep}
        SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&DATE(VALUE($AF$2)${argSep}1${argSep}1)${argSep} Progress!A:A${argSep} "<"&DATE(VALUE($AF$2)+1${argSep}1${argSep}1))${argSep}
        IF($AG$2<>""${argSep}
          SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&DATE(VALUE($AF$2)${argSep}1${argSep}1)${argSep} Progress!A:A${argSep} "<"&DATE(VALUE($AF$2)+1${argSep}1${argSep}1)${argSep} Progress!F:F${argSep} $AG$2)${argSep}
          SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&DATE(VALUE($AF$2)${argSep}1${argSep}1)${argSep} Progress!A:A${argSep} "<"&DATE(VALUE($AF$2)+1${argSep}1${argSep}1)${argSep} Progress!E:E${argSep} $B$1)
        )
      )
    )`,
  );
  sh.getRange("A9").setValue("選択年の前年執筆量");
  sh.getRange("B9").setFormula(`=IF($AI$2=""${argSep}0${argSep}$AI$2)`);

  sh.getRange("AB1:AI1").setValues([
    [
      "period_type",
      "period_start",
      "period_end",
      "trend_end",
      "selected_year",
      "selected_project_key",
      "previous_year",
      "previous_year_total",
    ],
  ]);
  sh.getRange("AB2").setFormula(
    `=IF($B$2="ALL"${argSep}"ALL"${argSep}IF(REGEXMATCH(TO_TEXT($B$2)${argSep}"^\\d{4}$")${argSep}"YEAR"${argSep}"MONTH"))`,
  );
  sh.getRange("AC2").setFormula(
    `=IF($AB$2="ALL"${argSep}""${argSep}IF($AB$2="YEAR"${argSep}DATE(VALUE($B$2)${argSep}1${argSep}1)${argSep}IFERROR(DATEVALUE(TO_TEXT($B$2)&"-01")${argSep}DATE(YEAR($B$2)${argSep}MONTH($B$2)${argSep}1))))`,
  );
  sh.getRange("AD2").setFormula(
    `=IF($AB$2="ALL"${argSep}""${argSep}IF($AB$2="YEAR"${argSep}EDATE($AC$2${argSep}12)${argSep}EDATE($AC$2${argSep}1)))`,
  );
  sh.getRange("AE2").setFormula(
    `=IF($AB$2="ALL"${argSep}
      IFERROR(MAX(FILTER(Progress!A2:A${argSep} IF($B$1="ALL"${argSep} Progress!A2:A<>""${argSep} IF($AG$2<>""${argSep} Progress!F2:F=$AG$2${argSep} Progress!E2:E=$B$1))))${argSep} TODAY())${argSep}
      $AD$2-1
    )`,
  );
  sh.getRange("AF2").setFormula(
    `=IF($AB$2="ALL"${argSep}""${argSep}IF($AB$2="YEAR"${argSep}TO_TEXT($B$2)${argSep}TEXT($AC$2${argSep}"yyyy")))`,
  );
  sh.getRange("AG2").setFormula(
    `=IF($B$1="ALL"${argSep}""${argSep}IFERROR(INDEX(SORT(FILTER(HSTACK(Progress!G2:G${argSep}Progress!F2:F)${argSep}Progress!E2:E=$B$1${argSep}Progress!F2:F<>"")${argSep}1${argSep}FALSE)${argSep}1${argSep}2)${argSep}""))`,
  );
  sh.getRange("AH2").setFormula(
    `=TO_TEXT(VALUE(IF($AF$2=""${argSep}TEXT($AE$2${argSep}"yyyy")${argSep}$AF$2))-1)`,
  );
  sh.getRange("AI2").setFormula(
    `=IFERROR(
      SUMPRODUCT(
        N(Year!C2:C5000)${argSep}
        N(ARRAYFORMULA(TRIM(TO_TEXT(Year!A2:A5000)))=$AH$2)${argSep}
        IF($B$1="ALL"${argSep}
          N(Year!A2:A5000<>"")${argSep}
          N(ARRAYFORMULA(TRIM(TO_TEXT(Year!B2:B5000)))=TRIM(TO_TEXT($B$1)))
        )
      )${argSep}
      0
    )`,
  );
  sh.getRange("B9").setFormula(`=IF($AI$2=""${argSep}0${argSep}$AI$2)`);
  sh.getRange("AC2:AE2").setNumberFormat("yyyy-mm-dd");
  sh.getRange("AB2").setNumberFormat("@");
  sh.getRange("AF2:AH2").setNumberFormat("@");
  sh.getRange("AI2").setNumberFormat("#,##0");

  sh.getRange("B4").setFormula(
    `=IF($B$1="ALL"${argSep}
      IF($AB$2="ALL"${argSep}
        SUM(Progress!C2:C)${argSep}
        SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&$AC$2${argSep} Progress!A:A${argSep} "<"&$AD$2)
      )${argSep}
      IF($AB$2="ALL"${argSep}
        IF($AG$2<>""${argSep} SUMIFS(Progress!C:C${argSep} Progress!F:F${argSep} $AG$2)${argSep} SUMIFS(Progress!C:C${argSep} Progress!E:E${argSep} $B$1))${argSep}
        IF($AG$2<>""${argSep}
          SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&$AC$2${argSep} Progress!A:A${argSep} "<"&$AD$2${argSep} Progress!F:F${argSep} $AG$2)${argSep}
          SUMIFS(Progress!C:C${argSep} Progress!A:A${argSep} ">="&$AC$2${argSep} Progress!A:A${argSep} "<"&$AD$2${argSep} Progress!E:E${argSep} $B$1)
        )
      )
    )`,
  );

  sh.getRange("B5").setFormula(
    `=IFERROR(
      IF($B$1="ALL"${argSep}
        IF($AB$2="ALL"${argSep}
          SUM(Monthly!D2:D)${argSep}
          IF($AB$2="YEAR"${argSep}
            SUM(FILTER(Monthly!D2:D${argSep} LEFT(Monthly!A2:A${argSep}4)=$AF$2))${argSep}
            SUMIFS(Monthly!D:D${argSep} Monthly!A:A${argSep} $B$2)
          )
        )${argSep}
        COUNTUNIQUE(
          FILTER(
            Progress!A2:A${argSep}
            IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A>=$AC$2)${argSep}
            IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A<$AD$2)${argSep}
            IF($AG$2<>""${argSep} Progress!F2:F=$AG$2${argSep} Progress!E2:E=$B$1)
          )
        )
      )${argSep}
      0
    )`,
  );

  sh.getRange("B6").setFormula(`=IFERROR($B$4 / $B$5, 0)`);

  sh.getRange("B7").setFormula(
    `=IF($B$1="ALL"${argSep}
      IFERROR(
        SUM(
          INDEX(
            QUERY(
              FILTER(
                HSTACK(IF(Progress!F2:F<>""${argSep}Progress!F2:F${argSep}Progress!E2:E)${argSep} Progress!B2:B)${argSep}
                  IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A>=$AC$2)${argSep}
                  IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A<$AD$2)${argSep}
                  IF(Progress!F2:F<>""${argSep}Progress!F2:F<>""${argSep}Progress!E2:E<>"")
              )${argSep}
              "select Col1, max(Col2) where Col1 is not null group by Col1 label max(Col2) ''"${argSep}
              0
            )${argSep}
            ${argSep}2
          )
        )${argSep}
        0
      )${argSep}
      IFERROR(
        MAX(
          FILTER(
            Progress!B2:B${argSep}
            IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A>=$AC$2)${argSep}
            IF($AB$2="ALL"${argSep} Progress!A2:A<>""${argSep} Progress!A2:A<$AD$2)${argSep}
            IF($AG$2<>""${argSep} Progress!F2:F=$AG$2${argSep} Progress!E2:E=$B$1)
          )
        )${argSep}
        0
      )
    )`,
  );

  // =========================
  // Data tables for charts (hidden area)
  // =========================
  // Writing days trend (Writing day no, chars)
  // 日付ではなく、実際に執筆した日だけを 1日目 / 2日目... として表示
  sh.getRange("L1").setValue("writing_days");
  sh.getRange("L2").setFormula(
    `=IFERROR(
    LET(
      base,
        QUERY(
          FILTER({Progress!A2:A, Progress!C2:C, Progress!E2:E},
                Progress!C2:C>0,
                IF($B$1="ALL", Progress!A2:A<>"", IF($AG$2<>"", Progress!F2:F=$AG$2, Progress!E2:E=$B$1))
          ),
          "select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) ''",
          0
        ),
      HSTACK(SEQUENCE(ROWS(base)), INDEX(base,,2))
    ),
  )`,
  );
  sh.getRange("L:L").setNumberFormat("0");

  // Selected month daily sum (Date, chars)
  sh.getRange("N1").setValue("selected_month_daily");
  sh.getRange("N2").setFormula(
    `=IFERROR(
      IF($AB$2<>"MONTH"${argSep}""${argSep}
      QUERY(
        FILTER({Progress!A2:A, Progress!C2:C, Progress!E2:E},
              Progress!A2:A>=$AC$2,
              Progress!A2:A<$AD$2,
              IF($B$1="ALL", Progress!A2:A<>"", IF($AG$2<>"", Progress!F2:F=$AG$2, Progress!E2:E=$B$1))
        ),
        "select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) ''",
        0
      )),
    )`,
  );
  sh.getRange("N:N").setNumberFormat("yyyy-mm-dd");

  // Monthly writing volume (YYYY-MM, chars)
  sh.getRange("P1").setValue("monthly_total");
  sh.getRange("P2").setFormula(
    `=IFERROR(
    QUERY(
      FILTER({Monthly!A2:A, Monthly!C2:C, Monthly!B2:B},
        IF($AB$2="ALL", Monthly!A2:A<>"", IF($AB$2="YEAR", LEFT(Monthly!A2:A,4)=$AF$2, Monthly!A2:A=$B$2)),
        IF($B$1="ALL", Monthly!A2:A<>"", Monthly!B2:B=$B$1)
      ),
      "select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) ''",
      0
    ),
  )`,
  );
  sh.getRange("P:P").setNumberFormat("@");

  sh.getRange("R1").setValue("yearly_total");
  sh.getRange("R2").setFormula(
    `=IFERROR(
      QUERY(
        FILTER({Year!A2:A, Year!C2:C, Year!B2:B},
          IF($AF$2="", Year!A2:A<>"", Year!A2:A=$AF$2),
          IF($B$1="ALL", Year!A2:A<>"", Year!B2:B=$B$1)
        ),
        "select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) ''",
        0
      ),
    )`,
  );

  // =========================
  // Final layout
  // =========================
  sh.setFrozenRows(3);

  // A:B は情報欄
  sh.setColumnWidth(1, 200); // A
  sh.setColumnWidth(2, 280); // B
  sh.setColumnWidth(3, 40); // C 余白

  // D:I を広げて 2列チャート配置用の表示幅を確保
  for (let c = 4; c <= 9; c++) {
    sh.setColumnWidth(c, 320);
  }

  // 補助列（非表示）
  for (let c = 10; c <= 35; c++) {
    sh.setColumnWidth(c, 90);
  }

  // 行高
  sh.setRowHeights(1, 60, 24);

  // 見出し
  sh.getRange("A1:A8").setFontWeight("bold");
  sh.getRange("A9").setFontWeight("bold");
  sh.getRange("A1:B2").setFontWeight("bold");
  sh.getRange("B1").setBackground("#eef6ff");
  sh.getRange("B1").setBorder(true, true, true, true, true, true);
  sh.getRange("B2").setBackground("#eef6ff");
  sh.getRange("B2").setBorder(true, true, true, true, true, true);

  // 補助列を最後に非表示
  sh.hideColumns(10, 26); // J:AI

  sh.getRange("B4").setNumberFormat("#,##0");
  sh.getRange("B5").setNumberFormat("0");
  sh.getRange("B6:B9").setNumberFormat("#,##0");
  sh.getRange("B2").setNumberFormat("@");

  // =========================
  // Charts
  // =========================
  // Remove existing charts (re-setup safe)
  sh.getCharts().forEach((c) => sh.removeChart(c));

  // Chart 1: Writing days (column chart)
  const last30Range = sh.getRange("L2:M1000"); // enough rows; blank rows OK
  const chart1 = sh
    .newChart()
    .asColumnChart()
    .addRange(last30Range)
    .setNumHeaders(0)
    .setOption("title", "執筆日数ごとの推移（文字数）")
    .setOption("hAxis", { title: "執筆日数" })
    .setOption("vAxis", { title: "文字数" })
    .setOption("width", 1300)
    .setOption("height", 500)
    .setPosition(4, 4, 0, 0) // D4
    .build();
  sh.insertChart(chart1);

  // Chart 2: Monthly writing volume
  const monthlyTotalRange = sh.getRange("P2:Q40");
  const chart2 = sh
    .newChart()
    .asColumnChart()
    .addRange(monthlyTotalRange)
    .setNumHeaders(0)
    .setOption("title", "月間執筆量")
    .setOption("hAxis", { title: "年月" })
    .setOption("vAxis", { title: "文字数" })
    .setOption("width", 1300)
    .setOption("height", 500)
    .setPosition(26, 4, 0, 0) // D26
    .build();
  sh.insertChart(chart2);

  // Chart 3: Year writing volume
  const yearlyRange = sh.getRange("R2:S20");
  const chart3 = sh
    .newChart()
    .asColumnChart()
    .addRange(yearlyRange)
    .setNumHeaders(0)
    .setOption("title", "年間執筆量")
    .setOption("width", 1300)
    .setOption("height", 500)
    .setPosition(48, 4, 0, 0) // D48
    .build();
  sh.insertChart(chart3);
}

function setupProjectView_(ss) {
  const name = "Project_View";
  const old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);

  const sh = ss.insertSheet(name);
  const { argSep } = getLocaleSeps_(ss);

  // -------------------------
  // Header / selector
  // -------------------------
  sh.getRange("A1").setValue("作品（Project）");
  sh.getRange("B1").setValue("ALL");

  sh.getRange("D1").setValue(
    "※ B1 のプルダウンで作品を選ぶと、その作品の Progress / Daily_Log を表示します。",
  );
  sh.getRange("D1:J1").merge();
  sh.getRange("D1").setFontColor("#666666").setFontStyle("italic");

  // helper list
  sh.getRange("L1").setValue("ALL");
  sh.getRange("L2").setFormula(
    `=IFERROR(SORT(UNIQUE(FILTER(Progress!E2:E${argSep} Progress!E2:E<>""))),"")`,
  );

  SpreadsheetApp.flush();

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange("L1:L"), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange("B1").setDataValidation(rule);

  // -------------------------
  // Progress section
  // -------------------------
  sh.getRange("A3").setValue("Progress");
  sh.getRange("A3").setFontWeight("bold");

  sh.getRange("G3").setValue("※ Progress は最新15件を表示");
  sh.getRange("G3:J3").merge();
  sh.getRange("G3").setFontColor("#666666").setFontStyle("italic");

  sh.getRange("A4:D4").setValues([
    ["日付", "最終保存日時", "合計文字数", "執筆日数"],
  ]);

  sh.getRange("A5").setFormula(
    `=IFERROR(
      ARRAY_CONSTRAIN(
        SORT(
          FILTER(
            {Progress!A2:A, Progress!F2:F, Progress!B2:B, Progress!D2:D},
            IF($B$1="ALL", Progress!A2:A<>"", Progress!E2:E=$B$1)
          ),
          1, FALSE
        ),
        15, 4
      ),
    "")`,
  );

  // -------------------------
  // Daily_Log section
  // -------------------------
  sh.getRange("A20").setValue("Daily_Log");
  sh.getRange("A20").setFontWeight("bold");

  sh.getRange("G20").setValue("※ Daily_Log は最新30件を表示");
  sh.getRange("G20:J20").merge();
  sh.getRange("G20").setFontColor("#666666").setFontStyle("italic");

  sh.getRange("A21:F21").setValues([
    ["保存日時(JST)", "ファイル", "総差分", "総文字数", "章差分", "章総数"],
  ]);

  sh.getRange("A22").setFormula(
    `=IFERROR(
      ARRAY_CONSTRAIN(
        SORT(
          FILTER(
            {Daily_Log!A2:A, Daily_Log!C2:C, Daily_Log!E2:E, Daily_Log!F2:F, Daily_Log!G2:G, Daily_Log!H2:H},
            IF($B$1="ALL", Daily_Log!A2:A<>"", Daily_Log!I2:I=$B$1)
          ),
          1, FALSE
        ),
        30, 6
      ),
    "")`,
  );

  // -------------------------
  // Layout / format
  // -------------------------
  sh.setFrozenRows(4);

  // 共通列幅
  sh.setColumnWidth(1, 150); // A 日付/保存日時
  sh.setColumnWidth(2, 320); // B 最終保存日時/ファイル
  sh.setColumnWidth(3, 110); // C 合計/総差分
  sh.setColumnWidth(4, 130); // D 執筆日数/総文字数
  sh.setColumnWidth(5, 110); // E 章差分
  sh.setColumnWidth(6, 130); // F 章総数
  sh.setColumnWidth(7, 40); // G 余白

  // 表示形式
  sh.getRange("A5:A1000").setNumberFormat("yyyy-mm-dd");
  sh.getRange("B5:B1000").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sh.getRange("C5:D1000").setNumberFormat("#,##0");

  sh.getRange("A21:A2000").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sh.getRange("C21:F2000").setNumberFormat("#,##0");

  // 行高
  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);

  // 上部
  sh.getRange("A1:B1").setFontWeight("bold");
  sh.getRange("B1").setBackground("#eef6ff");
  sh.getRange("B1").setBorder(true, true, true, true, true, true);

  // セクション見出し
  sh.getRange("A3:F4").setFontWeight("bold");
  sh.getRange("A20:F21").setFontWeight("bold");

  // helper 列
  sh.hideColumns(12, 1); // L
}

function refreshDashboardPeriodOptions_(dashboardSheet, project) {
  const ss = dashboardSheet.getParent();
  const progress = ss.getSheetByName("Progress");
  const TZ = String(
    PropertiesService.getScriptProperties().getProperty("TZ") ||
      Session.getScriptTimeZone() ||
      "Asia/Tokyo",
  );

  const options = ["ALL"];
  const years = new Set();
  const months = new Set();
  const selectedProject = String(project || "ALL").trim() || "ALL";

  if (progress && progress.getLastRow() >= 2) {
    const values = progress
      .getRange(2, 1, progress.getLastRow() - 1, 5)
      .getValues();

    for (const row of values) {
      const dateValue = row[0];
      const rowProject = String(row[4] || "").trim();
      if (!dateValue) continue;
      if (selectedProject !== "ALL" && rowProject !== selectedProject) continue;

      let year = "";
      let month = "";
      if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        year = Utilities.formatDate(dateValue, TZ, "yyyy");
        month = Utilities.formatDate(dateValue, TZ, "yyyy-MM");
      } else {
        const s = String(dateValue).trim();
        const m = s.match(/^(\d{4})(?:[-/](\d{1,2}))?/);
        if (!m) continue;
        year = m[1];
        if (m[2]) month = `${m[1]}-${String(m[2]).padStart(2, "0")}`;
      }

      if (year) years.add(year);
      if (month) months.add(month);
    }
  }

  options.push(...Array.from(years).sort().reverse());
  options.push(...Array.from(months).sort().reverse());

  dashboardSheet.getRange("T:T").clearContent().setNumberFormat("@");
  dashboardSheet
    .getRange(1, 20, options.length, 1)
    .setValues(options.map((v) => [v]));
}

function createProjectIdentityAudit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = buildProjectIdentityAudit_(ss);
  const sh = getOrCreateSheet_(ss, "Project_Identity_Audit");
  sh.clear();

  const headers = [
    "問題",
    "対象作品名",
    "対象作品キー",
    "出現作品名",
    "出現作品キー",
    "Progress行数",
    "Daily_Log行数",
    "実行アクション",
    "修正先作品キー",
    "修正先作品名",
    "メモ",
  ];
  const rows = audit.rows.length
    ? audit.rows
    : [
        [
          "OK",
          "",
          "",
          "",
          "",
          0,
          0,
          "",
          "",
          "",
          "作品名と作品キーの不整合は見つかりませんでした。",
        ],
      ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, headers.length, 140);
  sh.setColumnWidth(4, 320);
  sh.setColumnWidth(5, 320);
  sh.setColumnWidth(11, 420);
  sh.getRange("A:K").setNumberFormat("@");
  setupProjectIdentityAuditValidation_(ss, sh, audit);
}

function normalizeProjectNamesByKey() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = buildProjectIdentityAudit_(ss);
  let changed = 0;

  for (const [key, info] of audit.byKey.entries()) {
    if (!key || info.names.size <= 1) continue;
    const canonicalName = getCanonicalProjectName_(info);
    if (!canonicalName) continue;
    changed += updateProjectRows_(ss, {
      matchKey: key,
      newName: canonicalName,
    });
  }

  createProjectIdentityAudit();
  SpreadsheetApp.getUi().alert(
    `作品キー基準で作品名を正規化しました。\n更新セル数: ${changed}`,
  );
}

function fillMissingProjectKeysByName() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = buildProjectIdentityAudit_(ss);
  let changed = 0;

  for (const [name, info] of audit.byName.entries()) {
    if (!name || info.blankKeyRows.length === 0) continue;
    const canonicalKey = getCanonicalProjectKey_(info);
    if (!canonicalKey) continue;
    changed += updateProjectRows_(ss, {
      matchName: name,
      matchBlankKeyOnly: true,
      newKey: canonicalKey,
    });
  }

  createProjectIdentityAudit();
  SpreadsheetApp.getUi().alert(
    `作品名から一意に判断できる空の作品キーを補完しました。\n更新セル数: ${changed}`,
  );
}

function normalizeProjectKeysByName() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const audit = buildProjectIdentityAudit_(ss);
  let changed = 0;
  let skipped = 0;

  for (const [name, info] of audit.byName.entries()) {
    if (!name) continue;
    const canonicalKey = getCanonicalProjectKey_(info);
    if (!canonicalKey) {
      skipped++;
      continue;
    }
    changed += updateProjectRows_(ss, {
      matchName: name,
      newKey: canonicalKey,
    });
  }

  createProjectIdentityAudit();
  SpreadsheetApp.getUi().alert(
    `作品名基準で作品キーを統一しました。\n更新セル数: ${changed}\nスキップ: ${skipped}`,
  );
}

function applyProjectIdentityAuditFixes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Project_Identity_Audit");
  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert(
      "Project_Identity_Audit シートがありません。先に createProjectIdentityAudit を実行してください。",
    );
    return;
  }

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  let changed = 0;

  for (const row of values) {
    const issue = String(row[0] || "").trim();
    const targetName = String(row[1] || "").trim();
    const targetKey = String(row[2] || "").trim();
    const action = normalizeProjectIdentityAction_(row[7]);
    const newKey = String(row[8] || "").trim();
    const newName = String(row[9] || "").trim();

    if (!action) continue;

    if (action === "KEY_TO_NAME") {
      if (!targetKey || !newName) continue;
      changed += updateProjectRows_(ss, {
        matchKey: targetKey,
        newName,
      });
      continue;
    }

    if (action === "NAME_TO_KEY") {
      if (!targetName || !newKey) continue;
      changed += updateProjectRows_(ss, {
        matchName: targetName,
        matchKey: targetKey,
        matchBlankKeyOnly:
          !targetKey && (issue === "作品キーが空" || issue === "MISSING_KEY"),
        newKey,
      });
      continue;
    }

    if (action === "KEY_AND_NAME" || action === "ASSIGN_EXISTING") {
      if (!targetName || !newKey || !newName) continue;
      changed += updateProjectRows_(ss, {
        matchName: targetName,
        matchKey: targetKey,
        matchBlankKeyOnly:
          !targetKey && (issue === "作品キーが空" || issue === "MISSING_KEY"),
        newKey,
        newName,
      });
    }
  }

  createProjectIdentityAudit();
  SpreadsheetApp.getUi().alert(
    `Project_Identity_Audit の修正指示を反映しました。\n更新セル数: ${changed}`,
  );
}

function buildProjectIdentityAudit_(ss) {
  const byKey = new Map();
  const byName = new Map();
  const records = [];

  collectProjectIdentityRecords_(ss, records);

  for (const rec of records) {
    const key = rec.key;
    const name = rec.name;

    if (key) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          names: new Set(),
          records: [],
          progressRows: 0,
          dailyRows: 0,
        });
      }
      const info = byKey.get(key);
      if (name) info.names.add(name);
      info.records.push(rec);
      if (rec.sheetName === "Progress") info.progressRows++;
      if (rec.sheetName === "Daily_Log") info.dailyRows++;
    }

    if (name) {
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          keys: new Set(),
          records: [],
          blankKeyRows: [],
          progressRows: 0,
          dailyRows: 0,
        });
      }
      const info = byName.get(name);
      if (key) info.keys.add(key);
      else info.blankKeyRows.push(rec);
      info.records.push(rec);
      if (rec.sheetName === "Progress") info.progressRows++;
      if (rec.sheetName === "Daily_Log") info.dailyRows++;
    }
  }

  const rows = [];

  for (const [key, info] of byKey.entries()) {
    if (info.names.size <= 1) continue;
    const canonicalName = getCanonicalProjectName_(info);
    rows.push([
      "同じ作品キーに複数の作品名",
      canonicalName,
      key,
      Array.from(info.names).join(" / "),
      key,
      info.progressRows,
      info.dailyRows,
      "作品キーに合わせて作品名を統一",
      "",
      canonicalName,
      "同じ作品キーは同一作品として扱います。修正先作品名を選ぶと、その作品キーの行を同じ作品名にできます。",
    ]);
  }

  for (const [name, info] of byName.entries()) {
    const keys = Array.from(info.keys).filter((key) => key);
    if (keys.length > 1) {
      const canonicalKey = getCanonicalProjectKey_(info);
      rows.push([
        "同じ作品名に複数の作品キー",
        name,
        "",
        name,
        keys.join(" / "),
        info.progressRows,
        info.dailyRows,
        "",
        canonicalKey,
        "",
        "同一作品として扱うなら、実行アクションで「作品名に合わせて作品キーを統一」を選び、修正先作品キーを選択してください。別作品なら修正先作品名も指定して「作品キーと作品名を両方修正」を選びます。",
      ]);
    }

    if (info.blankKeyRows.length > 0) {
      const action =
        keys.length >= 1
          ? "作品名に合わせて作品キーを統一"
          : "既存作品へ割り当て";
      const targetKey = keys.length >= 1 ? getCanonicalProjectKey_(info) : "";
      rows.push([
        "作品キーが空",
        name,
        "",
        name,
        keys.join(" / "),
        info.blankKeyRows.filter((r) => r.sheetName === "Progress").length,
        info.blankKeyRows.filter((r) => r.sheetName === "Daily_Log").length,
        action,
        targetKey,
        "",
        keys.length >= 1
          ? "同じ作品名に既存キーがあるため、空の作品キーを補完できます。"
          : "作品キーが空です。既存作品へ割り当てる場合は、修正先作品キーと修正先作品名を選んでください。",
      ]);
    }
  }

  return { byKey, byName, records, rows };
}

function collectProjectIdentityRecords_(ss, records) {
  const progress = ss.getSheetByName("Progress");
  if (progress && progress.getLastRow() >= 2) {
    const values = progress
      .getRange(2, 1, progress.getLastRow() - 1, 7)
      .getValues();
    values.forEach((row, i) => {
      const name = String(row[4] || "").trim();
      const key = String(row[5] || "").trim();
      if (!name && !key) return;
      records.push({
        sheetName: "Progress",
        rowNumber: i + 2,
        dateValue: row[6] || row[0],
        name,
        key,
      });
    });
  }

  const daily = ss.getSheetByName("Daily_Log");
  if (daily && daily.getLastRow() >= 2) {
    const values = daily.getRange(2, 1, daily.getLastRow() - 1, 10).getValues();
    values.forEach((row, i) => {
      const name = String(row[8] || "").trim();
      const key = String(row[9] || "").trim();
      if (!name && !key) return;
      records.push({
        sheetName: "Daily_Log",
        rowNumber: i + 2,
        dateValue: row[0] || row[1],
        name,
        key,
      });
    });
  }
}

function getCanonicalProjectName_(info) {
  let best = null;
  for (const rec of info.records) {
    if (!rec.name) continue;
    const t =
      rec.dateValue instanceof Date && !isNaN(rec.dateValue.getTime())
        ? rec.dateValue.getTime()
        : new Date(rec.dateValue).getTime();
    const score = isNaN(t) ? 0 : t;
    if (!best || score >= best.score) best = { name: rec.name, score };
  }
  return best ? best.name : Array.from(info.names)[0] || "";
}

function getCanonicalProjectKey_(info) {
  let best = null;
  for (const rec of info.records) {
    if (!rec.key) continue;
    const t =
      rec.dateValue instanceof Date && !isNaN(rec.dateValue.getTime())
        ? rec.dateValue.getTime()
        : new Date(rec.dateValue).getTime();
    const score = isNaN(t) ? 0 : t;
    if (!best || score >= best.score) best = { key: rec.key, score };
  }
  const keys = info.keys ? Array.from(info.keys).filter((key) => key) : [];
  return best ? best.key : keys[0] || "";
}

function normalizeProjectIdentityAction_(raw) {
  const s = String(raw || "").trim();
  const upper = s.toUpperCase();
  if (
    s === "作品キーに合わせて作品名を統一" ||
    upper === "RENAME_KEY" ||
    upper === "KEY_TO_NAME"
  ) {
    return "KEY_TO_NAME";
  }
  if (
    s === "作品名に合わせて作品キーを統一" ||
    upper === "SET_KEY_BY_NAME" ||
    upper === "NAME_TO_KEY"
  ) {
    return "NAME_TO_KEY";
  }
  if (
    s === "作品キーと作品名を両方修正" ||
    upper === "SET_KEY_AND_NAME" ||
    upper === "KEY_AND_NAME"
  ) {
    return "KEY_AND_NAME";
  }
  if (s === "既存作品へ割り当て" || upper === "ASSIGN_EXISTING") {
    return "ASSIGN_EXISTING";
  }
  return "";
}

function setupProjectIdentityAuditValidation_(ss, sh, audit) {
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);
  const actionValues = [
    "作品キーに合わせて作品名を統一",
    "作品名に合わせて作品キーを統一",
    "作品キーと作品名を両方修正",
    "既存作品へ割り当て",
  ];
  const keyValues = Array.from(
    new Set(audit.records.map((r) => r.key).filter((v) => v)),
  ).sort();
  const nameValues = Array.from(
    new Set(audit.records.map((r) => r.name).filter((v) => v)),
  ).sort();

  const actionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(actionValues, true)
    .setAllowInvalid(true)
    .build();
  sh.getRange(2, 8, maxRows, 1).setDataValidation(actionRule);

  if (keyValues.length > 0) {
    const keyRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(keyValues, true)
      .setAllowInvalid(true)
      .build();
    sh.getRange(2, 9, maxRows, 1).setDataValidation(keyRule);
  }

  if (nameValues.length > 0) {
    const nameRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(nameValues, true)
      .setAllowInvalid(true)
      .build();
    sh.getRange(2, 10, maxRows, 1).setDataValidation(nameRule);
  }
}

function updateProjectRows_(ss, opt) {
  let changed = 0;
  changed += updateProjectRowsInSheet_(ss.getSheetByName("Progress"), {
    nameCol: 5,
    keyCol: 6,
    width: 7,
    ...opt,
  });
  changed += updateProjectRowsInSheet_(ss.getSheetByName("Daily_Log"), {
    nameCol: 9,
    keyCol: 10,
    width: 10,
    ...opt,
  });
  return changed;
}

function updateProjectRowsInSheet_(sh, opt) {
  if (!sh || sh.getLastRow() < 2) return 0;

  const numRows = sh.getLastRow() - 1;
  const values = sh.getRange(2, 1, numRows, opt.width).getValues();
  let changed = 0;

  for (const row of values) {
    const name = String(row[opt.nameCol - 1] || "").trim();
    const key = String(row[opt.keyCol - 1] || "").trim();

    if (opt.matchName && name !== opt.matchName) continue;
    if (opt.matchKey && key !== opt.matchKey) continue;
    if (opt.matchBlankKeyOnly && key) continue;

    if (opt.newName && name !== opt.newName) {
      row[opt.nameCol - 1] = opt.newName;
      changed++;
    }
    if (opt.newKey && key !== opt.newKey) {
      row[opt.keyCol - 1] = opt.newKey;
      changed++;
    }
  }

  if (changed > 0) {
    sh.getRange(2, 1, numRows, opt.width).setValues(values);
  }
  return changed;
}

function normalizeProgressByProjectKeyAndDate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Progress");
  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert("Progress に統合対象のデータがありません。");
    return;
  }

  ensureProgressHeader_(sh);

  const TZ = String(
    PropertiesService.getScriptProperties().getProperty("TZ") ||
      Session.getScriptTimeZone() ||
      "Asia/Tokyo",
  );
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  const grouped = new Map();
  const noKeyRows = [];

  for (const row of values) {
    const dateValue = row[0];
    const project = String(row[4] || "").trim();
    const projectKey = String(row[5] || "").trim();
    const ymd = formatDateKey_(dateValue, TZ);

    if (!dateValue || !projectKey || !ymd) {
      noKeyRows.push(row);
      continue;
    }

    const key = `${projectKey}\u0000${ymd}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        date: parseYmd_(ymd),
        total: 0,
        daily: 0,
        project,
        projectKey,
        updatedAt: null,
        rows: [],
      });
    }

    const item = grouped.get(key);
    const total = Number(row[1]);
    const daily = Number(row[2]);
    const updatedAt = normalizeDateValue_(row[6]);
    item.rows.push(row);
    if (Number.isFinite(daily)) item.daily += daily;
    if (Number.isFinite(total) && total >= item.total) item.total = total;
    if (
      updatedAt &&
      (!item.updatedAt || updatedAt.getTime() >= item.updatedAt.getTime())
    ) {
      item.updatedAt = updatedAt;
      if (project) item.project = project;
      if (Number.isFinite(total)) item.total = total;
    }
  }

  const merged = Array.from(grouped.values()).map((item) => [
    item.date,
    item.total,
    item.daily,
    0,
    item.project,
    item.projectKey,
    item.updatedAt || new Date(),
  ]);

  const allRows = merged.concat(noKeyRows).sort(compareProgressRows_(TZ));
  rewriteProgressRows_(sh, allRows);
  recalculateProgressWritingDays();

  const mergedCount = values.length - allRows.length;
  SpreadsheetApp.getUi().alert(
    `Progress を作品キー＋日付で統合しました。\n統合された重複行数: ${mergedCount}\n作品キーが空の行数: ${noKeyRows.length}`,
  );
}

function recalculateProgressWritingDays() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Progress");
  if (!sh || sh.getLastRow() < 2) return;

  const TZ = String(
    PropertiesService.getScriptProperties().getProperty("TZ") ||
      Session.getScriptTimeZone() ||
      "Asia/Tokyo",
  );
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  const sorted = values.slice().sort(compareProgressRows_(TZ));
  const seen = new Map();

  for (const row of sorted) {
    const dateKey = formatDateKey_(row[0], TZ);
    const identity = getProgressIdentityKey_(row);
    if (!identity || !dateKey) {
      row[3] = "";
      continue;
    }

    if (!seen.has(identity)) seen.set(identity, new Set());
    const dates = seen.get(identity);
    dates.add(dateKey);
    row[3] = dates.size;
  }

  rewriteProgressRows_(sh, sorted);
}

function rewriteProgressRows_(sh, rows) {
  const currentRows = Math.max(sh.getLastRow() - 1, 0);
  if (currentRows > 0) {
    sh.getRange(2, 1, currentRows, 7).clearContent();
  }
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 7).setValues(rows);
  }
  sh.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  sh.getRange("B:D").setNumberFormat("#,##0");
  sh.getRange("G:G").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sh.setRowHeights(1, Math.max(1, sh.getMaxRows()), 24);
}

function compareProgressRows_(TZ) {
  return (a, b) => {
    const ak = String(a[5] || "").trim() || `name:${String(a[4] || "").trim()}`;
    const bk = String(b[5] || "").trim() || `name:${String(b[4] || "").trim()}`;
    if (ak !== bk) return ak < bk ? -1 : 1;
    const ad = formatDateKey_(a[0], TZ);
    const bd = formatDateKey_(b[0], TZ);
    if (ad !== bd) return ad < bd ? -1 : 1;
    return 0;
  };
}

function getProgressIdentityKey_(row) {
  const projectKey = String(row[5] || "").trim();
  if (projectKey) return `key:${projectKey}`;
  const project = String(row[4] || "").trim();
  return project ? `name:${project}` : "";
}

function formatDateKey_(value, TZ) {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return Utilities.formatDate(dt, TZ, "yyyy-MM-dd");
  return "";
}

function normalizeDateValue_(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

// -------------------------
// helpers
// -------------------------
function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function parseYmd_(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function parseUpdatedAt_(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && isFinite(raw)) return new Date(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw))
    return new Date(Number(raw));
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) return dt;
  } catch {}
  return null;
}

function findRowByDateAndProject_(sh, dateObj, project, projectKey, TZ) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const width = Math.max(7, sh.getLastColumn());
  const values = sh.getRange(2, 1, lastRow - 1, width).getValues();
  const target = Utilities.formatDate(dateObj, TZ, "yyyy-MM-dd");

  for (let i = 0; i < values.length; i++) {
    const cellDate = values[i][0];
    const cellProject = String(values[i][4] || "").trim();
    const cellProjectKey = String(values[i][5] || "").trim();

    const s =
      cellDate instanceof Date
        ? Utilities.formatDate(cellDate, TZ, "yyyy-MM-dd")
        : Utilities.formatDate(new Date(cellDate), TZ, "yyyy-MM-dd");

    if (s !== target) continue;

    if (projectKey) {
      if (cellProjectKey && cellProjectKey === projectKey) return i + 2;
      if (!cellProjectKey && cellProject === project) return i + 2;
    } else {
      if (cellProject === project) return i + 2;
    }
  }
  return null;
}

function countDataRowsByProject_(sh, projectKey, project, TZ) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  const width = Math.max(7, sh.getLastColumn());
  const values = sh.getRange(2, 1, lastRow - 1, width).getValues();
  const dates = new Set();

  for (const r of values) {
    const rowDate = r[0];
    if (!rowDate) continue;

    const rowProject = String(r[4] || "").trim();
    const rowProjectKey = String(r[5] || "").trim();
    const dateKey = formatDateKey_(rowDate, TZ || "Asia/Tokyo");
    if (!dateKey) continue;

    if (projectKey) {
      if (rowProjectKey && rowProjectKey === projectKey) dates.add(dateKey);
      else if (!rowProjectKey && rowProject === project) dates.add(dateKey);
      continue;
    }
    if (rowProject === project) dates.add(dateKey);
  }

  return dates.size;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// Debug sheet logger (stable)
function debug_(enabled, msg, obj) {
  if (!enabled) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, "Debug");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["ts", "msg", "json"]);
    sh.setFrozenRows(1);
  }
  sh.appendRow(
    [new Date(), String(msg || ""), JSON.stringify(obj || {})].slice(0, 3),
  );
}

function applySetupValues() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Setup");
  if (!sh) throw new Error("Setup sheet not found");

  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error("Setup sheet is empty");

  const values = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  const props = PropertiesService.getScriptProperties();
  const allowed = new Set([
    "TZ",
    "SHEET_PROGRESS",
    "SHEET_EVENTS",
    "SECRET",
    "DEBUG_LOG",
  ]);

  for (const row of values) {
    const key = String(row[0] || "").trim();
    const val = String(row[1] || "").trim();
    if (!allowed.has(key)) continue;
    props.setProperty(key, val);
  }

  SpreadsheetApp.getUi().alert(
    "Setup シートの値を ScriptProperties に反映しました。",
  );
}

// -------------------------
// Sorting helpers
// -------------------------

function sortDailyLogNewest() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Daily_Log");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 10).sort([
    { column: 1, ascending: false },
  ]);
}

function sortDailyLogOldest() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Daily_Log");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 10).sort([
    { column: 1, ascending: true },
  ]);
}

function sortDailyLogByProjectThenDate() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Daily_Log");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 10).sort([
    { column: 9, ascending: true },
    { column: 1, ascending: false },
  ]);
}

function sortProgressByProjectThenDate() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Progress");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 7).sort([
    { column: 5, ascending: true },
    { column: 1, ascending: true },
  ]);
}

function sortProgressByUpdatedAtDesc() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Progress");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 7).sort([
    { column: 7, ascending: false },
  ]);
}

function sortProgressByDailyDesc() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Progress");
  if (!sh || sh.getLastRow() < 2) return;

  sh.getRange(2, 1, sh.getLastRow() - 1, 7).sort([
    { column: 3, ascending: false },
  ]);
}

function onEdit(e) {
  const range = e && e.range;
  if (!range) return;

  const sh = range.getSheet();
  if (sh.getName() !== "Dashboard") return;
  if (range.getA1Notation() !== "B1") return;

  const project = String(range.getValue() || "ALL").trim() || "ALL";
  refreshDashboardPeriodOptions_(sh, project);
  sh.getRange("B2").setValue("ALL");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("もじごと")
    .addItem("Daily_Log：最新順", "sortDailyLogNewest")
    .addItem("Daily_Log：最古順", "sortDailyLogOldest")
    .addItem("Daily_Log：作品順→日時順", "sortDailyLogByProjectThenDate")
    .addSeparator()
    .addItem("Progress：作品順→日付順", "sortProgressByProjectThenDate")
    .addItem("Progress：最終保存日時が新しい順", "sortProgressByUpdatedAtDesc")
    .addItem("Progress：本日の文字数が多い順", "sortProgressByDailyDesc")
    .addItem(
      "Progress：作品キー＋日付で統合",
      "normalizeProgressByProjectKeyAndDate",
    )
    .addItem("Progress：執筆日数を振り直し", "recalculateProgressWritingDays")
    .addSeparator()
    .addItem("作品ID診断シートを作成", "createProjectIdentityAudit")
    .addItem("作品キー基準で作品名を自動統一", "normalizeProjectNamesByKey")
    .addItem("作品名基準で作品キーを自動統一", "normalizeProjectKeysByName")
    .addItem("空の作品キーを自動補完", "fillMissingProjectKeysByName")
    .addItem(
      "作品ID診断シートの修正指示を反映",
      "applyProjectIdentityAuditFixes",
    )
    .addToUi();
}
