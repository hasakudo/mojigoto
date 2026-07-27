function makeStatsScript() {
  return `
    const vscode = acquireVsCodeApi();
    const uiState = vscode.getState() || {};
    let activeTab = uiState.activeTab || "dashboard";
    let hideZeroGroups = Boolean(uiState.hideZeroGroups);
    let selectedHighlightGroup = uiState.selectedHighlightGroup || "";
    let openDashboardNoteId = uiState.openDashboardNoteId || "";
    let isDashboardNoteModalOpen = Boolean(uiState.isDashboardNoteModalOpen);
    let isRetentionOpen = Boolean(uiState.isRetentionOpen);
    let expandedDashboardSections = uiState.expandedDashboardSections || {};
    let editingWritingMemoId = uiState.editingWritingMemoId || "";
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
        openDashboardNoteId,
        isDashboardNoteModalOpen,
        isRetentionOpen,
        expandedDashboardSections,
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

    function renderHighlightDetails(groupName) {
      selectedHighlightGroup = groupName || "";

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
        return (
          '<tr class="highlight-detail-row" ' +
            'data-group="' + escapeHtml(found.name) + '" ' +
            'data-index="' + index + '" ' +
            'style="cursor:pointer;">' +
            '<td class="num">' + escapeHtml(item.line) + "</td>" +
            "<td>" + renderHighlightedPreview(item) + "</td>" +
          "</tr>"
        );
      }).join("");

      panel.innerHTML =
        '<div style="margin-top:10px; font-size:13px; font-weight:600;">' +
          escapeHtml(found.label) +
          " の検出結果" +
          (found.countable === false ? "" : "（" + escapeHtml(found.count) + "件）") +
        "</div>" +
        '<div class="muted" style="margin-top:4px;">行をクリックすると本文の該当箇所へジャンプします。</div>' +
        '<table style="margin-top:8px;">' +
          "<thead>" +
            "<tr><th>行</th><th>内容</th></tr>" +
          "</thead>" +
          "<tbody>" +
            rows +
          "</tbody>" +
        "</table>";

      panel.querySelectorAll(".highlight-detail-row").forEach((row) => {
        row.addEventListener("click", () => {
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

    function bindRetentionActions() {
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

      document.getElementById("btnOpenExportLauncher")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openExportLauncher" });
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
            type: "startEditingWritingMemo",
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

          const textarea = document.querySelector(
            '[data-writing-memo-edit-body="' + memoId + '"]'
          );
          const body = textarea?.value ?? item.body ?? "";

          vscode.postMessage({
            type: "copyWritingMemoToConceptMemo",
            memoId,
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
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeDashboardNoteModal();
        }
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
      bindHighlightActions();
      bindTabActions();
      bindDashboardModalActions();
      bindDashboardTodoActions();
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
  `;
}
module.exports = { makeStatsScript };