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

function renderDashboardCommonTodoSection(items, esc) {
  const safeItems = Array.isArray(items) ? items : [];
  const undoneCount = safeItems.filter((item) => !item?.done).length;

  return `
    <div class="card dashboardCommonTodoCard">
      <div class="dashboardSectionTitle">
        作品共通TODO（未完了 ${undoneCount} / 全${safeItems.length}）
      </div>
      ${
        safeItems.length
          ? `<div class="dashboardTodoList">
              ${safeItems
                .map((item) => {
                  const done = Boolean(item?.done);
                  return `
                    <button
                      type="button"
                      class="dashboardTodoItem dashboardCommonTodoItem"
                      data-dashboard-common-todo
                      data-item-id="${esc(item?.id || "")}"
                      title="クリックして完了状態を切り替え"
                    >
                      <span class="dashboardTodoCheck">${done ? "☑" : "☐"}</span>
                      <span class="dashboardTodoItemText${done ? " is-done" : ""}">${esc(item?.text || "（空項目）")}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>`
          : '<div class="muted">作品共通TODOはまだありません。</div>'
      }
    </div>
  `;
}

function renderDashboardNotesPanel(state, esc) {
  const dashboardNotes = state.dashboardNotes || {};
  const visibility = state.dashboardVisibility || {};

  const topSections = [];
  const bottomSections = [];

  if (visibility.commonTodo !== false) {
    bottomSections.push(
      renderDashboardCommonTodoSection(dashboardNotes.commonTodo, esc),
    );
  }

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
        <input type="checkbox" id="toggleDashboardCommonTodo" ${visibility.commonTodo !== false ? "checked" : ""}>
        作品共通TODO
      </label>
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

function renderDashboardProgressChart(state, esc) {
  const rows = Array.isArray(state?.last7) ? state.last7.slice(-7) : [];
  const mode = state?.dashboardVisibility?.progressGraphMode === "total"
    ? "total"
    : "daily";
  const isDaily = mode === "daily";
  const goal = Math.max(0, Number(state?.currentWorkGoal || 0));
  const values = rows.map((row) =>
    isDaily
      ? Number(row?.deltaTotal || 0)
      : Math.max(0, Number(row?.totalSaved || 0)),
  );
  const current = isDaily
    ? Number(state?.today?.deltaTotal || 0)
    : Math.max(0, Number(state?.today?.totalSaved || 0));
  const scaleMax = isDaily
    ? Math.max(1, ...values.map((value) => Math.abs(value)))
    : Math.max(1, goal, current, ...values);
  const goalPosition = goal > 0
    ? Math.max(0, Math.min(100, (goal / scaleMax) * 100))
    : 0;
  const formatValue = (value, signed = false) => {
    const number = Number(value || 0);
    const formatted = Math.abs(number).toLocaleString("ja-JP");
    if (!signed || number === 0) return number < 0 ? `-${formatted}` : formatted;
    return `${number > 0 ? "+" : "-"}${formatted}`;
  };

  const bars = rows.map((row, index) => {
    const value = values[index];
    const ratio = Math.max(
      0,
      Math.min(100, (Math.abs(value) / scaleMax) * 100),
    );
    const visibleHeight = value !== 0
      ? Math.max(2, isDaily ? ratio * 0.48 : ratio)
      : 0;
    const date = String(row?.date || "");
    const shortDate = date.length >= 10
      ? date.slice(5).replace("-", "/")
      : date;
    const valueText = formatValue(value, isDaily);
    const barClass = value < 0 ? " is-negative" : " is-positive";

    return `
      <div class="dashboardProgressBarItem" title="${esc(date || "-")}: ${esc(valueText)}文字${isDaily ? "（純増減）" : ""}">
        <div class="dashboardProgressBarTrack${isDaily ? " is-daily" : ""}">
          <div class="dashboardProgressBar${barClass}" style="height:${visibleHeight.toFixed(2)}%"></div>
        </div>
        <div class="dashboardProgressBarValue">${esc(valueText)}</div>
        <div class="dashboardProgressBarDate">${esc(shortDate || "-")}</div>
      </div>
    `;
  }).join("");

  const sevenDayDelta = rows.reduce(
    (total, row) => total + Number(row?.deltaTotal || 0),
    0,
  );

  return `
    <div class="dashboardProgressMeta">
      ${
        isDaily
          ? `
            <span>今日 <strong>${esc(formatValue(current, true))}</strong>文字</span>
            <span>7日合計 <strong>${esc(formatValue(sevenDayDelta, true))}</strong>文字</span>
            <span>純増減</span>
          `
          : `
            <span>現在 <strong>${esc(formatValue(current))}</strong>文字</span>
            <span>目標 <strong>${esc(goal > 0 ? goal.toLocaleString("ja-JP") : "未設定")}</strong></span>
            <span>${esc(state.currentWorkPctText || "-")}</span>
          `
      }
    </div>
    <div class="dashboardProgressChart${isDaily ? " is-daily" : ""}" role="img" aria-label="${isDaily ? "直近7日の日別文字数差分" : "直近7日の現在文字数の推移"}">
      ${
        !isDaily && goal > 0
          ? `<div class="dashboardProgressGoalLine" style="bottom:${goalPosition.toFixed(2)}%"><span>目標</span></div>`
          : ""
      }
      <div class="dashboardProgressBars">
        ${bars || '<div class="dashboardProgressEmpty">保存後に進捗が表示されます。</div>'}
      </div>
    </div>
    <div class="dashboardProgressFooter">
      <span>直近7日${isDaily ? "（保存なしは0）" : ""}</span>
      <span>締切 ${esc(state.currentWorkDeadline || "-")}（${esc(state.currentWorkDeadlineText || "-")}）</span>
    </div>
  `;
}

function renderDashboardGoalTable(state, esc) {
  return `
    <table>
      <tr><th>目標文字数</th><td class="num">${esc(state.currentWorkGoal ?? 0)}</td></tr>
      <tr><th>現在の進捗</th><td class="num">${esc(state.currentWorkPctText ?? "-")}</td></tr>
      <tr><th>締切</th><td class="num">${esc(state.currentWorkDeadline || "-")}</td></tr>
      <tr><th>締切まで</th><td class="num">${esc(state.currentWorkDeadlineText || "-")}</td></tr>
    </table>

    <p class="statsHint">目標・締切の変更は作品ツリーの「作品設定」から行えます。</p>
  `;
}

function renderDashboardSummaryCard(state, esc) {
  const showProgressGraph = state?.dashboardVisibility?.progressGraph !== false;
  const progressGraphMode = state?.dashboardVisibility?.progressGraphMode === "total"
    ? "total"
    : "daily";
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
          <div class="dashboardProgressHead">
            <div class="dashboardSubsectionLabel">${
              showProgressGraph
                ? progressGraphMode === "daily"
                  ? "日別の執筆差分"
                  : "現在文字数の推移"
                : "作品の目標"
            }</div>
            <div class="dashboardProgressActions">
              <select id="dashboardProgressGraphMode" aria-label="進捗グラフの表示内容" ${showProgressGraph ? "" : "disabled"}>
                <option value="daily" ${progressGraphMode === "daily" ? "selected" : ""}>日別差分</option>
                <option value="total" ${progressGraphMode === "total" ? "selected" : ""}>現在文字数</option>
              </select>
              <label class="chip dashboardProgressToggle">
                <input type="checkbox" id="toggleDashboardProgressGraph" ${showProgressGraph ? "checked" : ""}>
                グラフ
              </label>
            </div>
          </div>
          ${showProgressGraph
            ? renderDashboardProgressChart(state, esc)
            : renderDashboardGoalTable(state, esc)}
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
