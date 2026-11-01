const { actionIcon } = require("../../views/shared/action-icons");
const {
  renderDashboardNoteModal,
  renderDashboardNotesDataScript,
  renderProgressShareModal,
  renderProgressSummaryDataScript,
  renderDashboardTab,
} = require("./stats-html-dashboard");
const {
  renderWritingMemoStatusMenu,
  renderStatsTab,
  renderWritingMemoTab,
  renderHighlightTab,
} = require("./stats-html-records");

function renderHeader(state, esc) {
  return `
  <div class="statsHeader">
  <h1>Dashboard <span class="chip">${esc(state.exportedAtJst || "")}</span></h1>
  <div class="statsHeaderActions">
    <button id="btnCorrectStats">記録を補正</button>
    <button id="btnRefresh" class="statsIconButton" title="Dashboardを更新" aria-label="Dashboardを更新">${actionIcon("refresh")}</button>
  </div>
  </div>`;
}

function renderTabBar() {
  return `
  <div class="tabbar">
    <button id="tabDashboardBtn" class="tab-btn">ダッシュボード</button>
    <button id="tabStatsBtn" class="tab-btn">執筆記録</button>
    <button id="tabWritingMemoBtn" class="tab-btn">執筆メモ</button>
    <button id="tabHighlightBtn" class="tab-btn">ハイライト分析</button>
  </div>
  `;
}

function renderBody(state, esc) {
  return `
    ${renderHeader(state, esc)}
    ${renderTabBar()}
    ${renderDashboardTab(state, esc)}
    ${renderStatsTab(state, esc)}
    ${renderWritingMemoTab(state, esc)}
    ${renderHighlightTab(state, esc)}
    ${renderDashboardNoteModal()}
    ${renderProgressShareModal(state)}
    ${renderWritingMemoStatusMenu()}
    ${renderDashboardNotesDataScript(state)}
    ${renderProgressSummaryDataScript(state)}
  `;
}

module.exports = { renderBody };
