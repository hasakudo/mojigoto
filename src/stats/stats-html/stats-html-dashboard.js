function renderDashboardNoteItem(note, esc) {
  const payload = JSON.stringify(note || {}).replace(/"/g, "&quot;");
  const isPinned = Boolean(note?.isPinned);
  const isText = String(note?.type || "text") === "text";

  return `
    <li
      class="dashboardNoteItem${isPinned ? " is-pinned" : ""}"
      data-dashboard-note='${payload}'
      title="クリックで詳細を表示"
    >
      ${
        isPinned
          ? '<span class="dashboardPinnedMark" title="ピン留め">📌</span>'
          : ""
      }
      <div class="dashboardNoteTitle">${esc(note?.title || "-")}</div>
      ${
        note?.preview
          ? `<div class="dashboardNotePreview${isText ? " is-single-line" : ""}">${esc(note.preview)}</div>`
          : ""
      }
    </li>
  `;
}

function renderDashboardNotesEmpty() {
  return `
    <div class="muted" style="margin-top:8px;">
      表示するメモはまだありません
    </div>
  `;
}

function renderDashboardNoteSection(title, sectionKey, notes, esc) {
  const safeNotes = Array.isArray(notes) ? notes : [];
  const visibleCount = 2;
  const hasMore = safeNotes.length > visibleCount;

  return `
    <div class="card">
      <div class="dashboardSectionTitle">${title}${safeNotes.length ? `（${safeNotes.length}）` : ""}</div>
      ${
        safeNotes.length
          ? `
            <ul class="dashboardSectionList" data-dashboard-section="${sectionKey}">
              ${safeNotes.map((note) => renderDashboardNoteItem(note, esc)).join("")}
            </ul>
            ${
              hasMore
                ? `<div class="dashboardSectionFooter">
                    <button
                      type="button"
                      class="button secondary dashboardMoreButton"
                      data-dashboard-more="${sectionKey}"
                    >もっと見る</button>
                  </div>`
                : ""
            }
          `
          : renderDashboardNotesEmpty()
      }
    </div>
  `;
}

function renderDashboardNotesPanel(state, esc) {
  const dashboardNotes = state.dashboardNotes || {};
  const visibility = state.dashboardVisibility || {};

  const topSections = [];
  const bottomSections = [];

  if (visibility.text !== false) {
    topSections.push(
      renderDashboardNoteSection(
        "通常メモ",
        "normal",
        dashboardNotes.normal,
        esc,
      ),
    );
  }

  if (visibility.list !== false) {
    topSections.push(
      renderDashboardNoteSection(
        "リストメモ",
        "list",
        dashboardNotes.list,
        esc,
      ),
    );
  }

  if (visibility.todo !== false) {
    bottomSections.push(
      renderDashboardNoteSection("TODOメモ", "todo", dashboardNotes.todo, esc),
    );
  }

  if (!topSections.length && !bottomSections.length) {
    return `
      <div class="card">
        <div class="muted">ダッシュボードのメモ表示がすべてOFFです。</div>
      </div>
    `;
  }

  return `
    ${topSections.length ? `<div class="row dashboardNotesTopRow">${topSections.join("")}</div>` : ""}
    ${bottomSections.length ? `<div class="row dashboardNotesBottomRow">${bottomSections.join("")}</div>` : ""}
  `;
}

function renderDashboardVisibilityControls(state) {
  const visibility = state?.dashboardVisibility || {};

  return `
    <div class="dashboardVisibilityChips">
      <label class="chip">
        <input type="checkbox" id="toggleDashboardTextMemos" ${visibility.text ? "checked" : ""}>
        通常メモ
      </label>
      <label class="chip">
        <input type="checkbox" id="toggleDashboardListMemos" ${visibility.list ? "checked" : ""}>
        リストメモ
      </label>
      <label class="chip">
        <input type="checkbox" id="toggleDashboardTodoMemos" ${visibility.todo ? "checked" : ""}>
        TODOメモ
      </label>
    </div>
  `;
}

function renderDashboardControlsBar(state) {
  return `
    <div class="dashboardControlsBar">
      <div class="dashboardControlsMain">
        <div class="dashboardControlsGroup">
          <span class="dashboardControlsLabel">表示するメモ</span>
          ${renderDashboardVisibilityControls(state)}
        </div>

        <div class="dashboardControlsActions">
          <button
            type="button"
            id="btnOpenConceptMemoFromDashboard"
            class="button secondary"
            title="現在の作品の構想メモを開く"
          >
            構想メモを開く
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardSummaryCard(state, esc) {
  return `
    <div class="card dashboardSummaryCard">
      <div class="dashboardSummarySplit">
        <section class="dashboardSummaryCol">
          <div class="dashboardWorkTitleBlock">
            <div class="dashboardWorkTitleLabel">作品名</div>
            <div class="dashboardWorkTitleValue">${esc(state.currentWorkTitle || "-")}</div>
          </div>

          <div class="dashboardSubsectionLabel">今日（JST）</div>
          <table>
            <tr><th>総差分</th><td class="num">${esc(state.today?.deltaTotal ?? 0)}</td></tr>
            <tr><th>総文字数（最後の保存）</th><td class="num">${esc(state.today?.totalSaved ?? 0)}</td></tr>
          </table>
        </section>

        <section class="dashboardSummaryCol">
          <table>
            <tr><th>目標文字数</th><td class="num">${esc(state.currentWorkGoal ?? 0)}</td></tr>
            <tr><th>現在の進捗</th><td class="num">${esc(state.currentWorkPctText ?? "-")}</td></tr>
            <tr><th>締切</th><td class="num">${esc(state.currentWorkDeadline || "-")}</td></tr>
            <tr><th>締切まで</th><td class="num">${esc(state.currentWorkDeadlineText || "-")}</td></tr>
          </table>

          <p class="statsHint">目標・締切の変更は作品ツリーの「作品設定」から行えます。</p>
        </section>
      </div>
    </div>
  `;
}

function renderRetentionCard(state, esc) {
  return `
    <div class="card">
      <table>
        <tr><th>日時ログ保存間隔</th><td class="num">${esc(state.retention?.eventIntervalLabel ?? "-")}</td></tr>
        <tr><th>日時ログ保持</th><td class="num">${esc(state.retention?.eventsRetentionLabel ?? "-")} / 最大${esc(state.retention?.eventsMaxCountLabel ?? "-")}</td></tr>
        <tr><th>進捗・更新ファイル履歴保持</th><td class="num">${esc(state.retention?.dailyRetentionLabel ?? "-")}</td></tr>
        <tr><th>文字数カウント方式</th><td class="num">${esc(state.countModeLabel ?? "標準")}</td></tr>
      </table>

      <div class="muted" style="margin-top:8px;">
        ※ 日時ログ保存間隔は、日時ログの記録頻度にのみ適用されます。保存自体は毎回行われます。<br>
        ※ 文字数カウント方式の変更はステータスバーからも行えます。
      </div>

      <div class="btnbar" style="margin-top:10px;">
        <button id="btnOpenMojigotoSettings">設定を開く</button>
        <button id="btnRunDoctor">自己診断</button>
      </div>
    </div>
  `;
}

function renderRetentionSection(state, esc) {
  return `
    <div class="collapsibleSection">
      <button
        id="retentionToggleButton"
        class="collapsibleToggle"
        type="button"
        aria-expanded="false"
      >
        <span class="collapsibleToggleLabel">保存設定</span>
        <span id="retentionToggleIcon" class="collapsibleToggleIcon">▼</span>
      </button>

      <div id="retentionSectionBody" class="collapsibleBody">
        ${renderRetentionCard(state, esc)}
      </div>
    </div>
  `;
}

function renderDashboardNoteModal() {
  return `
    <div id="dashboardNoteModalOverlay" class="dashboardModalOverlay">
      <div
        id="dashboardNoteModal"
        class="dashboardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboardNoteModalTitle"
      >
        <div class="dashboardModalHeader">
          <div class="dashboardModalTitleWrap">
            <h3 id="dashboardNoteModalTitle" class="dashboardModalTitle">メモ詳細</h3>
            <div id="dashboardNoteModalMeta" class="dashboardModalMeta"></div>
            <div id="dashboardNoteModalTags" class="dashboardModalTags"></div>
            <div id="dashboardNoteModalSource" class="dashboardModalSource"></div>
          </div>
          <button
            id="dashboardNoteModalClose"
            class="button secondary dashboardModalClose"
            type="button"
          >閉じる</button>
        </div>

        <div id="dashboardNoteModalBody" class="dashboardModalBody"></div>

        <div class="dashboardModalActions">
          <button
            id="dashboardCopyConceptMemoBtn"
            class="button secondary"
            type="button"
            style="display:none;"
          >メモをコピー</button>

          <button
            id="dashboardOpenConceptMemoBtn"
            class="button secondary"
            type="button"
          >構想メモを開く</button>

          <button
            id="dashboardToggleVisibilityBtn"
            class="button secondary"
            type="button"
          >ダッシュボード表示OFF</button>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardNotesDataScript(state) {
  const data = JSON.stringify(state?.dashboardNotes || {}).replace(
    /</g,
    "\\u003c",
  );
  return `
    <script type="application/json" id="dashboardNotesData">
      ${data}
    </script>
  `;
}

function renderDashboardScopeNotice(state, esc) {
  if (!state?.isViewLinkedStats) {
    return "";
  }

  return `
    <div class="dashboardScopeNotice">
      ダッシュボードの内容は、現在 View 連携中の作品
      ${state?.currentWorkTitle ? `「${esc(state.currentWorkTitle)}」` : ""}
      のデータです。
    </div>
  `;
}

function renderDashboardTab(state, esc) {
  return `
    <div id="dashboardTabPanel" class="tab-panel">
      ${renderDashboardScopeNotice(state, esc)}
      ${renderDashboardSummaryCard(state, esc)}
      ${renderDashboardControlsBar(state)}
      ${renderDashboardNotesPanel(state, esc)}
      ${renderRetentionSection(state, esc)}
    </div>
  `;
}

module.exports = {
  renderDashboardNoteModal,
  renderDashboardNotesDataScript,
  renderDashboardTab,
};