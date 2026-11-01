function makeStatsScript() {
  return `
    const vscode = acquireVsCodeApi();
    const statsScriptStarted = Date.now();
    const uiState = vscode.getState() || {};
    const initiallyOpenSaveSettings = document.getElementById("retentionSectionBody")?.dataset.initialOpen === "true";
    let activeTab = initiallyOpenSaveSettings ? "dashboard" : uiState.activeTab || "dashboard";
    const savedHideZeroGroups = document.body.dataset.hideZeroGroups;
    let hideZeroGroups = savedHideZeroGroups === "true" ? true
      : savedHideZeroGroups === "false" ? false : Boolean(uiState.hideZeroGroups);
    let selectedHighlightGroup = uiState.selectedHighlightGroup || "";
    let headingBatchLevel = ["1", "2", "3"].includes(String(uiState.headingBatchLevel || ""))
      ? String(uiState.headingBatchLevel)
      : "1";
    let selectedHeadingTargetKeys = new Set();
    let openDashboardNoteId = uiState.openDashboardNoteId || "";
    let isDashboardNoteModalOpen = Boolean(uiState.isDashboardNoteModalOpen);
    let isRetentionOpen = initiallyOpenSaveSettings || Boolean(uiState.isRetentionOpen);
    let isWebMarkdownOpen = Boolean(uiState.isWebMarkdownOpen);
    let expandedDashboardSections = uiState.expandedDashboardSections || {};
    // Webview の再描画後は、保存済み UI 状態ではなくホストが描画した編集欄を正とする。
    let editingWritingMemoId =
      document.querySelector("[data-writing-memo-edit-body]")
        ?.getAttribute("data-writing-memo-edit-body") || "";
    let openWritingMemoId = uiState.openWritingMemoId || "";
    let openWritingMemoStatus = uiState.openWritingMemoStatus || {
      memoId: "",
      writingMemoFilePath: "",
    };
    let activeWritingMemoSecondaryTab =
      uiState.activeWritingMemoSecondaryTab || "done";
    let isWritingMemoSecondaryOpen =
      uiState.isWritingMemoSecondaryOpen ?? false;

    let highlightDetails = [];
    let dashboardNotes = {};
    let progressSummary = {};
    let progressSummaries = {};
    let progressShareDate = String(uiState.progressShareDate || "today");
    let progressShareMode = uiState.progressShareMode === "monthly" ? "monthly" : "daily";
    if (uiState.progressShareMode === "annual") progressShareMode = "annual";
    let progressShareYear = Math.min(2100, Math.max(2000, Number(uiState.progressShareYear) || new Date().getFullYear()));
    let progressShareOptions = {
      title: true,
      graph: true,
      total: true,
      today: true,
      week: true,
      notes: true,
      concepts: true,
      works: true,
      annualWorks: true,
      ...(uiState.progressShareOptions || {}),
    };
    let statsToastTimer = null;

    let writingMemoViewMode = uiState.writingMemoViewMode || "file";
    let selectedWritingMemoWorkId = uiState.selectedWritingMemoWorkId || "";
    let selectedWritingMemoWorkTitle = uiState.selectedWritingMemoWorkTitle || "";

    try {
      const dashboardNotesEl = document.getElementById("dashboardNotesData");
      if (dashboardNotesEl) {
        dashboardNotes = JSON.parse(dashboardNotesEl.textContent || "{}");
      }
    } catch (e) {
      console.error("[mojigoto] dashboardNotes parse error:", e);
      dashboardNotes = {};
    }

    window.__dashboardNotes = dashboardNotes;

    try {
      const progressSummaryEl = document.getElementById("progressSummaryData");
      if (progressSummaryEl) {
        progressSummaries = JSON.parse(progressSummaryEl.textContent || "{}");
        const todayDate = String(progressSummaries.today?.period?.date || "");
        const previousDate = String(progressSummaries.previous?.period?.date || "");
        if (progressShareDate === "today") progressShareDate = todayDate;
        if (progressShareDate === "previous") progressShareDate = previousDate;
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(progressShareDate)) {
          progressShareDate = todayDate;
        }
        progressSummary =
          progressSummaries.byDate?.[progressShareDate] ||
          progressSummaries.today ||
          {};
      }
    } catch (e) {
      console.error("[mojigoto] progressSummary parse error:", e);
      progressSummary = {};
    }

    try {
      const detailsEl = document.getElementById("highlightDetailsData");
      if (detailsEl) {
        highlightDetails = JSON.parse(detailsEl.textContent || "[]");
      }
    } catch (e) {
      console.error("[mojigoto] highlightDetails parse error:", e);
      highlightDetails = [];
    }

    function showStatsToast(message) {
      const toast = document.getElementById("statsToast");
      if (!toast) return;

      toast.textContent = String(message || "");
      toast.classList.add("is-visible");

      if (statsToastTimer) {
        clearTimeout(statsToastTimer);
      }

      statsToastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
      }, 1800);
    }

    function escapeHtml(text) {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function saveUiState() {
      vscode.setState({
        ...uiState,
        activeTab,
        hideZeroGroups,
        selectedHighlightGroup,
        headingBatchLevel,
        openDashboardNoteId,
        isDashboardNoteModalOpen,
        isRetentionOpen,
        isWebMarkdownOpen,
        expandedDashboardSections,
        progressShareOptions,
        progressShareDate,
        progressShareMode,
        progressShareYear,
        editingWritingMemoId,
        openWritingMemoId,
        openWritingMemoStatus,
        activeWritingMemoSecondaryTab,
        isWritingMemoSecondaryOpen,
        writingMemoViewMode,
        selectedWritingMemoWorkId,
        selectedWritingMemoWorkTitle,
      });
    }

    function bindDashboardSectionActions() {
      document.querySelectorAll("[data-dashboard-more]").forEach((el) => {
        el.addEventListener("click", () => {
          const sectionKey = el.getAttribute("data-dashboard-more") || "";
          if (!sectionKey) return;

          expandedDashboardSections = {
            ...expandedDashboardSections,
            [sectionKey]: !expandedDashboardSections[sectionKey],
          };

          saveUiState();
          applyDashboardSectionVisibility();
        });
      });
    }

    function buildWritingMemoState(context) {
      const activeEditor = vscode.window.activeTextEditor;
      const activePath = activeEditor?.document?.uri?.fsPath || "";

      if (!activePath) {
        return {
          writingMemoScope: "workIndex",
          writingMemoWorks: getWritingMemoWorkSummaries(context),
          writingMemosActive: [],
          writingMemosDone: [],
          writingMemosArchived: [],
          writingMemoTargetPath: "",
        };
      }

      const fileData = getWritingMemosForActiveFile(context, activePath);

      return {
        writingMemoScope: "file",
        writingMemoTargetPath: fileData.targetPath || "",
        writingMemosActive: fileData.active || [],
        writingMemosDone: fileData.done || [],
        writingMemosArchived: fileData.archived || [],
      };
    }

    function renderTabs() {
      const dashboardBtn = document.getElementById("tabDashboardBtn");
      const statsBtn = document.getElementById("tabStatsBtn");
      const writingMemoBtn = document.getElementById("tabWritingMemoBtn");
      const highlightBtn = document.getElementById("tabHighlightBtn");

      const dashboardPanel = document.getElementById("dashboardTabPanel");
      const statsPanel = document.getElementById("statsTabPanel");
      const writingMemoPanel = document.getElementById("writingMemoTabPanel");
      const highlightPanel = document.getElementById("highlightTabPanel");

      if (
        !dashboardBtn || !statsBtn || !writingMemoBtn || !highlightBtn ||
        !dashboardPanel || !statsPanel || !writingMemoPanel || !highlightPanel
      ) {
        return;
      }

      const isDashboard = activeTab === "dashboard";
      const isStats = activeTab === "stats";
      const isWritingMemo = activeTab === "writingMemo";
      const isHighlight = activeTab === "highlight";

      dashboardBtn.classList.toggle("is-active", isDashboard);
      statsBtn.classList.toggle("is-active", isStats);
      writingMemoBtn.classList.toggle("is-active", isWritingMemo);
      highlightBtn.classList.toggle("is-active", isHighlight);

      dashboardPanel.classList.toggle("is-active", isDashboard);
      statsPanel.classList.toggle("is-active", isStats);
      writingMemoPanel.classList.toggle("is-active", isWritingMemo);
      highlightPanel.classList.toggle("is-active", isHighlight);
    }

    function renderHighlightedPreview(item) {
      const text = String(item?.preview || "");
      const start = Math.max(0, Number(item?.startCharacter || 0));
      const end = Math.max(start, Number(item?.endCharacter || start));

      const before = text.slice(0, start);
      const hit = text.slice(start, end);
      const after = text.slice(end);

      return (
        escapeHtml(before) +
        '<span class="hl-inline-hit">' +
        escapeHtml(hit || text.slice(start, start + 1) || "") +
        "</span>" +
        escapeHtml(after)
      );
    }

    function renderDashboardModalBody(note) {
      const type = String(note?.type || "text");

      if (type === "list") {
        const items = Array.isArray(note?.listItems) ? note.listItems : [];
        if (!items.length) {
          return '<div class="muted">リスト項目はありません。</div>';
        }

        return (
          '<ul class="dashboardModalList">' +
          items
            .map((item) => {
              const text = String(item?.text || "").trim();
              return '<li>' + escapeHtml(text || "（空項目）") + '</li>';
            })
            .join("") +
          '</ul>'
        );
      }

      if (type === "todo") {
        const items = Array.isArray(note?.todoItems) ? note.todoItems : [];
        if (!items.length) {
          return '<div class="muted">TODO項目はありません。</div>';
        }

        return (
          '<div class="dashboardTodoList">' +
          items
            .map((item) => {
              const done = !!item?.done;
              const text = String(item?.text || "").trim();
              return (
                '<div class="dashboardTodoItem" ' +
                  'data-dashboard-todo ' +
                  'data-memo-id="' + escapeHtml(note.id) + '" ' +
                  'data-item-id="' + escapeHtml(item.id) + '" ' +
                '>' +
                  '<span class="dashboardTodoCheck">' + (done ? '☑' : '☐') + '</span>' +
                  '<span class="dashboardTodoItemText' + (done ? ' is-done' : '') + '">' +
                    escapeHtml(text || "（空項目）") +
                  '</span>' +
                '</div>'
              );
            })
            .join("") +
          '</div>'
        );
      }

      const body = String(note?.body || "").trim();
      return body
        ? '<div class="dashboardModalText">' + escapeHtml(body) + '</div>'
        : '<div class="muted">本文はありません。</div>';
    }

    function openWritingMemoStatusMenu(memoId, writingMemoFilePath, anchorEl) {
      const overlay = document.getElementById("writingMemoStatusMenuOverlay");
      const menu = document.getElementById("writingMemoStatusMenu");
      if (!overlay || !menu || !anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();

      menu.style.top = \`\${rect.bottom + window.scrollY + 4}px\`;
      menu.style.left = \`\${rect.right + window.scrollX - 120}px\`;

      openWritingMemoStatus = {
        memoId: String(memoId || ""),
        writingMemoFilePath: String(writingMemoFilePath || ""),
      };
      saveUiState();
      overlay.classList.add("is-open");
    }

    function closeWritingMemoStatusMenu() {
      const overlay = document.getElementById("writingMemoStatusMenuOverlay");
      if (!overlay) return;

      overlay.classList.remove("is-open");
      openWritingMemoStatus = {
        memoId: "",
        writingMemoFilePath: "",
      };
      saveUiState();
    }

    function submitWritingMemoSave(memoId, writingMemoFilePath = "") {
      const safeMemoId = String(memoId || "");
      if (!safeMemoId) return;

      const textarea = document.querySelector(
        '[data-writing-memo-edit-body="' + safeMemoId + '"]'
      );

      if (!textarea) return;

      const body = textarea.value ?? "";

      vscode.postMessage({
        type: "updateWritingMemo",
        memoId: safeMemoId,
        writingMemoFilePath: String(writingMemoFilePath || ""),
        body,
      });
    }

    function openDashboardNoteModal(note) {
      const overlay = document.getElementById("dashboardNoteModalOverlay");
      const titleEl = document.getElementById("dashboardNoteModalTitle");
      const metaEl = document.getElementById("dashboardNoteModalMeta");
      const tagsEl = document.getElementById("dashboardNoteModalTags");
      const bodyEl = document.getElementById("dashboardNoteModalBody");
      const copyBtn = document.getElementById("dashboardCopyConceptMemoBtn");
      const openBtn = document.getElementById("dashboardOpenConceptMemoBtn");
      const toggleBtn = document.getElementById("dashboardToggleVisibilityBtn");
      const sourceEl = document.getElementById("dashboardNoteModalSource");

      if (!overlay || !titleEl || !metaEl || !tagsEl || !bodyEl) return;

      titleEl.textContent = String(note?.title || "無題メモ");

      const typeMap = {
        text: "通常メモ",
        list: "リストメモ",
        todo: "TODOメモ",
      };
      const typeLabel = typeMap[String(note?.type || "text")] || "通常メモ";
      metaEl.textContent = typeLabel;

      tagsEl.innerHTML = renderDashboardModalTags(note);
      bodyEl.innerHTML = renderDashboardModalBody(note);

      if (copyBtn) {
        const isText = String(note?.type || "text") === "text";
        copyBtn.style.display = isText ? "" : "none";
        copyBtn.setAttribute("data-memo-id", String(note?.id || ""));
        copyBtn.setAttribute("data-memo-body", String(note?.body || ""));
      }

      if (openBtn) {
        openBtn.setAttribute("data-memo-id", String(note?.id || ""));
      }

      if (toggleBtn) {
        toggleBtn.setAttribute("data-memo-id", String(note?.id || ""));
        toggleBtn.textContent = note?.showInDashboard
          ? "ダッシュボード表示OFF"
          : "ダッシュボード表示ON";
      }

      if (sourceEl) {
        sourceEl.textContent = String(note?.sourceText || "");
        sourceEl.style.display = note?.sourceText ? "" : "none";
      }

      openDashboardNoteId = String(note?.id || "");
      isDashboardNoteModalOpen = true;
      saveUiState();

      overlay.classList.add("is-open");
    }

    function closeDashboardNoteModal() {
      const overlay = document.getElementById("dashboardNoteModalOverlay");
      if (!overlay) return;

      overlay.classList.remove("is-open");

      isDashboardNoteModalOpen = false;
      openDashboardNoteId = "";
      saveUiState();
    }

    function renderDashboardModalTags(note) {
      const tags = Array.isArray(note?.tags) ? note.tags : [];
      if (!tags.length) return "";

      return tags
        .map((tag) => {
          return '<span class="dashboardModalTag">' + escapeHtml(tag) + '</span>';
        })
        .join("");
    }

    function findDashboardNoteById(noteId) {
      if (!noteId) return null;

      const sections = [
        "normal",
        "list",
        "todo",
      ];

      const dashboardNotes = window.__dashboardNotes || {};

      for (const key of sections) {
        const items = Array.isArray(dashboardNotes[key]) ? dashboardNotes[key] : [];
        const found = items.find((note) => String(note?.id || "") === String(noteId));
        if (found) {
          return found;
        }
      }

      return null;
    }

    function restoreDashboardNoteModal() {
      if (!isDashboardNoteModalOpen || !openDashboardNoteId) return;

      const note = findDashboardNoteById(openDashboardNoteId);
      if (!note) {
        isDashboardNoteModalOpen = false;
        openDashboardNoteId = "";
        saveUiState();
        return;
      }

      openDashboardNoteModal(note);
    }

    function bindDashboardTodoActions() {
      const bodyEl = document.getElementById("dashboardNoteModalBody");
      if (!bodyEl) return;

      bodyEl.addEventListener("click", (event) => {
        const todoEl = event.target.closest("[data-dashboard-todo]");
        if (!todoEl) return;

        event.preventDefault();
        event.stopPropagation();

        const memoId = todoEl.getAttribute("data-memo-id");
        const itemId = todoEl.getAttribute("data-item-id");

        if (!memoId || !itemId) return;

        vscode.postMessage({
          type: "toggleDashboardTodo",
          memoId,
          itemId,
        });
      });
    }

    function formatProgressNumber(value, signed) {
      const number = Number(value || 0);
      const absolute = Math.abs(number).toLocaleString("ja-JP");
      if (signed && number > 0) return "+" + absolute;
      if (number < 0) return "-" + absolute;
      return absolute;
    }

    function progressDateLabel(value) {
      const text = String(value || "");
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return text || "-";
      const parts = text.split("-");
      return Number(parts[0]) + "/" + Number(parts[1]) + "/" + Number(parts[2]);
    }

    function createProgressShareText() {
      const stats = progressSummary.stats || {};
      const work = progressSummary.work || {};
      const period = progressSummary.period || {};
      if (progressShareMode === "annual") {
        const lines = [String(period.date || "").slice(0, 4) + "年の作品全体まとめ"];
        lines.push("年間の執筆 " + formatProgressNumber(stats.yearCharacters, true) + "文字");
        if (progressShareOptions.annualWorks) {
          (Array.isArray(progressSummary.annualWorkBreakdown) ? progressSummary.annualWorkBreakdown : []).forEach((row) => {
            const value = Number(row?.characters || 0);
            if (value !== 0) lines.push("『" + String(row?.title || "").trim() + "』 " + formatProgressNumber(value, true) + "文字");
          });
        }
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisYear || 0) !== 0) lines.push("年間のノート更新 " + formatProgressNumber(stats.notesUpdatedThisYear) + "件");
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisYear || 0) !== 0) lines.push("年間の構想メモ更新 " + formatProgressNumber(stats.conceptMemosUpdatedThisYear) + "件");
        lines.push("", "#もじごと");
        return lines.join("\\n");
      }
      if (progressShareMode === "monthly") {
        const monthLabel = String(period.date || "").slice(0, 7).replace("-", "/");
        const lines = [monthLabel + "の作品全体まとめ"];
        lines.push("今月の執筆 " + formatProgressNumber(stats.monthCharacters, true) + "文字");
        if (progressShareOptions.works) {
          (Array.isArray(progressSummary.workBreakdown) ? progressSummary.workBreakdown : []).forEach((row) => {
            const value = Number(row?.characters || 0);
            if (value !== 0) lines.push("『" + String(row?.title || "").trim() + "』 " + formatProgressNumber(value, true) + "文字");
          });
        }
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisMonth || 0) !== 0) {
          lines.push("今月のノート更新 " + formatProgressNumber(stats.notesUpdatedThisMonth) + "件");
        }
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisMonth || 0) !== 0) {
          lines.push("今月の構想メモ更新 " + formatProgressNumber(stats.conceptMemosUpdatedThisMonth) + "件");
        }
        lines.push("", "#もじごと");
        return lines.join("\\n");
      }
      const isToday = progressShareDate === String(progressSummaries.today?.period?.date || "");
      const lines = [progressDateLabel(period.date) + "の執筆進捗"];
      if (progressShareOptions.title && work.title) {
        lines.push("『" + String(work.title).trim() + "』");
      }
      if (progressShareOptions.today) {
        lines.push((isToday ? "今日 " : "当日 ") + formatProgressNumber(stats.todayCharacters, true) + "文字");
      }
      if (progressShareOptions.week) {
        lines.push("7日間 " + formatProgressNumber(stats.last7DaysCharacters, true) + "文字");
      }
      if (progressShareOptions.total) {
        lines.push("総文字数 " + formatProgressNumber(stats.totalCharacters) + "文字");
      }
      if (progressShareOptions.notes) {
        lines.push("ノート更新 " + formatProgressNumber(stats.notesUpdatedToday) + "件");
      }
      if (progressShareOptions.concepts) {
        lines.push("構想メモ更新 " + formatProgressNumber(stats.conceptMemosUpdatedToday) + "件");
      }
      lines.push("", "#もじごと");
      return lines.join("\\n");
    }

    function renderProgressSharePreview() {
      const card = document.getElementById("progressShareCard");
      if (!card) return;

      const stats = progressSummary.stats || {};
      const work = progressSummary.work || {};
      const period = progressSummary.period || {};
      const graphRows = progressShareMode === "annual"
        ? (Array.isArray(progressSummary.annual) ? progressSummary.annual : [])
        : progressShareMode === "monthly"
          ? (Array.isArray(progressSummary.monthly) ? progressSummary.monthly.slice(-6) : [])
        : (Array.isArray(progressSummary.daily) ? progressSummary.daily.slice(-7) : []);
      const maxValue = Math.max(1, ...graphRows.map((row) => Math.abs(Number(row?.characters || 0))));
      const graph = graphRows.map((row) => {
        const value = Number(row?.characters || 0);
        const height = value === 0 ? 2 : Math.max(8, Math.round((Math.abs(value) / maxValue) * 100));
        const shortDate = progressShareMode === "annual" || progressShareMode === "monthly"
          ? Number(String(row?.month || "").slice(5)) + "月"
          : String(row?.date || "").slice(5).replace("-", "/");
        return '<div class="progressShareBarItem">' +
          '<div class="progressShareBarValue">' + escapeHtml(formatProgressNumber(value, true)) + '</div>' +
          '<div class="progressShareBarTrack"><div class="progressShareBar ' + (value < 0 ? 'is-negative' : '') + '" style="height:' + height + '%"></div></div>' +
          '<div class="progressShareBarDate">' + escapeHtml(shortDate || "-") + '</div>' +
        '</div>';
      }).join("");
      const metrics = [];
      if (progressShareMode === "annual") {
        metrics.push('<div class="progressShareMetric is-primary"><span>年間の執筆</span><strong>' + escapeHtml(formatProgressNumber(stats.yearCharacters, true)) + '</strong><small>文字</small></div>');
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisYear || 0) !== 0) metrics.push('<div class="progressShareMetric"><span>年間のノート更新</span><strong>' + escapeHtml(formatProgressNumber(stats.notesUpdatedThisYear)) + '</strong><small>件</small></div>');
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisYear || 0) !== 0) metrics.push('<div class="progressShareMetric"><span>年間の構想メモ更新</span><strong>' + escapeHtml(formatProgressNumber(stats.conceptMemosUpdatedThisYear)) + '</strong><small>件</small></div>');
      } else if (progressShareMode === "monthly") {
        metrics.push('<div class="progressShareMetric is-primary"><span>今月の執筆</span><strong>' + escapeHtml(formatProgressNumber(stats.monthCharacters, true)) + '</strong><small>文字</small></div>');
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisMonth || 0) !== 0) {
          metrics.push('<div class="progressShareMetric"><span>今月のノート更新</span><strong>' + escapeHtml(formatProgressNumber(stats.notesUpdatedThisMonth)) + '</strong><small>件</small></div>');
        }
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisMonth || 0) !== 0) {
          metrics.push('<div class="progressShareMetric"><span>今月の構想メモ更新</span><strong>' + escapeHtml(formatProgressNumber(stats.conceptMemosUpdatedThisMonth)) + '</strong><small>件</small></div>');
        }
      } else if (progressShareOptions.total) {
        metrics.push('<div class="progressShareMetric is-primary"><span>総文字数</span><strong>' + escapeHtml(formatProgressNumber(stats.totalCharacters)) + '</strong><small>文字</small></div>');
      }
      if (progressShareMode === "daily" && progressShareOptions.today) {
        const isToday = progressShareDate === String(progressSummaries.today?.period?.date || "");
        metrics.push('<div class="progressShareMetric"><span>' + (isToday ? "今日" : "当日") + '</span><strong>' + escapeHtml(formatProgressNumber(stats.todayCharacters, true)) + '</strong><small>文字</small></div>');
      }
      if (progressShareMode === "daily" && progressShareOptions.week) {
        metrics.push('<div class="progressShareMetric"><span>7日間</span><strong>' + escapeHtml(formatProgressNumber(stats.last7DaysCharacters, true)) + '</strong><small>文字</small></div>');
      }
      if (progressShareMode === "daily" && progressShareOptions.notes) {
        metrics.push('<div class="progressShareMetric"><span>ノート更新</span><strong>' + escapeHtml(formatProgressNumber(stats.notesUpdatedToday)) + '</strong><small>件</small></div>');
      }
      if (progressShareMode === "daily" && progressShareOptions.concepts) {
        metrics.push('<div class="progressShareMetric"><span>構想メモ更新</span><strong>' + escapeHtml(formatProgressNumber(stats.conceptMemosUpdatedToday)) + '</strong><small>件</small></div>');
      }

      const workBreakdown = progressShareMode === "annual" && progressShareOptions.annualWorks
        ? (Array.isArray(progressSummary.annualWorkBreakdown) ? progressSummary.annualWorkBreakdown : []).filter((row) => Number(row?.characters || 0) !== 0)
        : progressShareMode === "monthly" && progressShareOptions.works
          ? (Array.isArray(progressSummary.workBreakdown) ? progressSummary.workBreakdown : []).filter((row) => Number(row?.characters || 0) !== 0)
          : [];
      const workBreakdownHtml = workBreakdown.length
        ? '<div class="progressShareWorkBreakdown"><div class="progressShareWorkBreakdownTitle">' + (progressShareMode === "annual" ? "作品ごとの年間差分" : "作品ごとの今月差分") + '</div>' + workBreakdown.map((row) => '<div class="progressShareWorkBreakdownRow"><span>' + escapeHtml(row?.title || "作品") + '</span><strong>' + escapeHtml(formatProgressNumber(row?.characters, true)) + '文字</strong></div>').join("") + '</div>'
        : '';

      card.innerHTML =
        '<div class="progressShareCardTop">' +
          '<div class="progressShareCardBrand">' +
            '<img class="progressShareCardLogo" src="' + escapeHtml(document.getElementById("progressShareLogoSource")?.src || "") + '" alt="">' +
            '<span>もじごと</span>' +
          '</div>' +
          '<div class="progressShareCardDate">' + escapeHtml(progressDateLabel(period.date)) + '</div>' +
        '</div>' +
        '<div class="progressShareCardContent">' +
          (progressShareMode === "monthly" || progressShareMode === "annual"
            ? '<h4 class="progressShareCardTitle">作品全体</h4>'
            : progressShareOptions.title && work.title
              ? '<h4 class="progressShareCardTitle">' + escapeHtml(work.title) + '</h4>'
            : '') +
          (progressShareOptions.graph
            ? '<div class="progressShareGraph"><div class="progressShareGraphLabel">' + (progressShareMode === "annual" ? String(period.date || "").slice(0, 4) + "年 1～12月の執筆" : progressShareMode === "monthly" ? "直近6か月の執筆" : "直近7日の執筆") + '</div><div class="progressShareBars ' + (progressShareMode === "annual" ? "is-annual" : progressShareMode === "monthly" ? "is-monthly" : "") + '">' + graph + '</div></div>'
            : '') +
          '<div class="progressShareMetrics is-count-' + metrics.length + '">' + metrics.join("") + '</div>' +
          workBreakdownHtml +
        '</div>' +
        '<div class="progressShareCardFoot">#もじごと</div>';
    }

    function layoutProgressSharePreview() {
      const stage = document.querySelector(".progressSharePreviewStage");
      const scaler = document.getElementById("progressSharePreviewScaler");
      const card = document.getElementById("progressShareCard");
      if (!stage || !scaler || !card || stage.clientWidth <= 0) return;
      const baseSize = 480;
      const stageStyle = window.getComputedStyle(stage);
      const horizontalPadding =
        Number.parseFloat(stageStyle.paddingLeft || "0") +
        Number.parseFloat(stageStyle.paddingRight || "0");
      const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
      const scale = Math.min(1, availableWidth / baseSize);
      card.style.height = "auto";
      const baseHeight = Math.max(1, card.scrollHeight, card.offsetHeight);
      scaler.style.width = Math.round(baseSize * scale) + "px";
      scaler.style.height = Math.ceil(baseHeight * scale) + "px";
      card.style.transformOrigin = "top left";
      card.style.transform = "scale(" + scale + ")";
    }

    function updateProgressShareModeControls() {
      const monthly = progressShareMode === "monthly";
      const annual = progressShareMode === "annual";
      document.querySelectorAll(".progressShareDailyOnly").forEach((label) => { label.hidden = monthly || annual; });
      document.querySelectorAll(".progressShareMonthlyOnly").forEach((label) => { label.hidden = !monthly; });
      document.querySelectorAll(".progressShareAnnualOnly").forEach((label) => { label.hidden = !annual; });
      const dateField = document.getElementById("progressShareDateField");
      const yearField = document.getElementById("progressShareYearField");
      if (dateField) dateField.hidden = annual;
      if (yearField) yearField.hidden = !annual;
      const graphLabel = document.getElementById("progressShareGraphLabel");
      if (graphLabel) graphLabel.textContent = annual ? "12か月グラフ" : monthly ? "6か月グラフ" : "7日間グラフ";
    }

    function selectAnnualProgressSummary() {
      const year = String(progressShareYear);
      if (progressSummaries.byYear?.[year]) {
        progressSummary = progressSummaries.byYear[year];
        return;
      }
      const date = Object.keys(progressSummaries.byDate || {}).filter((value) => value.startsWith(year + "-")).sort().at(-1);
      if (date) {
        progressSummary = progressSummaries.byDate[date];
        return;
      }
      const fallback = progressSummaries.today || {};
      progressSummary = {
        ...fallback,
        period: { ...(fallback.period || {}), date: year + "-12-31" },
        annual: Array.from({ length: 12 }, (_, index) => ({ month: year + "-" + String(index + 1).padStart(2, "0"), characters: 0 })),
        annualWorkBreakdown: [],
        stats: { ...(fallback.stats || {}), yearCharacters: 0, notesUpdatedThisYear: 0, conceptMemosUpdatedThisYear: 0 },
      };
    }

    function openProgressShareModal() {
      document.getElementById("progressShareModalOverlay")?.classList.add("is-open");
      const dateInput = document.getElementById("progressShareDateSelect");
      const dates = Object.keys(progressSummaries.byDate || {}).sort();
      if (dateInput && dates.length) {
        dateInput.min = dates[0];
        dateInput.max = dates[dates.length - 1];
        if (!progressSummaries.byDate?.[progressShareDate]) {
          progressShareDate = String(progressSummaries.today?.period?.date || dates[dates.length - 1]);
          progressSummary = progressSummaries.byDate?.[progressShareDate] || progressSummaries.today || {};
        }
        dateInput.value = progressShareDate;
      }
      const modeInput = document.getElementById("progressShareMode");
      if (modeInput) modeInput.value = progressShareMode;
      const yearInput = document.getElementById("progressShareYearSelect");
      if (yearInput) yearInput.value = String(progressShareYear);
      if (progressShareMode === "annual") selectAnnualProgressSummary();
      updateProgressShareModeControls();
      document.querySelectorAll("[data-progress-share-option]").forEach((input) => {
        const key = input.getAttribute("data-progress-share-option") || "";
        input.checked = progressShareOptions[key] !== false;
      });
      renderProgressSharePreview();
      requestAnimationFrame(layoutProgressSharePreview);
    }

    function closeProgressShareModal() {
      document.getElementById("progressShareModalOverlay")?.classList.remove("is-open");
    }

    function progressCanvasRoundRect(context, x, y, width, height, radius, fill, stroke) {
      const safeRadius = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + safeRadius, y);
      context.arcTo(x + width, y, x + width, y + height, safeRadius);
      context.arcTo(x + width, y + height, x, y + height, safeRadius);
      context.arcTo(x, y + height, x, y, safeRadius);
      context.arcTo(x, y, x + width, y, safeRadius);
      context.closePath();
      if (fill) {
        context.fillStyle = fill;
        context.fill();
      }
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = 2;
        context.stroke();
      }
    }

    function progressCanvasTextLines(context, text, maxWidth, maxLines) {
      const characters = Array.from(String(text || ""));
      const lines = [];
      let line = "";
      characters.forEach((character) => {
        const next = line + character;
        if (line && context.measureText(next).width > maxWidth) {
          lines.push(line);
          line = character;
        } else {
          line = next;
        }
      });
      if (line) lines.push(line);
      const limited = lines.slice(0, maxLines);
      if (lines.length > maxLines && limited.length) {
        let last = limited[limited.length - 1];
        while (last && context.measureText(last + "…").width > maxWidth) {
          last = last.slice(0, -1);
        }
        limited[limited.length - 1] = last + "…";
      }
      return limited;
    }

    function createProgressShareCanvas() {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1000;
      let context = canvas.getContext("2d");
      if (!context) throw new Error("Canvasを初期化できませんでした。");

      const stats = progressSummary.stats || {};
      const work = progressSummary.work || {};
      const period = progressSummary.period || {};
      const graphRows = progressShareMode === "annual"
        ? (Array.isArray(progressSummary.annual) ? progressSummary.annual : [])
        : progressShareMode === "monthly"
          ? (Array.isArray(progressSummary.monthly) ? progressSummary.monthly.slice(-6) : [])
        : (Array.isArray(progressSummary.daily) ? progressSummary.daily.slice(-7) : []);
      const workBreakdown = progressShareMode === "annual" && progressShareOptions.annualWorks
        ? (Array.isArray(progressSummary.annualWorkBreakdown) ? progressSummary.annualWorkBreakdown : []).filter((row) => Number(row?.characters || 0) !== 0)
        : progressShareMode === "monthly" && progressShareOptions.works
          ? (Array.isArray(progressSummary.workBreakdown) ? progressSummary.workBreakdown : []).filter((row) => Number(row?.characters || 0) !== 0)
          : [];
      const padding = 34;

      const cardTitle = progressShareMode === "monthly" || progressShareMode === "annual" ? "作品全体" : work.title;
      const titleLines = (progressShareMode === "monthly" || progressShareMode === "annual" || progressShareOptions.title) && cardTitle
        ? (() => {
          context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
          return progressCanvasTextLines(context, cardTitle, canvas.width - padding * 2, 2);
        })()
        : [];
      const metrics = [];
      if (progressShareMode === "annual") {
        metrics.push(["年間の執筆", formatProgressNumber(stats.yearCharacters, true), "文字"]);
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisYear || 0) !== 0) metrics.push(["年間のノート更新", formatProgressNumber(stats.notesUpdatedThisYear), "件"]);
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisYear || 0) !== 0) metrics.push(["年間の構想メモ更新", formatProgressNumber(stats.conceptMemosUpdatedThisYear), "件"]);
      } else if (progressShareMode === "monthly") {
        metrics.push(["今月の執筆", formatProgressNumber(stats.monthCharacters, true), "文字"]);
        if (progressShareOptions.notes && Number(stats.notesUpdatedThisMonth || 0) !== 0) metrics.push(["今月のノート更新", formatProgressNumber(stats.notesUpdatedThisMonth), "件"]);
        if (progressShareOptions.concepts && Number(stats.conceptMemosUpdatedThisMonth || 0) !== 0) metrics.push(["今月の構想メモ更新", formatProgressNumber(stats.conceptMemosUpdatedThisMonth), "件"]);
      } else if (progressShareOptions.total) metrics.push(["総文字数", formatProgressNumber(stats.totalCharacters), "文字"]);
      if (progressShareMode === "daily" && progressShareOptions.today) {
        const isToday = progressShareDate === String(progressSummaries.today?.period?.date || "");
        metrics.push([isToday ? "今日" : "当日", formatProgressNumber(stats.todayCharacters, true), "文字"]);
      }
      if (progressShareMode === "daily" && progressShareOptions.week) metrics.push(["7日間", formatProgressNumber(stats.last7DaysCharacters, true), "文字"]);
      if (progressShareMode === "daily" && progressShareOptions.notes) metrics.push(["ノート更新", formatProgressNumber(stats.notesUpdatedToday), "件"]);
      if (progressShareMode === "daily" && progressShareOptions.concepts) metrics.push(["構想メモ更新", formatProgressNumber(stats.conceptMemosUpdatedToday), "件"]);
      const columns = Math.min(2, Math.max(1, metrics.length));
      const metricRows = metrics.length ? Math.ceil(metrics.length / columns) : 0;
      const titleHeight = titleLines.length ? titleLines.length * 44 + 18 : 0;
      const graphBlockHeight = progressShareOptions.graph ? 248 : 0;
      const sectionGap = (titleHeight && graphBlockHeight ? 18 : 0) +
        ((titleHeight || graphBlockHeight) && metricRows ? 20 : 0);
      const metricsHeight = metricRows ? metricRows * 126 + (metricRows - 1) * 14 : 0;
      const breakdownHeight = workBreakdown.length ? 50 + workBreakdown.length * 35 : 0;
      const breakdownGap = workBreakdown.length && (titleHeight || graphBlockHeight || metricsHeight) ? 20 : 0;
      const contentHeight = titleHeight + graphBlockHeight + sectionGap + metricsHeight + breakdownGap + breakdownHeight;
      const contentAreaTop = 108;
      const outputHeight = Math.max(520, Math.ceil(contentAreaTop + contentHeight + 82));
      canvas.height = outputHeight;
      context = canvas.getContext("2d");
      if (!context) throw new Error("Canvasを初期化できませんでした。");

      context.fillStyle = "#f7fafb";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#c9dce3";
      context.lineWidth = 2;
      context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

      const logo = document.getElementById("progressShareLogoSource");
      if (logo?.complete && logo.naturalWidth > 0) {
        context.drawImage(logo, padding + 11, 45, 38, 38);
      }
      context.fillStyle = "#1a5d78";
      context.font = '800 22px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.textBaseline = "middle";
      context.fillText("もじごと", padding + 78, 64);
      context.fillStyle = "#456d7b";
      context.font = '500 19px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.textAlign = "right";
      const headerDateParts = String(period.date || "").split("-");
      const headerDate = progressShareMode === "annual" ? String(period.date || "").slice(0, 4) + " 年間"
        : progressShareMode === "monthly" ? Number(headerDateParts[0]) + "/" + Number(headerDateParts[1]) + " 月間"
        : progressDateLabel(period.date);
      context.fillText(headerDate, canvas.width - padding, 64);
      context.textAlign = "left";
      context.textBaseline = "alphabetic";

      let contentY = contentAreaTop;

      if (titleLines.length) {
        context.fillStyle = "#123f52";
        context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
        titleLines.forEach((line, index) => {
          context.fillText(line, padding, contentY + 31 + index * 44);
        });
        contentY += titleHeight;
        if (progressShareOptions.graph) contentY += 18;
        else if (metricRows) contentY += 20;
      }

      if (progressShareOptions.graph) {
        context.fillStyle = "#456d7b";
        context.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(progressShareMode === "annual" ? String(period.date || "").slice(0, 4) + "年 1～12月の執筆" : progressShareMode === "monthly" ? "直近6か月の執筆" : "直近7日の執筆", padding, contentY + 17);
        const graphY = contentY + 34;
        const graphWidth = canvas.width - padding * 2;
        const graphHeight = 214;
        progressCanvasRoundRect(context, padding, graphY, graphWidth, graphHeight, 20, "#eef5f7");
        const maxValue = Math.max(1, ...graphRows.map((row) => Math.abs(Number(row?.characters || 0))));
        const cellWidth = graphWidth / Math.max(1, graphRows.length);
        graphRows.forEach((row, index) => {
          const value = Number(row?.characters || 0);
          const barMaxHeight = 108;
          const barHeight = value === 0 ? 3 : Math.max(10, (Math.abs(value) / maxValue) * barMaxHeight);
          const centerX = padding + cellWidth * index + cellWidth / 2;
          context.textAlign = "center";
          context.fillStyle = "#456d7b";
          context.font = '500 ' + (progressShareMode === "annual" ? 11 : 13) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
          context.fillText(formatProgressNumber(value, true), centerX, graphY + 27);
          context.fillStyle = value < 0 ? "#8b4c58" : "#005990";
          const barWidth = progressShareMode === "annual" ? 20 : 28;
          context.fillRect(centerX - barWidth / 2, graphY + 164 - barHeight, barWidth, barHeight);
          context.fillStyle = "#456d7b";
          const graphLabel = progressShareMode === "monthly" || progressShareMode === "annual"
            ? Number(String(row?.month || "").slice(5)) + "月"
            : String(row?.date || "").slice(5).replace("-", "/") || "-";
          context.fillText(graphLabel, centerX, graphY + 194);
        });
        context.textAlign = "left";
        contentY += graphBlockHeight;
        if (metricRows) contentY += 20;
      }
      const gap = 18;
      const metricWidth = (canvas.width - padding * 2 - gap * (columns - 1)) / columns;
      const metricHeight = 126;
      metrics.forEach((metric, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + column * (metricWidth + gap);
        const y = contentY + row * (metricHeight + 14);
        progressCanvasRoundRect(context, x, y, metricWidth, metricHeight, 18, "#ffffff", "#c9dce3");
        context.fillStyle = "#456d7b";
        context.font = '700 16px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(metric[0], x + 20, y + 29);
        context.fillStyle = "#005990";
        context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(metric[1], x + 20, y + 70);
        context.fillStyle = "#456d7b";
        context.font = '500 15px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(metric[2], x + 20, y + 99);
      });
      if (metricRows) contentY += metricsHeight;

      if (workBreakdown.length) {
        contentY += breakdownGap;
        progressCanvasRoundRect(context, padding, contentY, canvas.width - padding * 2, breakdownHeight, 18, "#ffffff", "#c9dce3");
        context.fillStyle = "#456d7b";
        context.font = '700 16px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(progressShareMode === "annual" ? "作品ごとの年間差分" : "作品ごとの今月差分", padding + 20, contentY + 29);
        workBreakdown.forEach((row, index) => {
          const rowY = contentY + 61 + index * 35;
          context.fillStyle = "#123f52";
          context.font = '500 16px system-ui, -apple-system, "Segoe UI", sans-serif';
          context.textAlign = "left";
          context.fillText(String(row?.title || "作品"), padding + 20, rowY);
          context.fillStyle = "#005990";
          context.font = '700 16px system-ui, -apple-system, "Segoe UI", sans-serif';
          context.textAlign = "right";
          context.fillText(formatProgressNumber(row?.characters, true) + "文字", canvas.width - padding - 20, rowY);
        });
        context.textAlign = "left";
      }

      context.fillStyle = "#1a5d78";
      context.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.textAlign = "right";
      context.fillText("#もじごと", canvas.width - padding, canvas.height - 30);
      context.textAlign = "left";
      return canvas;
    }

    async function copyProgressShareImage() {
      const button = document.getElementById("progressShareCopyButton");
      const status = document.getElementById("progressShareCopyStatus");
      if (button) button.disabled = true;
      if (status) status.textContent = "画像を作成しています…";

      try {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
          throw new Error("このVS Codeでは画像のコピーに対応していません。");
        }
        const canvas = createProgressShareCanvas();
        const pngPromise = new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("PNG画像を作成できませんでした。"));
          }, "image/png");
        });
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": pngPromise }),
        ]);
        if (status) status.textContent = "画像をクリップボードへコピーしました。";
        showStatsToast("SNS進捗画像をコピーしました。");
      } catch (error) {
        console.error("[mojigoto] progress image copy error:", error);
        if (status) {
          status.textContent = String(error?.message || "画像をコピーできませんでした。");
        }
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function copyProgressShareText() {
      const button = document.getElementById("progressShareTextButton");
      const status = document.getElementById("progressShareCopyStatus");
      if (button) button.disabled = true;
      try {
        const text = createProgressShareText();
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          vscode.postMessage({ type: "copyText", text });
        }
        if (status) status.textContent = "SNS投稿文をクリップボードへコピーしました。";
        showStatsToast("SNS投稿文をコピーしました。");
      } catch (error) {
        console.error("[mojigoto] progress text copy error:", error);
        vscode.postMessage({ type: "copyText", text: createProgressShareText() });
        if (status) status.textContent = "SNS投稿文をクリップボードへ送りました。";
      } finally {
        if (button) button.disabled = false;
      }
    }

    function saveProgressShareImage() {
      const button = document.getElementById("progressShareSaveButton");
      const status = document.getElementById("progressShareCopyStatus");
      try {
        if (button) button.disabled = true;
        if (status) status.textContent = "保存用の画像を作成しています…";
        const canvas = createProgressShareCanvas();
        vscode.postMessage({
          type: "saveProgressShareImage",
          dataUrl: canvas.toDataURL("image/png"),
          date: String(progressSummary?.period?.date || ""),
          titleVisible: progressShareOptions.title !== false,
        });
      } catch (error) {
        console.error("[mojigoto] progress image save error:", error);
        if (button) button.disabled = false;
        if (status) status.textContent = String(error?.message || "保存用の画像を作成できませんでした。");
      }
    }

    function renderHeadingTocPreview(item) {
      const level = Math.min(3, Math.max(1, Number(item?.headingLevel || 1)));
      const fallback = String(item?.preview || "").replace(/^#{1,3}(?!#)\s*/, "").trim();
      const text = String(item?.headingText || fallback || "（見出し名なし）");
      return (
        '<span class="highlightHeadingLevel">H' + level + '</span>' +
        '<span class="highlightHeadingText">' + escapeHtml(text) + '</span>'
      );
    }

    function bindDashboardCommonTodoActions() {
      document.querySelectorAll("[data-dashboard-common-todo]").forEach((el) => {
        el.addEventListener("click", () => {
          const itemId = el.getAttribute("data-item-id") || "";
          if (!itemId) return;

          vscode.postMessage({
            type: "toggleDashboardCommonTodo",
            itemId,
          });
        });
      });
    }

    function applyDashboardSectionVisibility() {
      const defaultVisibleCount = 2;

      ["normal", "list", "todo"].forEach((sectionKey) => {
        const listEl = document.querySelector(
          '[data-dashboard-section="' + sectionKey + '"]'
        );
        if (!listEl) return;

        const items = Array.from(listEl.querySelectorAll(".dashboardNoteItem"));
        const expanded = Boolean(expandedDashboardSections[sectionKey]);

        items.forEach((item, index) => {
          item.style.display =
            expanded || index < defaultVisibleCount ? "" : "none";
        });

        const button = document.querySelector(
          '[data-dashboard-more="' + sectionKey + '"]'
        );
        if (button) {
          button.textContent = expanded ? "折りたたむ" : "もっと見る";
        }
      });
    }

    function renderWritingMemoSecondaryState() {
      const doneButton = document.getElementById("writingMemoDoneTabButton");
      const archivedButton = document.getElementById("writingMemoArchivedTabButton");
      const donePanel = document.getElementById("writingMemoDonePanel");
      const archivedPanel = document.getElementById("writingMemoArchivedPanel");
      const body = document.getElementById("writingMemoSecondaryBody");
      const toggleButton = document.getElementById("writingMemoSecondaryToggle");
      const archiveDoneAction = document.getElementById("writingMemoArchiveDoneAction");
      const clearArchivedAction = document.getElementById("writingMemoClearArchivedAction");

      const isDone = activeWritingMemoSecondaryTab === "done";
      const isArchived = activeWritingMemoSecondaryTab === "archived";

      doneButton?.classList.toggle("is-active", isDone);
      archivedButton?.classList.toggle("is-active", isArchived);

      donePanel?.classList.toggle("is-active", isDone);
      archivedPanel?.classList.toggle("is-active", isArchived);

      if (body) {
        body.style.display = isWritingMemoSecondaryOpen ? "block" : "none";
      }

      if (toggleButton) {
        toggleButton.textContent = isWritingMemoSecondaryOpen ? "▲" : "▼";
      }

      if (archiveDoneAction) {
        archiveDoneAction.style.display =
          isWritingMemoSecondaryOpen && isDone ? "" : "none";
      }

      if (clearArchivedAction) {
        clearArchivedAction.style.display =
          isWritingMemoSecondaryOpen && isArchived ? "" : "none";
      }
    }

    function restoreOpenWritingMemo() {
      if (!openWritingMemoId) return;

      const item = document.querySelector(
        '[data-writing-memo-id="' + openWritingMemoId + '"]'
      );

      if (!item) return;

      item.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    function applyHideZeroGroups() {
      document.querySelectorAll(".highlight-group-row").forEach((row) => {
        const countCell = row.querySelector("td.num");
        const raw = (countCell?.textContent || "0").trim();

        if (hideZeroGroups && raw !== "-" && Number(raw) === 0) {
          row.style.display = "none";
        } else {
          row.style.display = "";
        }
      });
    }

    function updateSelectedGroupRow() {
      document.querySelectorAll(".highlight-group-row").forEach((row) => {
        const name = row.getAttribute("data-group");
        if (name === selectedHighlightGroup) {
          row.classList.add("is-selected");
        } else {
          row.classList.remove("is-selected");
        }
      });
    }

    function getHeadingTargetKey(item) {
      return String(Number(item?.startLine || 0));
    }

    function updateHeadingBatchCount() {
      const count = document.getElementById("headingBatchSelectedCount");
      const applyButton = document.getElementById("applyHeadingBatchButton");
      const indentButton = document.getElementById("applyIndentBatchButton");
      const selectedCount = selectedHeadingTargetKeys.size;
      if (count) count.textContent = "選択 " + selectedCount + "件";
      if (applyButton) applyButton.disabled = selectedCount === 0;
      if (indentButton) indentButton.disabled = selectedCount === 0;
    }

    function renderHeadingBatchToolbar(found) {
      if (found?.name !== "paragraphIndentMissing") return "";

      return (
        '<div class="headingBatchToolbar">' +
          '<div class="headingBatchToolbarText">見出し・字下げを付与する行を選択</div>' +
          '<label class="headingBatchLevelLabel">記号 ' +
            '<select id="headingBatchLevelSelect">' +
              '<option value="1"' + (headingBatchLevel === "1" ? ' selected' : '') + '># 大見出し</option>' +
              '<option value="2"' + (headingBatchLevel === "2" ? ' selected' : '') + '>## 中見出し</option>' +
              '<option value="3"' + (headingBatchLevel === "3" ? ' selected' : '') + '>### 小見出し</option>' +
            '</select>' +
          '</label>' +
          '<button type="button" id="selectAllHeadingTargetsButton">すべて選択</button>' +
          '<button type="button" id="clearHeadingTargetsButton">選択解除</button>' +
          '<button type="button" id="applyHeadingBatchButton" disabled>見出しを付与</button>' +
          '<button type="button" id="applyIndentBatchButton" disabled>全角スペースを付与</button>' +
          '<span id="headingBatchSelectedCount" class="headingBatchSelectedCount">選択 0件</span>' +
        '</div>' +
        '<div class="muted headingBatchHint">現在開いているファイルの表示中の検出結果だけを変更します。実行前に確認します。</div>'
      );
    }

    function bindHeadingBatchActions(found) {
      if (found?.name !== "paragraphIndentMissing") return;

      document.getElementById("headingBatchLevelSelect")?.addEventListener("change", (event) => {
        headingBatchLevel = String(event.target.value || "1");
        saveUiState();
      });

      document.querySelectorAll("[data-heading-target-index]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const index = Number(checkbox.getAttribute("data-heading-target-index") || -1);
          const item = found.items[index];
          if (!item) return;
          const key = getHeadingTargetKey(item);
          if (checkbox.checked) selectedHeadingTargetKeys.add(key);
          else selectedHeadingTargetKeys.delete(key);
          updateHeadingBatchCount();
        });
      });

      document.getElementById("selectAllHeadingTargetsButton")?.addEventListener("click", () => {
        selectedHeadingTargetKeys = new Set(found.items.map(getHeadingTargetKey));
        document.querySelectorAll("[data-heading-target-index]").forEach((checkbox) => {
          checkbox.checked = true;
        });
        updateHeadingBatchCount();
      });

      document.getElementById("clearHeadingTargetsButton")?.addEventListener("click", () => {
        selectedHeadingTargetKeys.clear();
        document.querySelectorAll("[data-heading-target-index]").forEach((checkbox) => {
          checkbox.checked = false;
        });
        updateHeadingBatchCount();
      });

      const applySelectedTargets = (type) => {
        const targets = found.items
          .filter((item) => selectedHeadingTargetKeys.has(getHeadingTargetKey(item)))
          .map((item) => ({
            startLine: Number(item.startLine || 0),
            preview: String(item.preview || ""),
          }));
        if (!targets.length) return;

        const filePath = document.getElementById("highlightDetailsWrap")
          ?.getAttribute("data-current-file-path") || "";

        vscode.postMessage({
          type,
          filePath,
          level: Number(headingBatchLevel || 1),
          targets,
        });
      };

      document.getElementById("applyHeadingBatchButton")?.addEventListener("click", () => {
        applySelectedTargets("applyHeadingBatch");
      });
      document.getElementById("applyIndentBatchButton")?.addEventListener("click", () => {
        applySelectedTargets("applyIndentBatch");
      });

      updateHeadingBatchCount();
    }

    function renderHighlightDetails(groupName) {
      selectedHighlightGroup = groupName || "";
      selectedHeadingTargetKeys.clear();

      const panel = document.getElementById("highlightDetailsPanel");
      const empty = document.getElementById("highlightDetailsEmpty");
      if (!panel || !empty) return;

      const found = highlightDetails.find((x) => x.name === groupName);

      if (!found) {
        panel.innerHTML = "";
        empty.hidden = false;
        empty.textContent =
          "グループをクリックすると検出結果を表示します。検出結果の行をクリックすると本文の該当箇所へジャンプします。";
        updateSelectedGroupRow();
        return;
      }

      empty.hidden = true;

      if (!found.items || found.items.length === 0) {
        panel.innerHTML =
          '<div class="muted" style="margin-top:8px;">' +
          escapeHtml(found.label) +
          " の検出結果はありません。" +
          "</div>";
        updateSelectedGroupRow();
        return;
      }

      const rows = found.items.map((item, index) => {
        const headingCheckbox = found.name === "paragraphIndentMissing"
          ? '<td class="headingBatchCheckCell"><input type="checkbox" data-heading-target-index="' + index + '" aria-label="' + escapeHtml(String(item.line || index + 1)) + '行目を選択"></td>'
          : "";
        const headingLevel = found.name === "heading"
          ? Math.min(3, Math.max(1, Number(item?.headingLevel || 1)))
          : 0;
        const rowClass = headingLevel
          ? " highlight-heading-row is-level-" + headingLevel
          : "";
        const preview = found.name === "heading"
          ? renderHeadingTocPreview(item)
          : renderHighlightedPreview(item);
        return (
          '<tr class="highlight-detail-row' + rowClass + '" ' +
            'data-group="' + escapeHtml(found.name) + '" ' +
            'data-index="' + index + '" ' +
            'style="cursor:pointer;">' +
            headingCheckbox +
            '<td class="num">' + escapeHtml(item.line) + "</td>" +
            "<td>" + preview + "</td>" +
          "</tr>"
        );
      }).join("");

      panel.innerHTML =
        '<div style="margin-top:10px; font-size:13px; font-weight:600;">' +
          escapeHtml(found.label) +
          " の検出結果" +
          (found.countable === false && found.name !== "heading" ? "" : "（" + escapeHtml(found.count) + "件）") +
        "</div>" +
        '<div class="muted" style="margin-top:4px;">行をクリックすると本文の該当箇所へジャンプします。</div>' +
        renderHeadingBatchToolbar(found) +
        '<table style="margin-top:8px;">' +
          "<thead>" +
            "<tr>" + (found.name === "paragraphIndentMissing" ? '<th class="headingBatchCheckCell">選択</th>' : '') + "<th>行</th><th>内容</th></tr>" +
          "</thead>" +
          "<tbody>" +
            rows +
          "</tbody>" +
        "</table>";

      panel.querySelectorAll(".highlight-detail-row").forEach((row) => {
        row.addEventListener("click", (event) => {
          if (event.target?.closest("input, button, select, label")) return;
          const index = Number(row.getAttribute("data-index") || -1);
          if (index < 0) return;

          const target = found.items[index];
          if (!target) return;

          saveUiState();

          vscode.postMessage({
            type: "highlightJump",
            groupName: found.name,
            startLine: target.startLine,
            startCharacter: target.startCharacter,
            endLine: target.endLine,
            endCharacter: target.endCharacter
          });
        });
      });

      bindHeadingBatchActions(found);

      updateSelectedGroupRow();
    }

    function renderRetentionSectionState() {
      const toggleButton = document.getElementById("retentionToggleButton");
      const toggleIcon = document.getElementById("retentionToggleIcon");
      const body = document.getElementById("retentionSectionBody");

      if (!toggleButton || !toggleIcon || !body) return;

      toggleButton.setAttribute("aria-expanded", isRetentionOpen ? "true" : "false");
      toggleIcon.textContent = isRetentionOpen ? "▲" : "▼";
      body.classList.toggle("is-open", isRetentionOpen);
    }

    let saveSettingsPending = false;
    let markdownPending = false;
    function renderWebMarkdown(status = {}) {
      const input = document.getElementById("webMarkdownEnabled");
      const button = document.getElementById("webMarkdownRegenerate");
      if (!input || (status.workKey && status.workKey !== input.dataset.workKey)) return;
      if (typeof status.enabled === "boolean") input.checked = status.enabled;
      input.disabled = markdownPending || status.available === false;
      button.disabled = markdownPending || !input.checked;
      button.hidden = !input.checked;
      button.textContent = markdownPending ? "更新中…" : "今すぐ更新";
      if (status.error) {
        document.getElementById("webMarkdownDetails").open = true;
        const notice = document.getElementById("webMarkdownNotice");
        notice.hidden = false;
        notice.setAttribute("role", "alert");
        document.getElementById("webMarkdownStatus").textContent = status.error;
      }
    }
    let saveSettingsError = false;
    function renderWebviewSaveSettings(settings) {
      document.querySelectorAll("[data-save-setting]").forEach((input) => {
        if (Object.prototype.hasOwnProperty.call(settings || {}, input.dataset.saveSetting)) input.checked = settings[input.dataset.saveSetting];
        input.disabled = saveSettingsPending;
      });
    }

    function bindRetentionActions() {
      const markdownDetails = document.getElementById("webMarkdownDetails");
      if (markdownDetails) {
        markdownDetails.open = markdownDetails.open || isWebMarkdownOpen;
        markdownDetails.addEventListener("toggle", () => { isWebMarkdownOpen = markdownDetails.open; saveUiState(); });
      }
      function markdownAction(action, enabled) {
        const input = document.getElementById("webMarkdownEnabled");
        markdownPending = true;
        renderWebMarkdown();
        vscode.postMessage({ type: "webMarkdownAction", action, enabled, workKey: input.dataset.workKey, renderId: document.body.dataset.statsRenderId });
      }
      document.getElementById("webMarkdownEnabled")?.addEventListener("change", (event) => markdownAction("enabled", event.target.checked));
      document.getElementById("webMarkdownRegenerate")?.addEventListener("click", () => markdownAction("regenerate"));
      document.getElementById("webMarkdownNoticeClose")?.addEventListener("click", () => { document.getElementById("webMarkdownNotice").hidden = true; });
      document.querySelectorAll("[data-save-setting]").forEach((input) => {
        input.addEventListener("change", () => {
          saveSettingsPending = true;
          renderWebviewSaveSettings({});
          vscode.postMessage({ type: "updateWebviewSaveSetting", key: input.dataset.saveSetting, enabled: input.checked });
        });
      });
      document.getElementById("saveSettingsNoticeClose")?.addEventListener("click", () => {
        saveSettingsError = false;
        document.getElementById("saveSettingsNotice").hidden = true;
      });
      document.getElementById("retentionToggleButton")?.addEventListener("click", () => {
        isRetentionOpen = !isRetentionOpen;
        saveUiState();
        renderRetentionSectionState();
      });
    }

    function bindStatsActions() {
      document.getElementById("btnExport")?.addEventListener("click", () => {
        vscode.postMessage({ type: "exportCsv" });
      });

      document.getElementById("btnRefresh")?.addEventListener("click", () => {
        vscode.postMessage({ type: "refresh" });
      });

      document.getElementById("btnCorrectStats")?.addEventListener("click", () => {
        vscode.postMessage({ type: "correctStats" });
      });

      document.getElementById("btnOpenExportLauncher")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openExportLauncher" });
      });

      document.getElementById("btnOpenMojigotoSettings")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openMojigotoSettings" });
      });
      document.getElementById("btnOpenBackupSettings")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openBackupSettings" });
      });

      document.getElementById("btnRunDoctor")?.addEventListener("click", () => {
        vscode.postMessage({ type: "runDoctor" });
      });

      const refreshWritingMemosBtn = document.getElementById("btnRefreshWritingMemos");
      const toggleWritingMemoDecorationsBtn = document.getElementById("btnToggleWritingMemoDecorations");

      refreshWritingMemosBtn?.addEventListener("click", () => {
        refreshWritingMemosBtn.disabled = true;
        vscode.postMessage({ type: "refreshWritingMemos" });
      });

      toggleWritingMemoDecorationsBtn?.addEventListener("click", () => {
        toggleWritingMemoDecorationsBtn.disabled = true;
        vscode.postMessage({ type: "toggleWritingMemoDecorations" });
      });

      const btn = document.getElementById("btnSendMojigotoEvents");
      const st = document.getElementById("sendMojigotoEventsStatus");
      const saveEventsRemindModeBtn = document.getElementById("saveEventsRemindModeBtn");
      const eventsRemindModeSelect = document.getElementById("eventsRemindModeSelect");
      const eventsRemindModeStatus = document.getElementById("eventsRemindModeStatus");

      document.getElementById("btnOpenConceptMemoFromDashboard")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "openConceptMemoFromDashboard",
          memoId: "",
        });
      });

      saveEventsRemindModeBtn?.addEventListener("click", () => {
        const mode = eventsRemindModeSelect?.value || "off";

        saveEventsRemindModeBtn.disabled = true;
        if (eventsRemindModeStatus) {
          eventsRemindModeStatus.textContent = "保存中…";
        }

        vscode.postMessage({
          type: "setEventsRemindMode",
          mode,
        });
      });

      btn?.addEventListener("click", () => {
        btn.disabled = true;
        if (st) st.textContent = "送信中…";
        vscode.postMessage({ type: "mojigoto.sendMojigotoEvents" });
      });

      window.addEventListener("message", (ev) => {
        const msg = ev.data || {};
        if (msg.type === "webMarkdownState" || msg.type === "webMarkdownResult") {
          if (msg.status?.workKey && msg.status.workKey !== document.getElementById("webMarkdownEnabled")?.dataset.workKey) return;
          if (msg.type === "webMarkdownResult") markdownPending = false;
          renderWebMarkdown(msg.status);
          if (msg.type === "webMarkdownResult" && !msg.status?.error) {
            const notice = document.getElementById("webMarkdownNotice");
            notice.hidden = false;
            notice.setAttribute("role", "status");
            document.getElementById("webMarkdownStatus").textContent = msg.status?.enabled ? "Web読込用Markdownを更新しました。" : "自動更新をOFFにしました。生成済みファイルは残しています。";
          }
          return;
        }
        if (msg.type === "webviewSaveSettingsChanged" || msg.type === "webviewSaveSettingResult") {
          if (msg.type === "webviewSaveSettingResult") saveSettingsPending = false;
          renderWebviewSaveSettings(msg.settings);
          if (msg.type === "webviewSaveSettingResult" && (msg.error || !saveSettingsError)) {
            saveSettingsError = Boolean(msg.error);
            const notice = document.getElementById("saveSettingsNotice");
            notice.hidden = false;
            notice.dataset.kind = msg.error ? "error" : "info";
            notice.setAttribute("role", msg.error ? "alert" : "status");
            document.getElementById("saveSettingsStatus").textContent = msg.error || (msg.cancelled ? "設定の変更をキャンセルしました。" : "保存・自動反映設定を更新しました。");
          }
          return;
        }

        if (msg.type === "saveProgressShareImage.result") {
          const saveButton = document.getElementById("progressShareSaveButton");
          const saveStatus = document.getElementById("progressShareCopyStatus");
          if (saveButton) saveButton.disabled = false;
          if (saveStatus) {
            saveStatus.textContent = msg.ok
              ? ("PNG画像を保存しました（" + String(msg.fileName || "進捗画像") + "）")
              : msg.cancelled
                ? "画像の保存をキャンセルしました。"
                : String(msg.error || "画像を保存できませんでした。");
          }
          if (msg.ok) showStatsToast("SNS進捗画像を保存しました。");
          return;
        }

        if (msg.type === "mojigoto.sendMojigotoEvents.result") {
          if (btn) btn.disabled = false;
          if (st) {
            const sent = (msg.sent !== undefined && msg.sent !== null) ? msg.sent : 0;
            st.textContent = msg.ok
              ? ("送信完了（" + sent + "件）")
              : ("送信失敗（" + (msg.error || "unknown") + "）");
          }
          return;
        }

        if (msg.type === "refreshWritingMemos.result") {
          if (refreshWritingMemosBtn) {
            refreshWritingMemosBtn.disabled = false;
            refreshWritingMemosBtn.classList.remove("is-busy");
            refreshWritingMemosBtn.textContent = "執筆メモを更新";
          }

          if (!msg.ok) {
            console.error("[mojigoto] refreshWritingMemos.result error:", msg.error);
          }
          return;
        }

        if (msg.type === "toggleWritingMemoDecorations.result") {
          if (toggleWritingMemoDecorationsBtn) {
            toggleWritingMemoDecorationsBtn.disabled = false;
            toggleWritingMemoDecorationsBtn.classList.remove("is-busy");
            toggleWritingMemoDecorationsBtn.textContent = msg.ok
              ? (msg.enabled ? "下線をOFF" : "下線をON")
              : toggleWritingMemoDecorationsBtn.textContent;
          }

          if (!msg.ok) {
            console.error("[mojigoto] toggleWritingMemoDecorations.result error:", msg.error);
          }
          return;
        }

        if (msg.type === "openWritingMemoTab") {
          activeTab = "writingMemo";
          openWritingMemoId = String(msg.memoId || "");
          saveUiState();
          renderTabs();
          renderWritingMemoSecondaryState();

          setTimeout(() => {
            restoreOpenWritingMemo();
          }, 0);
          return;
        }

        if (msg.type === "updateWritingMemo.result") {
          if (msg.ok) {
            editingWritingMemoId = "";
            saveUiState();
            showStatsToast("執筆メモを保存しました。");
          } else {
            console.error("[mojigoto] updateWritingMemo.result error:", msg.error);
          }
          return;
        }
      });

      document.querySelectorAll("[data-dashboard-note]").forEach((el) => {
        el.addEventListener("click", () => {
          try {
            const raw = el.getAttribute("data-dashboard-note") || "{}";
            const note = JSON.parse(raw);
            openDashboardNoteModal(note);
          } catch (e) {
            console.error("[mojigoto] dashboard note parse error:", e);
          }
        });
      });

      document.getElementById("dashboardNoteModalClose")?.addEventListener("click", () => {
        closeDashboardNoteModal();
      });

      document.getElementById("dashboardNoteModalOverlay")?.addEventListener("click", (event) => {
        if (event.target?.id === "dashboardNoteModalOverlay") {
          closeDashboardNoteModal();
        }
      });

      document.getElementById("toggleDashboardTextMemos")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "text",
          enabled: !!event.target.checked,
        });
      });

      document.getElementById("toggleDashboardProgressGraph")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "progressGraph",
          enabled: !!event.target.checked,
        });
      });

      document.getElementById("dashboardProgressGraphMode")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "progressGraphMode",
          value: event.target.value === "total" ? "total" : "daily",
        });
      });

      document.getElementById("toggleDashboardCommonTodo")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "commonTodo",
          enabled: !!event.target.checked,
        });
      });

      document.getElementById("toggleDashboardListMemos")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "list",
          enabled: !!event.target.checked,
        });
      });

      document.getElementById("toggleDashboardTodoMemos")?.addEventListener("change", (event) => {
        vscode.postMessage({
          type: "setDashboardMemoVisibility",
          key: "todo",
          enabled: !!event.target.checked,
        });
      });

      document.querySelectorAll("[data-writing-memo]").forEach((el) => {
        el.addEventListener("click", () => {
          try {
            const raw = el.getAttribute("data-writing-memo") || "{}";
            const item = JSON.parse(raw);

            vscode.postMessage({
              type: "writingMemoJump",
              memoId: item.id,
              filePath: item.filePath,
              absoluteFilePath: item.absoluteFilePath,
              writingMemoFilePath: item.writingMemoFilePath,
              targetLocation: item.targetLocation || "",
              excerpt: item.excerpt || "",
              startLine: item.startLine,
              startCharacter: item.startCharacter,
              endLine: item.endLine,
              endCharacter: item.endCharacter,
              returnWorkId: item.returnWorkId || "",
              returnWorkTitle: item.returnWorkTitle || "",
            });
          } catch (error) {
            console.error("[mojigoto] writing memo parse error:", error);
          }
        });
      });

      document.querySelectorAll("[data-writing-memo-status-id]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const memoId = el.getAttribute("data-writing-memo-status-id") || "";
          const writingMemoFilePath =
            el.getAttribute("data-writing-memo-file") || "";

          if (!memoId) return;

          openWritingMemoStatusMenu(memoId, writingMemoFilePath, el);
        });
      });

      document.querySelectorAll("[data-writing-memo-relink]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const memoId = el.getAttribute("data-writing-memo-relink") || "";
          const writingMemoFilePath =
            el.getAttribute("data-writing-memo-file") || "";
          if (!memoId || !writingMemoFilePath) return;

          const itemEl = el.closest("[data-writing-memo]");
          let item = {};
          try {
            item = JSON.parse(
              itemEl?.getAttribute("data-writing-memo") || "{}",
            );
          } catch (error) {
            console.error("[mojigoto] writing memo relink parse error:", error);
          }

          vscode.postMessage({
            type: "relinkWritingMemo",
            memoId,
            writingMemoFilePath,
            absoluteFilePath: item.absoluteFilePath || "",
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-next-status]").forEach((el) => {
        el.addEventListener("click", () => {
          const nextStatus = el.getAttribute("data-writing-memo-next-status") || "";
          if (!openWritingMemoStatus?.memoId || !nextStatus) return;

          vscode.postMessage({
            type: "setWritingMemoStatus",
            memoId: openWritingMemoStatus.memoId,
            writingMemoFilePath: openWritingMemoStatus.writingMemoFilePath,
            status: nextStatus,
          });

          closeWritingMemoStatusMenu();
        });
      });

      document.getElementById("writingMemoStatusMenuOverlay")?.addEventListener("click", (event) => {
        if (event.target?.id === "writingMemoStatusMenuOverlay") {
          closeWritingMemoStatusMenu();
        }
      });

      document.querySelectorAll("[data-writing-memo-secondary-tab]").forEach((el) => {
        el.addEventListener("click", () => {
          const tab = el.getAttribute("data-writing-memo-secondary-tab") || "done";
          const nextTab = tab === "archived" ? "archived" : "done";

          activeWritingMemoSecondaryTab = nextTab;

          if (!isWritingMemoSecondaryOpen) {
            isWritingMemoSecondaryOpen = true;
          }

          saveUiState();
          renderWritingMemoSecondaryState();
        });
      });

      document.getElementById("writingMemoArchiveDoneButton")?.addEventListener("click", () => {
        vscode.postMessage({
          type: "archiveDoneWritingMemos",
        });
      });

      document.querySelectorAll("[data-writing-memo-clear-archived]").forEach((el) => {
        el.addEventListener("click", () => {
          vscode.postMessage({
            type: "clearArchivedWritingMemos",
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-restore]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const memoId = el.getAttribute("data-writing-memo-restore") || "";
          if (!memoId) return;

          vscode.postMessage({
            type: "restoreWritingMemo",
            memoId,
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-delete]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const memoId = el.getAttribute("data-writing-memo-delete") || "";
          if (!memoId) return;

          vscode.postMessage({
            type: "deleteWritingMemo",
            memoId,
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-edit]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();

          const memoId =
            el.getAttribute("data-writing-memo-edit") || "";
          if (!memoId) return;

          vscode.postMessage({
            type: editingWritingMemoId === memoId
              ? "cancelEditingWritingMemo"
              : "startEditingWritingMemo",
            memoId,
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-cancel]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();

          vscode.postMessage({
            type: "cancelEditingWritingMemo",
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-save]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();

          const memoId = el.getAttribute("data-writing-memo-save") || "";
          const writingMemoFilePath =
            el.getAttribute("data-writing-memo-file") || "";

          submitWritingMemoSave(memoId, writingMemoFilePath);
        });
      });

      document.querySelectorAll("[data-writing-memo-copy-to-concept]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();

          const memoId =
            el.getAttribute("data-writing-memo-copy-to-concept") || "";
          if (!memoId) return;

          const itemEl = document.querySelector(
            '[data-writing-memo-id="' + memoId + '"]'
          );
          if (!itemEl) return;

          let item = {};
          try {
            const raw = itemEl.getAttribute("data-writing-memo") || "{}";
            item = JSON.parse(raw);
          } catch (error) {
            console.error("[mojigoto] writing memo copy parse error:", error);
            return;
          }

          const savedOnly = el.getAttribute("data-writing-memo-copy-saved") === "true";
          const textarea = savedOnly ? null : document.querySelector(
            '[data-writing-memo-edit-body="' + memoId + '"]'
          );
          const body = textarea?.value ?? item.body ?? "";

          vscode.postMessage({
            type: "copyWritingMemoToConceptMemo",
            ...(savedOnly ? { savedOnly: true } : {}),
            memoId,
            writingMemoFilePath: item.writingMemoFilePath || "",
            body,
            excerpt: item.excerpt || "",
            filePath: item.filePath || "",
            returnWorkId: item.returnWorkId || "",
            returnWorkTitle: item.returnWorkTitle || "",
          });
        });
      });

      document.querySelectorAll("[data-writing-memo-edit-body]").forEach((el) => {
        el.addEventListener("keydown", (event) => {
          const isSave = (event.ctrlKey || event.metaKey) && !event.shiftKey;
          const key = String(event.key || "").toLowerCase();

          if (!isSave || key !== "s") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          const memoId =
            el.getAttribute("data-writing-memo-edit-body") || "";
          if (!memoId) return;

          const saveButton = document.querySelector(
            '[data-writing-memo-save="' + memoId + '"]'
          );
          const writingMemoFilePath =
            saveButton?.getAttribute("data-writing-memo-file") || "";

          submitWritingMemoSave(memoId, writingMemoFilePath);
        });
      });

      document.getElementById("writingMemoSecondaryToggle")?.addEventListener("click", () => {
        isWritingMemoSecondaryOpen = !isWritingMemoSecondaryOpen;
        saveUiState();
        renderWritingMemoSecondaryState();
      });

      document.getElementById("btnShowWritingMemoWorkIndex")?.addEventListener("click", () => {
        writingMemoViewMode = "workIndex";
        selectedWritingMemoWorkId = "";
        saveUiState();
        vscode.postMessage({
          type: "showWritingMemoWorkIndex",
        });
      });

      document.getElementById("btnShowWritingMemoCurrentWork")?.addEventListener("click", () => {
        const button = document.getElementById("btnShowWritingMemoCurrentWork");
        const workId = button?.getAttribute("data-work-id") || "";
        const workTitle = button?.getAttribute("data-work-title") || "";

        if (!workId) {
          writingMemoViewMode = "workIndex";
          selectedWritingMemoWorkId = "";
          selectedWritingMemoWorkTitle = "";
          saveUiState();

          vscode.postMessage({
            type: "showWritingMemoWorkIndex",
          });
          return;
        }

        writingMemoViewMode = "work";
        selectedWritingMemoWorkId = workId;
        selectedWritingMemoWorkTitle = workTitle;
        saveUiState();

        vscode.postMessage({
          type: "openWritingMemoWork",
          workId,
        });
      });

      document.querySelectorAll("[data-writing-memo-work-open]").forEach((el) => {
        el.addEventListener("click", () => {
          const workId = el.getAttribute("data-writing-memo-work-open") || "";
          const titleEl = el.querySelector(".writingMemoExcerpt");
          const workTitle = titleEl?.textContent?.trim() || "";

          if (!workId) return;

          writingMemoViewMode = "work";
          selectedWritingMemoWorkId = workId;
          selectedWritingMemoWorkTitle = workTitle;
          saveUiState();

          vscode.postMessage({
            type: "openWritingMemoWork",
            workId,
            workTitle,
          });
        });
      });

      document.getElementById("btnWritingMemoBackToWorks")?.addEventListener("click", () => {
        writingMemoViewMode = "workIndex";
        selectedWritingMemoWorkId = "";
        saveUiState();

        vscode.postMessage({
          type: "showWritingMemoWorkIndex",
        });
      });

      document.getElementById("btnShowCurrentFileWritingMemos")?.addEventListener("click", () => {
        const button = document.getElementById("btnShowCurrentFileWritingMemos");
        const returnWorkId = button?.getAttribute("data-return-work-id") || "";
        const returnWorkTitle = button?.getAttribute("data-return-work-title") || "";

        writingMemoViewMode = "file";
        saveUiState();

        vscode.postMessage({
          type: "showCurrentFileWritingMemos",
          returnWorkId,
          returnWorkTitle,
        });
      });
    }

    function bindHighlightActions() {
      document.getElementById("btnToggleHighlights")?.addEventListener("click", () => {
        vscode.postMessage({ type: "toggleHighlights" });
      });

      document.getElementById("btnToggleHighlightDecorations")?.addEventListener("click", () => {
        vscode.postMessage({ type: "toggleHighlightDecorations" });
      });

      document.getElementById("btnRefreshHighlights")?.addEventListener("click", () => {
        vscode.postMessage({ type: "refreshHighlights" });
      });

      document.getElementById("btnOpenHighlightSettings")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openHighlightSettings" });
      });

      document.querySelectorAll(".highlight-toggle").forEach((el) => {
        el.addEventListener("change", () => {
          const name = el.getAttribute("data-group");
          const enabled = el.checked;

          vscode.postMessage({
            type: "toggleHighlightGroup",
            name,
            enabled
          });
        });
      });

      document.querySelectorAll(".highlight-group-row").forEach((row) => {
        row.addEventListener("click", (event) => {
          if (event.target && event.target.classList.contains("highlight-toggle")) {
            return;
          }

          const groupName = row.getAttribute("data-group");
          selectedHighlightGroup = groupName || "";
          saveUiState();
          renderHighlightDetails(selectedHighlightGroup);
        });
      });

      const hideZeroToggle = document.getElementById("toggleHideZero");
      if (hideZeroToggle) {
        hideZeroToggle.checked = hideZeroGroups;

        hideZeroToggle.addEventListener("change", () => {
          hideZeroGroups = hideZeroToggle.checked;
          saveUiState();
          vscode.postMessage({ type: "setHideZeroGroups", enabled: hideZeroGroups, source: "change", renderId: document.body.dataset.statsRenderId });
          applyHideZeroGroups();
        });
      }
    }

    function bindTabActions() {
      document.getElementById("tabDashboardBtn")?.addEventListener("click", () => {
        activeTab = "dashboard";
        saveUiState();
        renderTabs();
      });

      document.getElementById("tabStatsBtn")?.addEventListener("click", () => {
        activeTab = "stats";
        saveUiState();
        renderTabs();
      });

      document.getElementById("tabHighlightBtn")?.addEventListener("click", () => {
        activeTab = "highlight";
        saveUiState();
        renderTabs();
        applyHideZeroGroups();
        renderHighlightDetails(selectedHighlightGroup);
      });

      document.getElementById("tabWritingMemoBtn")?.addEventListener("click", () => {
        activeTab = "writingMemo";
        saveUiState();
        renderTabs();
      });
    }

    function bindDashboardModalActions() {
      window.addEventListener("resize", layoutProgressSharePreview);

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeDashboardNoteModal();
          closeProgressShareModal();
        }
      });

      document.getElementById("btnOpenProgressSharePreview")?.addEventListener("click", () => {
        openProgressShareModal();
      });

      document.getElementById("progressShareModalClose")?.addEventListener("click", () => {
        closeProgressShareModal();
      });

      document.getElementById("progressShareCopyButton")?.addEventListener("click", () => {
        copyProgressShareImage();
      });

      document.getElementById("progressShareTextButton")?.addEventListener("click", () => {
        copyProgressShareText();
      });

      document.getElementById("progressShareSaveButton")?.addEventListener("click", () => {
        saveProgressShareImage();
      });

      const progressShareDateSelect = document.getElementById("progressShareDateSelect");
      if (progressShareDateSelect) {
        progressShareDateSelect.value = progressShareDate;
        progressShareDateSelect.addEventListener("change", () => {
          const nextDate = String(progressShareDateSelect.value || "");
          if (!progressSummaries.byDate?.[nextDate]) return;
          progressShareDate = nextDate;
          progressSummary = progressSummaries.byDate[nextDate];
          saveUiState();
          renderProgressSharePreview();
        });
      }

      const progressShareModeSelect = document.getElementById("progressShareMode");
      if (progressShareModeSelect) {
        progressShareModeSelect.value = progressShareMode;
        progressShareModeSelect.addEventListener("change", () => {
          progressShareMode = ["monthly", "annual"].includes(progressShareModeSelect.value) ? progressShareModeSelect.value : "daily";
          if (progressShareMode === "annual") selectAnnualProgressSummary();
          else progressSummary = progressSummaries.byDate?.[progressShareDate] || progressSummaries.today || {};
          updateProgressShareModeControls();
          saveUiState();
          renderProgressSharePreview();
        });
      }

      const progressShareYearSelect = document.getElementById("progressShareYearSelect");
      if (progressShareYearSelect) {
        progressShareYearSelect.value = String(progressShareYear);
        progressShareYearSelect.addEventListener("change", () => {
          progressShareYear = Math.min(2100, Math.max(2000, Number(progressShareYearSelect.value) || new Date().getFullYear()));
          progressShareYearSelect.value = String(progressShareYear);
          selectAnnualProgressSummary();
          saveUiState();
          renderProgressSharePreview();
        });
      }

      document.getElementById("progressShareModalOverlay")?.addEventListener("click", (event) => {
        if (event.target?.id === "progressShareModalOverlay") {
          closeProgressShareModal();
        }
      });

      document.querySelectorAll("[data-progress-share-option]").forEach((input) => {
        input.addEventListener("change", () => {
          const key = input.getAttribute("data-progress-share-option") || "";
          if (!key) return;
          progressShareOptions = {
            ...progressShareOptions,
            [key]: !!input.checked,
          };
          saveUiState();
          renderProgressSharePreview();
        });
      });

      document.getElementById("dashboardCopyConceptMemoBtn")?.addEventListener("click", async () => {
        const button = document.getElementById("dashboardCopyConceptMemoBtn");
        const text = button?.getAttribute("data-memo-body") || "";

        if (!text.trim()) return;

        try {
          await navigator.clipboard.writeText(text);
          showStatsToast("メモをコピーしました。貼り付けたい場所で Ctrl+V / Cmd+V を押してください。");
        } catch (error) {
          vscode.postMessage({
            type: "copyText",
            text,
          });
        }
      });

      document.getElementById("dashboardOpenConceptMemoBtn")?.addEventListener("click", () => {
        const memoId = document
          .getElementById("dashboardOpenConceptMemoBtn")
          ?.getAttribute("data-memo-id") || "";

        if (!memoId) return;

        vscode.postMessage({
          type: "openConceptMemoFromDashboard",
          memoId,
        });
      });

      document.getElementById("dashboardToggleVisibilityBtn")?.addEventListener("click", () => {
        const memoId = document
          .getElementById("dashboardToggleVisibilityBtn")
          ?.getAttribute("data-memo-id") || "";

        if (!memoId) return;

        vscode.postMessage({
          type: "toggleDashboardVisibility",
          memoId,
        });
      });
    }

    function initialize() {
      bindStatsActions();
      if (initiallyOpenSaveSettings) {
        saveUiState();
        requestAnimationFrame(() => document.getElementById("retentionSectionBody")?.scrollIntoView({ block: "start" }));
      }
      bindHighlightActions();
      bindTabActions();
      bindDashboardModalActions();
      bindDashboardTodoActions();
      bindDashboardCommonTodoActions();
      bindRetentionActions();
      bindDashboardSectionActions();

      renderTabs();
      renderRetentionSectionState();
      applyHideZeroGroups();
      applyDashboardSectionVisibility();
      renderHighlightDetails(selectedHighlightGroup);
      restoreDashboardNoteModal();
      renderWritingMemoSecondaryState();
      restoreOpenWritingMemo();
    }

    initialize();
    if (savedHideZeroGroups !== "true" && savedHideZeroGroups !== "false") {
      vscode.postMessage({ type: "setHideZeroGroups", enabled: hideZeroGroups, source: "initial", renderId: document.body.dataset.statsRenderId });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      vscode.postMessage({ type: "statsViewReady", renderId: document.body.dataset.statsRenderId || "", scriptMs: Date.now() - statsScriptStarted });
    }));
  `;
}
module.exports = { makeStatsScript };
