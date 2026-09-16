const vscode = require("vscode");
const path = require("path");
const { keyDaily, keyFiles } = require("./stats-keys");
const {
  gsGet,
  nowJstParts,
  formatJstDateTime,
  formatJstDateTimeMinutes,
} = require("./stats-utils");
const {
  getStatsRetentionSettings,
  sheetsEnabled,
  webhookEventsMode,
} = require("./stats-config");
const { getEventsRemindMode } = require("./stats-reminder");
const { getDisplayChapterLabel } = require("../core/chapter-labels");
const {
  readDisplayNamesSync,
  getDisplayNameFromData,
  getDisplayPathLabelFromData,
} = require("../reorder/reorder-display-names");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  getConceptMemosPathForWork,
  getConceptMemosPathForSingle,
  getWritingMemosPathForWork,
  getWritingMemosPathForSingle,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const { readConceptMemos } = require("../data/concept-memo-store");
const { readCommonTodoItems } = require("../data/common-todo-store");
const { readWritingMemos } = require("../writing-memo/writing-memo-store");
const {
  resolveWritingMemoTargetForActiveEditor,
  isSameWritingMemoFilePath,
  resolveWritingMemoAbsolutePathFlexible,
  resolveWritingMemoExcerptDisplayFromFile,
} = require("../writing-memo/writing-memo-resolver");
const {
  reconcileWritingMemoPathsForTarget,
} = require("../writing-memo/writing-memo-tracker");

function buildRecentDateKeys(endDateKey, count = 7) {
  const match = String(endDateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const endMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const length = Math.max(1, Number(count) || 7);
  return Array.from({ length }, (_, index) =>
    new Date(endMs - (length - 1 - index) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
}

function buildRecentDailyRows(daily, endDateKey, count = 7) {
  const dateKeys = buildRecentDateKeys(endDateKey, count);
  if (!dateKeys.length) return [];

  const recordedDates = Object.keys(daily || {}).sort();
  const derivedRows = new Map();
  let previousRecordedTotal = null;

  for (const date of recordedDates) {
    const row = daily?.[date];
    const totalSaved = Number(row?.totalSaved || 0);
    const hasExplicitBaseline =
      typeof row?.baselineTotal === "number" &&
      Number.isFinite(row.baselineTotal);
    const deltaTotal = hasExplicitBaseline || previousRecordedTotal == null
      ? Number(row?.deltaTotal || 0)
      : totalSaved - previousRecordedTotal;
    derivedRows.set(date, { totalSaved, deltaTotal });
    previousRecordedTotal = totalSaved;
  }

  let lastTotalSaved = 0;
  const firstDate = dateKeys[0];
  for (const date of recordedDates) {
    if (date >= firstDate) break;
    lastTotalSaved = Number(derivedRows.get(date)?.totalSaved || 0);
  }

  return dateKeys.map((date) => {
    const row = derivedRows.get(date);
    if (row) lastTotalSaved = row.totalSaved;
    return {
      date,
      deltaTotal: Number(row?.deltaTotal || 0),
      totalSaved: lastTotalSaved,
    };
  });
}

function createBuildStatsState(deps) {
  const {
    getCurrentWorkTitleFromSettings,
    getCurrentWorkGoal,
    getCurrentWorkDeadline,
    getDaysLeftText,
    getWorkName,
    getCountModeLabel,
  } = deps;

  function resolveCurrentConceptMemosPath(context) {
    if (isSingleMode()) {
      return getConceptMemosPathForSingle();
    }

    const currentWorkName = String(getWorkName(context) || "").trim();
    if (!currentWorkName) return "";

    const work = listWorkDirectories().find(
      (item) => String(item?.name || "") === currentWorkName,
    );
    if (!work?.fsPath) return "";

    return getConceptMemosPathForWork(work.fsPath);
  }

  function sortDashboardMemos(items) {
    return [...items].sort((a, b) => {
      const pinA = a?.isPinned ? 1 : 0;
      const pinB = b?.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const orderA = Number(a?.order || 0);
      const orderB = Number(b?.order || 0);
      if (orderA !== orderB) return orderA - orderB;

      const updatedA = String(a?.updatedAt || "");
      const updatedB = String(b?.updatedAt || "");
      return updatedB.localeCompare(updatedA);
    });
  }

  function buildDashboardNotePreview(memo) {
    const type = String(memo?.type || "text");

    if (type === "list") {
      const items = Array.isArray(memo?.listItems) ? memo.listItems : [];
      return `項目 ${items.length}件`;
    }

    if (type === "todo") {
      const items = Array.isArray(memo?.todoItems) ? memo.todoItems : [];
      const incomplete = items.filter((item) => !item?.done).length;
      return incomplete > 0 ? `未完了 ${incomplete}件` : "未完了なし";
    }

    return String(memo?.body || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
  }

  function buildDashboardSourceText(memo) {
    const source = memo?.source || {};
    if (String(source.kind || "") !== "noteItem") {
      return "";
    }

    const noteTitle = String(source.noteTitle || "").trim();
    const groupTitle = String(source.groupTitle || "").trim();
    const itemHeading = String(source.itemHeading || "").trim();

    const parts = [];
    if (noteTitle) parts.push(`「${noteTitle}」`);
    if (groupTitle) parts.push(groupTitle);
    if (itemHeading) parts.push(itemHeading);

    return parts.length ? `出典: ${parts.join(" > ")}` : "";
  }

  function toDashboardNoteItem(memo) {
    const listItems = Array.isArray(memo?.listItems)
      ? memo.listItems.map((item) => ({
          id: String(item?.id || ""),
          text: String(item?.text || ""),
          checked: Boolean(item?.checked),
        }))
      : [];

    const todoItems = Array.isArray(memo?.todoItems)
      ? memo.todoItems.map((item) => ({
          id: String(item?.id || ""),
          text: String(item?.text || ""),
          done: Boolean(item?.done),
        }))
      : [];

    return {
      id: String(memo?.id || ""),
      type: String(memo?.type || "text"),
      title: String(memo?.title || "").trim() || "無題メモ",
      preview: buildDashboardNotePreview(memo),
      body: String(memo?.body || ""),
      tags: Array.isArray(memo?.tags)
        ? memo.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
        : [],
      listItems,
      todoItems,
      listCount: listItems.length,
      todoUndoneCount: todoItems.filter((item) => !item.done).length,
      sourceText: buildDashboardSourceText(memo),
      isPinned: !!memo?.isPinned,
      showInDashboard: !!memo?.showInDashboard,
      updatedAt: String(memo?.updatedAt || ""),
      order: Number(memo?.order || 0),
    };
  }

  async function buildDashboardNotes(context) {
    try {
      const filePath = resolveCurrentConceptMemosPath(context);
      const sharedCommonTodoItems = await readCommonTodoItems({
        legacyConceptMemoPaths: filePath ? [filePath] : [],
      });
      const commonTodo = sharedCommonTodoItems
        .map((item, index) => ({
          id: String(item?.id || `common_todo_${index}`),
          text: String(item?.text || "").trim(),
          done: Boolean(item?.done),
          order: index,
        }))
        .filter((item) => item.text)
        .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);

      if (!filePath) {
        return { normal: [], list: [], todo: [], commonTodo };
      }

      const data = await readConceptMemos(filePath);
      const memos = Array.isArray(data?.memos) ? data.memos : [];

      const picked = memos.filter(
        (memo) => !memo?.isArchived && !!memo?.showInDashboard,
      );

      const sorted = sortDashboardMemos(picked);
      return {
        commonTodo,
        normal: sorted
          .filter((memo) => {
            const type = String(memo?.type || "text");
            return type !== "list" && type !== "todo";
          })
          .map(toDashboardNoteItem),

        list: sorted
          .filter((memo) => String(memo?.type || "") === "list")
          .map(toDashboardNoteItem),

        todo: sorted
          .filter((memo) => String(memo?.type || "") === "todo")
          .map(toDashboardNoteItem),
      };
    } catch {
      return { normal: [], list: [], todo: [], commonTodo: [] };
    }
  }

  function getWritingMemoStatusLabel(status) {
    const value = String(status || "active");
    if (value === "done") return "完了";
    if (value === "hold") return "保留";
    return "未処理";
  }

  function getWritingMemoStatusPriority(status) {
    const value = String(status || "active");
    if (value === "active") return 0;
    if (value === "hold") return 1;
    if (value === "done") return 2;
    return 9;
  }

  function sortWritingMemos(items) {
    return [...items].sort((a, b) => {
      const statusDiff =
        getWritingMemoStatusPriority(a?.status) -
        getWritingMemoStatusPriority(b?.status);

      if (statusDiff !== 0) {
        return statusDiff;
      }

      return String(b?.updatedAt || "").localeCompare(
        String(a?.updatedAt || ""),
      );
    });
  }

  function toWritingMemoItem(
    memo,
    absoluteFilePath = "",
    writingMemoFilePath = "",
    manuscriptRoot = "",
    displayData = null,
  ) {
    const status = String(memo?.status || "active");

    const excerptDisplay = resolveWritingMemoExcerptDisplayFromFile(
      absoluteFilePath,
      memo,
    );

    const displayFileName = absoluteFilePath && manuscriptRoot
      ? getDisplayNameFromData(
          displayData || readDisplayNamesSync(manuscriptRoot),
          manuscriptRoot,
          absoluteFilePath,
        )
      : "";

    return {
      id: String(memo?.id || ""),
      filePath: String(memo?.filePath || ""),
      fileName: displayFileName || String(memo?.fileName || ""),
      targetLocation: String(memo?.targetLocation || ""),
      excerpt: String(excerptDisplay.excerpt || ""),
      originalExcerpt: String(excerptDisplay.originalExcerpt || ""),
      currentExcerpt: String(excerptDisplay.currentExcerpt || ""),
      isExcerptMissing: Boolean(excerptDisplay.isExcerptMissing),
      body: String(memo?.body || ""),
      status,
      statusLabel: getWritingMemoStatusLabel(status),
      isArchived: !!memo?.isArchived,
      startLine: Number(memo?.startLine || 0),
      startCharacter: Number(memo?.startCharacter || 0),
      endLine: Number(memo?.endLine || 0),
      endCharacter: Number(memo?.endCharacter || 0),
      updatedAt: String(memo?.updatedAt || ""),
      createdAt: String(memo?.createdAt || ""),
      absoluteFilePath: String(absoluteFilePath || ""),
      writingMemoFilePath: String(writingMemoFilePath || ""),
    };
  }

  async function buildWritingMemoItems(context, options = {}) {
    try {
      const target = resolveWritingMemoTargetForActiveEditor(context, options);
      if (!target.writingMemoFilePath || !target.relativeFilePath) {
        return {
          items: [],
          targetPath: "",
          currentWorkId: "",
          currentWorkTitle: "",
        };
      }

      await reconcileWritingMemoPathsForTarget(context, target);
      const data = await readWritingMemos(target.writingMemoFilePath);
      const memos = Array.isArray(data?.memos) ? data.memos : [];

      const filtered = memos.filter((memo) =>
        isSameWritingMemoFilePath(
          memo?.filePath || "",
          target.relativeFilePath,
        ),
      );

      const currentWorkId = String(target?.workId || "").trim();
      const currentWorkTitle = String(target?.workTitle || "").trim();
      const manuscriptRoot = String(
        vscode.workspace
          .getConfiguration("mojigoto")
          .get("manuscriptRoot", "") || "",
      ).trim();
      const displayData = manuscriptRoot
        ? readDisplayNamesSync(manuscriptRoot)
        : null;

      return {
        items: sortWritingMemos(filtered).map((memo) =>
          toWritingMemoItem(
            memo,
            target.absoluteFilePath,
            target.writingMemoFilePath,
            manuscriptRoot,
            displayData,
          ),
        ),
        targetPath: target.targetPath,
        currentWorkId,
        currentWorkTitle,
      };
    } catch {
      return {
        items: [],
        targetPath: "",
        currentWorkId: "",
        currentWorkTitle: "",
      };
    }
  }

  async function buildWritingMemoWorkSummaries(context) {
    try {
      const works = [];

      if (isSingleMode()) {
        const filePath = getWritingMemosPathForSingle();
        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? data.memos : [];

        const visible = memos.filter((memo) => !memo?.isArchived);
        const activeCount = visible.filter(
          (memo) => String(memo?.status || "active") !== "done",
        ).length;
        const doneCount = visible.filter(
          (memo) => String(memo?.status || "active") === "done",
        ).length;
        const archivedCount = memos.filter((memo) => memo?.isArchived).length;

        if (memos.length > 0) {
          works.push({
            workId: "__single__",
            title: "現在の作品",
            activeCount,
            doneCount,
            archivedCount,
            totalCount: memos.length,
            lastUpdatedAt: formatJstDateTime(
              [...memos]
                .map((memo) => String(memo?.updatedAt || ""))
                .sort()
                .pop() || "",
            ),
          });
        }

        return works;
      }

      for (const work of listWorkDirectories()) {
        if (!work?.fsPath) continue;

        const filePath = getWritingMemosPathForWork(work.fsPath);
        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? data.memos : [];
        if (!memos.length) continue;

        const visible = memos.filter((memo) => !memo?.isArchived);
        const activeCount = visible.filter(
          (memo) => String(memo?.status || "active") !== "done",
        ).length;
        const doneCount = visible.filter(
          (memo) => String(memo?.status || "active") === "done",
        ).length;
        const archivedCount = memos.filter((memo) => memo?.isArchived).length;

        works.push({
          workId: String(work?.name || "").trim(),
          title: String(work?.title || work?.name || "").trim() || "無題作品",
          activeCount,
          doneCount,
          archivedCount,
          totalCount: memos.length,
          lastUpdatedAt: formatJstDateTime(
            [...memos]
              .map((memo) => String(memo?.updatedAt || ""))
              .sort()
              .pop() || "",
          ),
        });
      }

      return works.sort((a, b) =>
        String(b?.lastUpdatedAt || "").localeCompare(
          String(a?.lastUpdatedAt || ""),
        ),
      );
    } catch {
      return [];
    }
  }

  async function buildWritingMemosForSelectedWork(context, options = {}) {
    try {
      const workId = String(options?.selectedWritingMemoWorkId || "").trim();
      if (!workId) {
        return {
          workTitle: "",
          items: [],
        };
      }

      if (isSingleMode()) {
        const filePath = getWritingMemosPathForSingle();
        const data = await readWritingMemos(filePath);
        const memos = Array.isArray(data?.memos) ? data.memos : [];
        const manuscriptRoot = String(
          vscode.workspace
            .getConfiguration("mojigoto")
            .get("manuscriptRoot", "") || "",
        ).trim();
        const displayData = manuscriptRoot
          ? readDisplayNamesSync(manuscriptRoot)
          : null;

        return {
          workTitle: "現在の作品",
          items: sortWritingMemos(memos).map((memo) => {
            const absoluteFilePath = memo?.filePath
              ? resolveWritingMemoAbsolutePathFlexible(context, memo.filePath, {
                  writingMemoFilePath: filePath,
                  excerpt: memo?.excerpt || "",
                  targetLocation: memo?.targetLocation || "",
                })
              : "";

            return toWritingMemoItem(
              memo,
              absoluteFilePath,
              filePath,
              manuscriptRoot,
              displayData,
            );
          }),
        };
      }

      const work = listWorkDirectories().find(
        (item) => String(item?.name || "").trim() === workId,
      );
      if (!work?.fsPath) {
        return {
          workTitle: "",
          items: [],
        };
      }

      const filePath = getWritingMemosPathForWork(work.fsPath);
      const data = await readWritingMemos(filePath);
      const memos = Array.isArray(data?.memos) ? data.memos : [];
      const manuscriptRoot = getWorkManuscriptRoot(work.fsPath);

      const currentWorkName = String(getWorkName(context) || "").trim();
      const configuredManuscriptRoot = String(
        vscode.workspace
          .getConfiguration("mojigoto")
          .get("manuscriptRoot", "") || "",
      ).trim();

      const isViewLinkedWork =
        !isSingleMode() &&
        !!configuredManuscriptRoot &&
        String(work?.name || "").trim() === currentWorkName;

      const preferredManuscriptRoot = isViewLinkedWork
        ? configuredManuscriptRoot
        : manuscriptRoot;
      const displayData = preferredManuscriptRoot
        ? readDisplayNamesSync(preferredManuscriptRoot)
        : null;

      return {
        workTitle: String(work?.title || work?.name || "").trim() || "無題作品",
        isViewLinkedWork,
        items: sortWritingMemos(memos).map((memo) => {
          const absoluteFilePath = memo?.filePath
            ? resolveWritingMemoAbsolutePathFlexible(context, memo.filePath, {
                writingMemoFilePath: filePath,
                excerpt: memo?.excerpt || "",
                targetLocation: memo?.targetLocation || "",
              })
            : "";

          return toWritingMemoItem(
            memo,
            absoluteFilePath,
            filePath,
            preferredManuscriptRoot,
            displayData,
          );
        }),
      };
    } catch {
      return {
        workTitle: "",
        items: [],
      };
    }
  }

  return async function buildStatsState(
    context,
    highlightManager = null,
    options = {},
  ) {
    const { dateTimeJst, dateJst } = nowJstParts(new Date());

    const daily = gsGet(context, keyDaily(context), {});
    const files = gsGet(context, keyFiles(context), {});
    const manuscriptRoot = String(
      vscode.workspace
        .getConfiguration("mojigoto")
        .get("manuscriptRoot", "") || "",
    ).trim();
    const displayData = manuscriptRoot
      ? readDisplayNamesSync(manuscriptRoot)
      : null;

    const today = daily[dateJst] || null;
    const todayFilesObj = files[dateJst] || {};
    const todayFiles = Object.keys(todayFilesObj)
      .map((relativePath) => {
        if (!manuscriptRoot || !displayData) return relativePath;
        const absolutePath = path.resolve(manuscriptRoot, relativePath);
        return getDisplayPathLabelFromData(
          displayData,
          manuscriptRoot,
          absolutePath,
          { separator: " / " },
        ) || relativePath;
      })
      .sort((a, b) => a.localeCompare(b, "ja"));

    const todayChapters = [];
    if (today?.chapters) {
      for (const [chapter, v] of Object.entries(today.chapters)) {
        const customChapterName = manuscriptRoot && displayData
          ? getDisplayNameFromData(
              displayData,
              manuscriptRoot,
              path.join(manuscriptRoot, chapter),
            )
          : "";
        todayChapters.push({
          chapter: customChapterName || getDisplayChapterLabel(chapter),
          delta: v?.delta ?? 0,
          total: v?.total ?? 0,
        });
      }
      todayChapters.sort((a, b) =>
        String(a.chapter).localeCompare(String(b.chapter), "ja"),
      );
    }

    const dates = Object.keys(daily).sort();
    const last7 = buildRecentDailyRows(daily, dateJst, 7);
    const todayDerivedDelta = last7.find((row) => row.date === dateJst)
      ?.deltaTotal ?? 0;

    const latestDailyDate = dates.length ? dates[dates.length - 1] : "";
    const latestDaily = latestDailyDate ? daily[latestDailyDate] || null : null;
    const latestSavedTotal = latestDaily?.totalSaved ?? 0;

    const {
      eventLogIntervalMinutes,
      eventsMaxCount,
      eventsRetentionDays,
      dailyRetentionDays,
    } = getStatsRetentionSettings();

    const eventIntervalLabel =
      eventLogIntervalMinutes <= 0
        ? "毎回保存"
        : `${eventLogIntervalMinutes}分ごと`;

    const eventsRetentionLabel =
      eventsRetentionDays <= 0 ? "無制限" : `${eventsRetentionDays}日`;

    const eventsMaxCountLabel =
      eventsMaxCount <= 0 ? "無制限" : `${eventsMaxCount}件`;

    const dailyRetentionLabel =
      dailyRetentionDays <= 0 ? "無制限" : `${dailyRetentionDays}日`;

    const currentWorkTitle =
      getCurrentWorkTitleFromSettings(context) ||
      getWorkName(context);

    const currentWorkGoal = getCurrentWorkGoal(context);
    const currentTotalSaved = latestSavedTotal;

    const currentWorkPctText =
      currentWorkGoal > 0
        ? `${Math.max(0, Math.min(999, (currentTotalSaved / currentWorkGoal) * 100)).toFixed(1)}%`
        : "-";

    const currentWorkDeadline = getCurrentWorkDeadline(context);
    const currentWorkDeadlineText = getDaysLeftText(currentWorkDeadline);

    const eventsRemindMode = getEventsRemindMode();

    const eventsRemindModeLabel =
      eventsRemindMode === "weekly"
        ? "Weekly"
        : eventsRemindMode === "monthly"
          ? "Monthly"
          : "OFF";

    const dashboardNotes = await buildDashboardNotes(context);

    const requestedWritingMemoScope = String(
      options?.writingMemoScope || "",
    ).trim();

    let effectiveWritingMemoScope = requestedWritingMemoScope || "file";
    let writingMemoWorks = [];
    let writingMemoSelectedWorkTitle = String(
      options?.selectedWritingMemoWorkTitle || "",
    ).trim();

    let writingMemos = [];
    let writingMemoTargetPath = "";
    let writingMemoCurrentWorkId = "";
    let writingMemoCurrentWorkTitle = "";
    let writingMemoReturnWorkId = "";
    let writingMemoReturnWorkTitle = "";
    let writingMemoSelectedWorkIsViewLinked = false;

    if (effectiveWritingMemoScope === "workIndex") {
      writingMemoWorks = await buildWritingMemoWorkSummaries(context);
    } else if (effectiveWritingMemoScope === "work") {
      const selectedWorkData = await buildWritingMemosForSelectedWork(
        context,
        options,
      );

      writingMemos = Array.isArray(selectedWorkData?.items)
        ? selectedWorkData.items
        : [];

      writingMemoSelectedWorkTitle = String(
        selectedWorkData?.workTitle || "",
      ).trim();

      writingMemoSelectedWorkIsViewLinked = Boolean(
        selectedWorkData?.isViewLinkedWork,
      );
    } else {
      const writingMemoData = await buildWritingMemoItems(context, options);

      writingMemos = Array.isArray(writingMemoData?.items)
        ? writingMemoData.items
        : [];

      writingMemoTargetPath = String(writingMemoData?.targetPath || "");

      writingMemoCurrentWorkId = String(
        writingMemoData?.currentWorkId || "",
      ).trim();

      writingMemoCurrentWorkTitle = String(
        writingMemoData?.currentWorkTitle || "",
      ).trim();

      const lastOpenedWorkId = String(
        options?.lastOpenedWritingMemoWorkId || "",
      ).trim();

      const lastOpenedWorkTitle = String(
        options?.lastOpenedWritingMemoWorkTitle || "",
      ).trim();

      if (lastOpenedWorkId) {
        writingMemoReturnWorkId = lastOpenedWorkId;
        writingMemoReturnWorkTitle =
          lastOpenedWorkTitle || writingMemoCurrentWorkTitle || "";
      } else {
        writingMemoReturnWorkId = String(writingMemoCurrentWorkId || "").trim();
        writingMemoReturnWorkTitle = String(
          writingMemoCurrentWorkTitle || "",
        ).trim();
      }

      if (!writingMemoTargetPath && !vscode.window.activeTextEditor) {
        effectiveWritingMemoScope = "workIndex";
        writingMemoWorks = await buildWritingMemoWorkSummaries(context);
      }
    }

    const writingMemosVisible = writingMemos.filter((m) => !m.isArchived);
    const writingMemosActive = writingMemosVisible.filter(
      (m) => m.status !== "done",
    );
    const writingMemosDone = writingMemosVisible.filter(
      (m) => m.status === "done",
    );
    const writingMemosArchived = writingMemos.filter((m) => m.isArchived);
    const hasWritingMemoCurrentFile = Boolean(writingMemoTargetPath);

    let writingMemoLastUpdatedAt = "";
    if (effectiveWritingMemoScope === "file") {
      const latest = [...writingMemos]
        .map((m) => String(m?.updatedAt || ""))
        .filter(Boolean)
        .sort()
        .pop();

      if (latest) {
        writingMemoLastUpdatedAt = formatJstDateTimeMinutes(latest);
      }
    }

    return {
      exportedAtJst: `更新: ${dateTimeJst}`,
      today: {
        deltaTotal: today ? todayDerivedDelta : 0,
        totalSaved: latestSavedTotal,
      },
      todayFiles,
      todayChapters,
      last7,
      sheetsEnabled: sheetsEnabled(),
      eventsMode: webhookEventsMode(),
      showEventsRemindStatus:
        sheetsEnabled() && webhookEventsMode() === "onCommand",
      currentWorkGoal,
      currentWorkPctText,
      currentWorkDeadline,
      currentWorkDeadlineText,
      currentWorkTitle,
      countModeLabel: getCountModeLabel ? getCountModeLabel() : "標準",
      dashboardNotes,
      isViewLinkedStats: !isSingleMode(),

      dashboardVisibility: {
        progressGraph: vscode.workspace
          .getConfiguration("mojigoto")
          .get("dashboardShowProgressGraph", true),
        progressGraphMode:
          vscode.workspace
            .getConfiguration("mojigoto")
            .get("dashboardProgressGraphMode", "daily") === "total"
            ? "total"
            : "daily",
        commonTodo: vscode.workspace
          .getConfiguration("mojigoto")
          .get("dashboardShowCommonTodo", true),
        text: vscode.workspace
          .getConfiguration("mojigoto")
          .get("dashboardShowTextMemos", false),
        list: vscode.workspace
          .getConfiguration("mojigoto")
          .get("dashboardShowListMemos", false),
        todo: vscode.workspace
          .getConfiguration("mojigoto")
          .get("dashboardShowTodoMemos", true),
      },

      writingMemoScope: effectiveWritingMemoScope,
      writingMemos,
      writingMemoTargetPath,
      hasWritingMemoCurrentFile,
      writingMemoCurrentWorkId,
      writingMemoCurrentWorkTitle,
      writingMemoReturnWorkId,
      writingMemoReturnWorkTitle,
      writingMemoSelectedWorkIsViewLinked,
      writingMemoWorks,
      writingMemoSelectedWorkId: String(
        options?.selectedWritingMemoWorkId || "",
      ),
      writingMemoSelectedWorkTitle,
      writingMemoLastUpdatedAt,

      writingMemosActive,
      writingMemosDone,
      writingMemosArchived,

      writingMemosForSelectedWorkActive:
        effectiveWritingMemoScope === "work" ? writingMemosActive : [],
      writingMemosForSelectedWorkDone:
        effectiveWritingMemoScope === "work" ? writingMemosDone : [],
      writingMemosForSelectedWorkArchived:
        effectiveWritingMemoScope === "work" ? writingMemosArchived : [],

      editingWritingMemoId: String(options?.editingWritingMemoId || ""),
      writingMemoDecorationsEnabled: vscode.workspace
        .getConfiguration("mojigoto")
        .get("writingMemoDecorationsEnabled", true),

      retention: {
        eventLogIntervalMinutes,
        eventsMaxCount,
        eventsRetentionDays,
        dailyRetentionDays,
        eventIntervalLabel,
        eventsRetentionLabel,
        eventsMaxCountLabel,
        dailyRetentionLabel,
      },

      reminder: {
        eventsRemindMode,
        eventsRemindModeLabel,
      },

      highlight: highlightManager
        ? highlightManager.getUiState()
        : {
            enabled: false,
            currentFile: "",
            currentFilePath: "",
            totalCount: 0,
            groups: [],
            details: [],
          },
    };
  };
}

module.exports = {
  createBuildStatsState,
  buildRecentDateKeys,
  buildRecentDailyRows,
};
