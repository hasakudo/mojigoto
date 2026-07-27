const {
  renderDashboardNoteModal,
  renderDashboardNotesDataScript,
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
  <button id="btnRefresh">更新</button>
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
    ${renderWritingMemoStatusMenu()}
    ${renderDashboardNotesDataScript(state)}
  `;
}

module.exports = { renderBody };