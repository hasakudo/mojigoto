const vscode = require("vscode");
const {
  readSettingsFile,
  writeSettingsFile,
  syncExportOptionsToWorkspace,
  resolveSettingsTarget,
  WORK_STATUS_OPTIONS,
  DEFAULT_GENRE_OPTIONS,
  hideCustomGenreOptions,
  restoreGenreOptions,
  collectGenreOptions,
  getPenNameOptions,
  rememberPenName,
} = require("../data/settings-store");
const { exportTreeItem } = require("../export/export-service");
const { getNonce, escapeHtml } = require("../core/path-utils");

const settingsPanels = new Map();

function getSettingsUiSettings() {
  const config = vscode.workspace.getConfiguration("mojigoto");
  const percent = Math.min(
    200,
    Math.max(80, Number(config.get("webviewFontScalePercent", 100)) || 100),
  );
  const autoSaveDelaySeconds = Math.min(
    30,
    Math.max(0.5, Number(config.get("webviewAutoSaveDelaySeconds", 2)) || 2),
  );
  return {
    fontScale: percent / 100,
    autoSaveEnabled: config.get("webviewAutoSaveEnabled", true) !== false,
    autoSaveDelayMs: Math.round(autoSaveDelaySeconds * 1000),
  };
}

function getSettingsPanelKey(target, item) {
  if (target?.mode === "single") {
    return "single";
  }
  return `multi:${String(item?.fsPath || "")}`;
}

function getSettingsWebviewHtml(webview, settings, meta) {
  const genreOptions = Array.isArray(meta?.genreOptions)
    ? meta.genreOptions
    : [];
  const penNameOptions = Array.isArray(meta?.penNameOptions)
    ? meta.penNameOptions
    : [];
  const nonce = getNonce();
  const config = vscode.workspace.getConfiguration("mojigoto");
  const { fontScale } = getSettingsUiSettings();

  const exportDefaults = {
    includeFolderName: config.get("exportIncludeFolderName", false),
    includeGenre: config.get("exportIncludeGenre", true),
    includeTargetChars: config.get("exportIncludeTargetChars", true),
    includeDeadline: config.get("exportIncludeDeadline", true),
    includePenName: config.get("exportIncludePenName", true),
    includeMemo: config.get("exportIncludeMemo", false),
    includeUpdatedAt: config.get("exportIncludeUpdatedAt", false),
  };
  const title =
    meta.mode === "single"
      ? "作品設定"
      : `作品設定 - ${settings.title || settings.folderName || "作品"}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --mojigoto-content-font-scale: ${fontScale};
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 20px 20px 86px;
      font-size: calc(13px * var(--mojigoto-content-font-scale));
    }

    .wrap {
      max-width: 1420px;
      margin: 0 auto;
    }

    .settingsLayout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
      gap: 24px;
      align-items: start;
    }

    .exportPreview {
      position: sticky;
      top: 18px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    }

    .exportPreview > summary {
      padding: 11px 13px;
      cursor: pointer;
      font-weight: 700;
      border-bottom: 1px solid transparent;
    }

    .exportPreview[open] > summary {
      border-bottom-color: var(--vscode-panel-border);
    }

    .previewPaper {
      margin: 14px;
      padding: 20px;
      min-height: 320px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
    }

    .previewPaper h2,
    .previewPaper h3 {
      margin: 0 0 12px;
    }

    .previewPaper h3 {
      margin-top: 20px;
      font-size: 1em;
    }

    .previewMeta {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 6px 12px;
      margin: 0;
    }

    .previewMeta dt {
      font-weight: 700;
    }

    .previewMeta dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .previewBlock {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.7;
    }

    .grid {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 12px 16px;
      align-items: start;
    }

    label {
      font-weight: 600;
      padding-top: 10px;
    }

    input[type="text"],
    input[type="number"],
    input[type="date"],
    select,
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      font: inherit;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
    }

    input[type="date"]::-webkit-calendar-picker-indicator {
        filter: invert(40%) sepia(90%) saturate(1000%) hue-rotate(180deg);
    }

    textarea {
      min-height: 180px;
      resize: vertical;
      line-height: 1.6;
    }

    #memo {
      min-height: 140px;
    }

    .hint {
      font-size: calc(12px * var(--mojigoto-content-font-scale));
      opacity: 0.8;
      margin-top: 6px;
      line-height: 1.5;
    }

    .metaRow {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-top: 6px;
      font-size: calc(12px * var(--mojigoto-content-font-scale));
      opacity: 0.9;
      line-height: 1.5;
    }

    .metaBox {
      white-space: nowrap;
    }

    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      position: fixed;
      z-index: 30;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0;
      padding: 12px 20px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.12);
    }

    button {
      padding: 8px 14px;
      font: inherit;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
    }

    .primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    .secondary {
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      background: var(--vscode-button-secondaryBackground, transparent);
    }

    .status {
      flex: 0 1 auto;
      z-index: 50;
      width: max-content;
      min-width: min(220px, calc(100vw - 24px));
      max-width: min(420px, calc(100vw - 24px));
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid var(--vscode-editorInfo-foreground);
      border-radius: 8px;
      background: var(--vscode-notifications-background, var(--vscode-editorWidget-background));
      color: var(--vscode-notifications-foreground, var(--vscode-editorWidget-foreground));
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
      font-size: calc(12px * var(--mojigoto-content-font-scale));
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(-6px);
      transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
    }

    .status.isVisible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition-delay: 0s;
    }

    .status.isError {
      border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-panel-border));
    }

    .menuWrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .menuButton {
      padding: 8px 14px;
    }

    .morePanel {
      position: absolute;
      right: 0;
      bottom: calc(100% + 6px);
      left: auto;

      min-width: 260px;
      padding: 10px;
      border-radius: 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
      z-index: 20;
    }

    .menuSection {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .menuTitle {
      font-weight: bold;
      margin-bottom: 4px;
    }

    .menuSection > p {
      margin: 0 0 4px;
      padding: 0;
    }

    .headerRow {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 18px;
    }

    .headerRow h1 {
      font-size: calc(20px * var(--mojigoto-content-font-scale));
      margin: 0;
    }

    .dirtyBadge {
      flex: 0 0 auto;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: calc(12px * var(--mojigoto-content-font-scale));
      font-weight: 600;
      color: var(--vscode-editorWarning-foreground, #d19a00);
      background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #d19a00) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground, #d19a00) 34%, var(--vscode-panel-border));
      white-space: nowrap;
    }

    .genrePicker {
      display: grid;
      gap: 8px;
    }

    .genreInputRow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }

    .genreOptionsMenu {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
    }

    .genreOptionsMenu > summary {
      padding: 8px 10px;
      cursor: pointer;
      font-weight: 600;
    }

    .genreOptionList {
      display: grid;
      max-height: 220px;
      overflow-y: auto;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .genreOptionRow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 6px 8px;
    }

    .genreOptionRow + .genreOptionRow {
      border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
    }

    .genreOptionMain {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 0;
      font-weight: 400;
      cursor: pointer;
    }

    .genreOptionBadge {
      flex: 0 0 auto;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: calc(10px * var(--mojigoto-content-font-scale));
      color: var(--vscode-badge-foreground, #ffffff);
      background: var(--vscode-badge-background);
    }

    .genreOptionDelete {
      padding: 3px 8px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      border-radius: 5px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
    }

    .genreChips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 28px;
    }

    .genreChip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: calc(12px * var(--mojigoto-content-font-scale));
    }

    .genreChipRemove {
      padding: 0 4px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0.75;
    }

    .genreChipRemove:hover {
      opacity: 1;
      background: var(--vscode-list-hoverBackground);
    }

    .kbdHint {
      margin-left: 6px;
      font-size: calc(11px * var(--mojigoto-content-font-scale));
      opacity: 0.65;
      font-weight: 500;
      white-space: nowrap;
    }

    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }

      label {
        padding-top: 0;
      }

      body {
        padding-right: 14px;
        padding-left: 14px;
      }

      .actions {
        padding-right: 14px;
        padding-left: 14px;
      }
    }

    @media (max-width: 980px) {
      .settingsLayout {
        grid-template-columns: 1fr;
      }

      .exportPreview {
        position: static;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="headerRow">
      <h1>${escapeHtml(title)}</h1>
      <div id="dirtyBadge" class="dirtyBadge" hidden>未保存</div>
      <div class="status" id="statusMessage" role="status" aria-live="polite"></div>
    </div>

    <div class="settingsLayout">
      <div class="settingsForm">
        <div class="grid">
      <label for="title">作品名</label>
      <div>
        <input id="title" type="text" value="${escapeHtml(settings.title)}" />
        <div class="hint">作品ツリーや統計、作品切替などにも使われます。</div>
      </div>

      <label for="genreInput">ジャンル</label>
      <div>
        <div class="genrePicker">
          <div id="genreChips" class="genreChips"></div>

          <details class="genreOptionsMenu">
            <summary>候補から選ぶ</summary>
            <div id="genreOptionList" class="genreOptionList"></div>
          </details>

          <div class="genreInputRow">
            <input id="genreInput" type="text" placeholder="自由入力でジャンルを追加" />
            <button type="button" class="secondary" id="addGenreBtn">追加</button>
          </div>

          <div class="hint">
            チェックで複数選択できます。「自由入力」の候補だけ削除できます。作品で使用中の場合は作品設定を残して候補欄のみ非表示にします。
          </div>
        </div>
      </div>

      <label for="status">状態</label>
      <div>
        <select id="status">
          ${WORK_STATUS_OPTIONS.map((item) => {
            const selected =
              String(settings.status || "") === item.value ? " selected" : "";
            return `<option value="${escapeHtml(item.value)}"${selected}>${escapeHtml(item.label)}</option>`;
          }).join("")}
        </select>
        <div class="hint">作品ツリーの作品一覧を絞り込むときに使います。</div>
      </div>

      <label for="targetChars">目標文字数</label>
      <div>
        <input id="targetChars" type="number" min="0" step="100" value="${escapeHtml(settings.targetChars)}" />
      </div>

      <label for="deadline">締切</label>
      <div>
        <input id="deadline" type="date" value="${escapeHtml(settings.deadline)}" />
        <div class="metaRow">
          <div class="metaBox" id="deadlineDisplay">未設定</div>
          <div class="metaBox" id="deadlineDiff"></div>
        </div>
      </div>

      <label for="penName">ペンネーム</label>
      <div>
        <input id="penName" type="text" list="penNameOptions" value="${escapeHtml(settings.penName || "")}" placeholder="ペンネームを入力または選択" />
        <datalist id="penNameOptions">
          ${penNameOptions.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}
        </datalist>
        <div class="hint">保存したペンネームは、ほかの作品でも候補から選べます。</div>
      </div>

      <label for="summary">あらすじ</label>
      <div>
        <textarea id="summary">${escapeHtml(settings.summary)}</textarea>
        <div class="metaRow">
          <div class="metaBox" id="summaryCount">0文字</div>
        </div>
      </div>

      <label for="memo">メモ</label>
      <div>
        <textarea id="memo">${escapeHtml(settings.memo || "")}</textarea>
        <div class="hint">必須ではありません。応募条件、改稿方針、注意点など自由に書けます。</div>
      </div>
        </div>
      </div>

      <details class="exportPreview" id="exportPreview" open>
        <summary>HTML書き出しプレビュー</summary>
        <div class="previewPaper">
          <h2>設定</h2>
          <dl class="previewMeta" id="exportPreviewMeta"></dl>
          <h3>あらすじ</h3>
          <div class="previewBlock" id="exportPreviewSummary"></div>
          <div id="exportPreviewMemoSection">
            <h3>メモ</h3>
            <div class="previewBlock" id="exportPreviewMemo"></div>
          </div>
        </div>
      </details>
    </div>

    <div class="actions">
      <button class="primary" id="saveBtn">保存<span class="kbdHint">Ctrl/Cmd+S</span></button>
      <button class="secondary" id="closeBtn">閉じる<span class="kbdHint">Ctrl/Cmd+W</span></button>
      <button class="secondary" id="exportBtn">書き出し</button>
      <div class="menuWrap">
        <button class="secondary menuButton" id="moreBtn">︙</button>

        <div id="morePanel" class="morePanel" hidden>
          <div class="menuSection">
            <div class="menuTitle">HTML書き出し設定</div>
            <p>HTML書き出しに含める項目にチェック</p>

            <label><input type="checkbox" id="includeFolderName"> フォルダ名</label>
            <label><input type="checkbox" id="includeGenre"> ジャンル</label>
            <label><input type="checkbox" id="includeTargetChars"> 目標文字数</label>
            <label><input type="checkbox" id="includeDeadline"> 締切日</label>
            <label><input type="checkbox" id="includePenName"> ペンネーム</label>
            <label><input type="checkbox" id="includeMemo"> メモ</label>
            <label><input type="checkbox" id="includeUpdatedAt"> 更新日時</label>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initial = ${JSON.stringify(settings)};
    const exportDefaults = ${JSON.stringify(exportDefaults)};
    let currentUiSettings = ${JSON.stringify(getSettingsUiSettings())};

    let availableGenreOptions = ${JSON.stringify(genreOptions)};
    const defaultGenreOptionKeys = new Set(
      ${JSON.stringify(DEFAULT_GENRE_OPTIONS)}.map((item) => String(item).toLowerCase()),
    );
    let selectedGenres = Array.isArray(initial.genres)
      ? [...initial.genres]
      : String(initial.genre || "")
          .split(/[,\\n、，\\/／]+/)
          .map((item) => item.trim())
          .filter(Boolean);

    const statusEl = document.getElementById("statusMessage");
    const deadlineInput = document.getElementById("deadline");
    const summaryInput = document.getElementById("summary");
    const memoInput = document.getElementById("memo");

    const dirtyBadgeEl = document.getElementById("dirtyBadge");
    let dirty = false;
    let statusTimer = 0;
    let changeRevision = 0;

    function updateDirtyUi() {
      if (dirtyBadgeEl) {
        dirtyBadgeEl.hidden = !dirty;
      }
    }

    function markDirty() {
      dirty = true;
      changeRevision += 1;
      updateDirtyUi();
      vscode.postMessage({
        type: "scheduleSettingsSave",
        payload: collectPayload(),
        revision: changeRevision,
      });
    }

    function clearDirty(savedRevision = changeRevision) {
      if (Number(savedRevision) < changeRevision) return;
      dirty = false;
      updateDirtyUi();
    }

    function setStatus(message, persist = false, isError = false) {
      window.clearTimeout(statusTimer);
      statusEl.textContent = message || "";
      statusEl.classList.toggle("isError", Boolean(isError));
      statusEl.classList.toggle("isVisible", Boolean(message));
      if (message && !persist) {
        statusTimer = window.setTimeout(() => {
          statusEl.classList.remove("isVisible", "isError");
          statusEl.textContent = "";
        }, 1800);
      }
    }

    function countChars(text) {
      return Array.from(String(text || "").replace(/\\r?\\n/g, "")).length;
    }

    function updateSummaryCount() {
      const count = countChars(summaryInput.value);
      document.getElementById("summaryCount").textContent = \`\${count}文字\`;
    }

    function formatDeadlineJP(value) {
      if (!value) {
        return { text: "未設定", diff: "" };
      }

      const parts = value.split("-");
      if (parts.length !== 3) {
        return { text: value, diff: "" };
      }

      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);

      if (!year || !month || !day) {
        return { text: value, diff: "" };
      }

      const date = new Date(year, month - 1, day);
      const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
      const weekday = weekdays[date.getDay()] || "";
      const text = \`\${year}/\${String(month).padStart(2, "0")}/\${String(day).padStart(2, "0")}（\${weekday}）\`;

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const targetStart = new Date(year, month - 1, day);
      const diffMs = targetStart.getTime() - todayStart.getTime();
      const diffDays = Math.round(diffMs / 86400000);

      let diff = "";
      if (diffDays > 0) {
        diff = \`あと\${diffDays}日\`;
      } else if (diffDays === 0) {
        diff = "今日が締切";
      } else {
        diff = \`\${Math.abs(diffDays)}日経過\`;
      }

      return { text, diff };
    }

    function updateDeadlineDisplay() {
      const result = formatDeadlineJP(deadlineInput.value);
      document.getElementById("deadlineDisplay").textContent = result.text;
      document.getElementById("deadlineDiff").textContent = result.diff;
    }

    function escapeHtml(text) {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function normalizeGenreText(value) {
      return String(value || "").trim().replace(/\\s+/g, " ");
    }

    function normalizeGenres(values) {
      const source = Array.isArray(values) ? values : [values];
      const seen = new Set();
      const result = [];

      source.forEach((value) => {
        const genre = normalizeGenreText(value);
        if (!genre) return;

        const key = genre.toLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        result.push(genre);
      });

      return result;
    }

    function renderGenreChips() {
      const wrap = document.getElementById("genreChips");
      if (!wrap) return;

      if (!selectedGenres.length) {
        wrap.innerHTML = '<span class="hint">未設定</span>';
        renderExportPreview();
        return;
      }

      wrap.innerHTML = selectedGenres
        .map((genre) => {
          return (
            '<span class="genreChip">' +
              escapeHtml(genre) +
              '<button type="button" class="genreChipRemove" data-remove-genre="' +
                escapeHtml(genre) +
              '" title="削除">×</button>' +
            '</span>'
          );
        })
        .join("");

      wrap.querySelectorAll("[data-remove-genre]").forEach((button) => {
        button.addEventListener("click", () => {
          const genre = button.getAttribute("data-remove-genre") || "";
          selectedGenres = selectedGenres.filter((item) => item !== genre);
          markDirty();
          renderGenreChips();
          renderGenreOptions();
        });
      });

      renderExportPreview();
    }

    function isGenreSelected(value) {
      const key = normalizeGenreText(value).toLowerCase();
      return selectedGenres.some(
        (genre) => normalizeGenreText(genre).toLowerCase() === key,
      );
    }

    function renderGenreOptions() {
      const wrap = document.getElementById("genreOptionList");
      if (!wrap) return;

      availableGenreOptions = normalizeGenres(availableGenreOptions);
      wrap.innerHTML = availableGenreOptions
        .map((genre) => {
          const isDefault = defaultGenreOptionKeys.has(genre.toLowerCase());
          const checked = isGenreSelected(genre) ? " checked" : "";
          return (
            '<div class="genreOptionRow">' +
              '<label class="genreOptionMain">' +
                '<input type="checkbox" data-genre-option="' + escapeHtml(genre) + '"' + checked + '>' +
                '<span>' + escapeHtml(genre) + '</span>' +
                '<span class="genreOptionBadge">' + (isDefault ? "標準" : "自由入力") + '</span>' +
              '</label>' +
              (isDefault
                ? ""
                : '<button type="button" class="genreOptionDelete" data-delete-genre-option="' +
                    escapeHtml(genre) +
                  '" title="自由入力候補を削除">削除</button>') +
            '</div>'
          );
        })
        .join("");

      wrap.querySelectorAll("[data-genre-option]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const genre = checkbox.getAttribute("data-genre-option") || "";
          if (checkbox.checked) {
            selectedGenres = normalizeGenres([...selectedGenres, genre]);
          } else {
            selectedGenres = selectedGenres.filter(
              (item) => normalizeGenreText(item).toLowerCase() !== normalizeGenreText(genre).toLowerCase(),
            );
          }
          markDirty();
          renderGenreChips();
        });
      });

      wrap.querySelectorAll("[data-delete-genre-option]").forEach((button) => {
        button.addEventListener("click", () => {
          const genre = button.getAttribute("data-delete-genre-option") || "";
          availableGenreOptions = availableGenreOptions.filter(
            (item) => normalizeGenreText(item).toLowerCase() !== normalizeGenreText(genre).toLowerCase(),
          );
          renderGenreOptions();
          vscode.postMessage({ type: "hideGenreOptions", values: [genre] });
          setStatus("自由入力候補「" + genre + "」を削除しました。");
        });
      });
    }

    function addGenreFromInput() {
      const input = document.getElementById("genreInput");
      if (!input) return;

      const values = String(input.value || "")
        .split(/[\\s,、，\\/／]+/)
        .map((item) => normalizeGenreText(item))
        .filter(Boolean);
      if (!values.length) return;

      selectedGenres = normalizeGenres([...selectedGenres, ...values]);
      availableGenreOptions = normalizeGenres([...availableGenreOptions, ...values]);
      vscode.postMessage({ type: "restoreGenreOptions", values });
      input.value = "";
      markDirty();
      renderGenreChips();
      renderGenreOptions();
    }

    function collectPayload() {
      return {
        title: document.getElementById("title").value,
        genre: selectedGenres.join(", "),
        genres: selectedGenres,
        status: document.getElementById("status").value,
        targetChars: document.getElementById("targetChars").value,
        deadline: document.getElementById("deadline").value,
        penName: document.getElementById("penName").value,
        summary: document.getElementById("summary").value,
        memo: memoInput.value,

        exportOptions: {
          includeFolderName: document.getElementById("includeFolderName").checked,
          includeGenre: document.getElementById("includeGenre").checked,
          includeTargetChars: document.getElementById("includeTargetChars").checked,
          includeDeadline: document.getElementById("includeDeadline").checked,
          includePenName: document.getElementById("includePenName").checked,
          includeMemo: document.getElementById("includeMemo").checked,
          includeUpdatedAt: document.getElementById("includeUpdatedAt").checked,
        },
      };
    }

    function renderExportPreview() {
      const payload = collectPayload();
      const rows = [
        ["作品名", payload.title || "（未入力）"],
      ];

      if (payload.exportOptions.includeFolderName) {
        rows.push(["フォルダ名", initial.folderName || "（未設定）"]);
      }
      if (payload.exportOptions.includeGenre) {
        rows.push(["ジャンル", payload.genres.join("、") || "（未設定）"]);
      }
      if (payload.exportOptions.includeTargetChars) {
        rows.push(["目標文字数", payload.targetChars || "0"]);
      }
      if (payload.exportOptions.includeDeadline) {
        rows.push(["締切", payload.deadline || "（未設定）"]);
      }
      if (payload.exportOptions.includePenName) {
        rows.push(["ペンネーム", payload.penName || "（未設定）"]);
      }
      if (payload.exportOptions.includeUpdatedAt) {
        rows.push(["更新日時", initial.updatedAt || "（保存後に更新）"]);
      }

      document.getElementById("exportPreviewMeta").innerHTML = rows
        .map(([label, value]) =>
          "<dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd>",
        )
        .join("");
      document.getElementById("exportPreviewSummary").textContent =
        payload.summary || "（未入力）";
      document.getElementById("exportPreviewMemo").textContent =
        payload.memo || "（未入力）";
      document.getElementById("exportPreviewMemoSection").hidden =
        !payload.exportOptions.includeMemo;
    }

    function applyExportOptions(initial) {
      const opts = initial.exportOptions || {};

      document.getElementById("includeFolderName").checked =
        typeof opts.includeFolderName === "boolean"
          ? opts.includeFolderName
          : !!exportDefaults.includeFolderName;

      document.getElementById("includeGenre").checked =
        typeof opts.includeGenre === "boolean"
          ? opts.includeGenre
          : !!exportDefaults.includeGenre;

      document.getElementById("includeTargetChars").checked =
        typeof opts.includeTargetChars === "boolean"
          ? opts.includeTargetChars
          : !!exportDefaults.includeTargetChars;

      document.getElementById("includeDeadline").checked =
        typeof opts.includeDeadline === "boolean"
          ? opts.includeDeadline
          : !!exportDefaults.includeDeadline;

      document.getElementById("includePenName").checked =
        typeof opts.includePenName === "boolean"
          ? opts.includePenName
          : !!exportDefaults.includePenName;

      document.getElementById("includeMemo").checked =
        typeof opts.includeMemo === "boolean"
          ? opts.includeMemo
          : !!exportDefaults.includeMemo;

      document.getElementById("includeUpdatedAt").checked =
        typeof opts.includeUpdatedAt === "boolean"
          ? opts.includeUpdatedAt
          : !!exportDefaults.includeUpdatedAt;
    }

    function saveCurrentSettings() {
      vscode.postMessage({
        type: "save",
        payload: collectPayload(),
        revision: changeRevision,
      });

      setStatus("保存中...", true);
    }

    function handleSettingsShortcut(event) {
      const key = String(event.key || "").toLowerCase();
      const isSave = (event.ctrlKey || event.metaKey) && key === "s";
      const isClose = (event.ctrlKey || event.metaKey) && key === "w";

      if (isSave) {
        event.preventDefault();
        saveCurrentSettings();
        return;
      }

      if (isClose) {
        event.preventDefault();
        requestCloseSettings();
      }
    }

    window.addEventListener("keydown", handleSettingsShortcut);

    document.getElementById("saveBtn").addEventListener("click", () => {
      saveCurrentSettings();
    });

    document.getElementById("addGenreBtn")?.addEventListener("click", () => {
      addGenreFromInput();
    });

    document.getElementById("genreInput")?.addEventListener("keydown", (event) => {
      const key = String(event.key || "");

      if (key === "Enter") {
        event.preventDefault();
        addGenreFromInput();
      }
    });

    document.getElementById("exportBtn")?.addEventListener("click", () => {
      setStatus("保存して書き出しています...", true);
      vscode.postMessage({
        type: "saveAndExport",
        payload: collectPayload(),
        revision: changeRevision,
      });
    });

    function requestCloseSettings() {
      vscode.postMessage({
        type: "requestClose",
        payload: {
          dirty,
        },
      });
    }

    document.getElementById("closeBtn").addEventListener("click", () => {
      requestCloseSettings();
    });

    const moreBtn = document.getElementById("moreBtn");
    const morePanel = document.getElementById("morePanel");

    moreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      morePanel.hidden = !morePanel.hidden;
    });

    document.addEventListener("click", (e) => {
      if (!morePanel || morePanel.hidden) return;
      if (!morePanel.contains(e.target) && e.target !== moreBtn) {
        morePanel.hidden = true;
      }
    });

    function bindDirtyInputs() {
      [
        "title",
        "status",
        "targetChars",
        "deadline",
        "penName",
        "summary",
        "memo",
        "includeFolderName",
        "includeGenre",
        "includeTargetChars",
        "includeDeadline",
        "includePenName",
        "includeMemo",
        "includeUpdatedAt",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        const tagName = String(el.tagName || "").toLowerCase();

        const eventName =
          el.type === "checkbox" || el.type === "date" || tagName === "select"
            ? "change"
            : "input";

        el.addEventListener(eventName, () => {
          markDirty();
          renderExportPreview();
        });
      });
    }

    summaryInput.addEventListener("input", updateSummaryCount);
    deadlineInput.addEventListener("input", updateDeadlineDisplay);
    deadlineInput.addEventListener("change", updateDeadlineDisplay);

    bindDirtyInputs();

    selectedGenres = normalizeGenres(selectedGenres);
    renderGenreChips();
    renderGenreOptions();

    updateSummaryCount();
    updateDeadlineDisplay();

    applyExportOptions(initial);
    renderExportPreview();

    const exportPreviewEl = document.getElementById("exportPreview");
    if (exportPreviewEl && window.matchMedia("(max-width: 980px)").matches) {
      exportPreviewEl.open = false;
    }

    clearDirty();

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "webviewUiSettingsChanged") {
        const scale = Number(msg.payload?.fontScale || 1);
        currentUiSettings = {
          ...currentUiSettings,
          ...(msg.payload || {}),
        };
        document.documentElement.style.setProperty(
          "--mojigoto-content-font-scale",
          String(scale),
        );
        return;
      }

      if (msg.type === "saved") {
        clearDirty(msg.revision);
        setStatus(msg.autoSave ? "自動保存しました。" : "保存しました。");
      } else if (msg.type === "genreOptionsRemoved") {
        const hidden = normalizeGenres(msg.hidden || []);
        const deleted = normalizeGenres(msg.deleted || []);
        const deletedKeys = new Set(
          deleted.map((value) => value.toLowerCase()),
        );
        if (deletedKeys.size) {
          selectedGenres = selectedGenres.filter(
            (value) => !deletedKeys.has(normalizeGenreText(value).toLowerCase()),
          );
          markDirty();
          renderGenreChips();
          renderGenreOptions();
        }
        if (deleted.length) {
          setStatus("どの作品にも使われていない自由入力候補を完全に削除しました。");
        } else if (hidden.length) {
          setStatus("作品で使用中のため、作品設定を残して候補欄から非表示にしました。");
        }
      } else if (msg.type === "error") {
        setStatus(msg.message || "保存に失敗しました。", false, true);
      }
    });
  </script>
</body>
</html>`;
}

async function openSettingsWebview(context, treeProvider, item) {
  const target = await resolveSettingsTarget(item);
  const panelKey = getSettingsPanelKey(target, item);

  const existing = settingsPanels.get(panelKey);
  if (existing) {
    let latest = await readSettingsFile(target.readPath || target.path, item);
    existing.title = latest.title ? `作品設定: ${latest.title}` : "作品設定";
    const genreOptions = await collectGenreOptions(
      latest.genres || latest.genre,
      context,
    );

    existing.webview.html = getSettingsWebviewHtml(existing.webview, latest, {
      ...target,
      genreOptions,
      penNameOptions: getPenNameOptions(context, latest.penName),
    });
    existing.reveal(vscode.ViewColumn.One);
    return;
  }

  let initial = await readSettingsFile(target.readPath || target.path, item);

  const panel = vscode.window.createWebviewPanel(
    "mojigoto.settingsEditor",
    initial.title ? `作品設定: ${initial.title}` : "作品設定",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  settingsPanels.set(panelKey, panel);

  let settingsAutoSaveTimer = null;
  let settingsSaveQueue = Promise.resolve();

  panel.onDidDispose(() => {
    if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
    settingsAutoSaveTimer = null;
    if (settingsPanels.get(panelKey) === panel) {
      settingsPanels.delete(panelKey);
    }
  });

  const settingsDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("mojigoto.webviewFontScalePercent")) {
        panel.webview.postMessage({
          type: "webviewUiSettingsChanged",
          payload: getSettingsUiSettings(),
        });
      }
      if (
        event.affectsConfiguration("mojigoto.webviewAutoSaveEnabled") ||
        event.affectsConfiguration("mojigoto.webviewAutoSaveDelaySeconds")
      ) {
        panel.webview.postMessage({
          type: "webviewUiSettingsChanged",
          payload: getSettingsUiSettings(),
        });
        if (!getSettingsUiSettings().autoSaveEnabled) {
          if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
          settingsAutoSaveTimer = null;
        }
      }
    },
  );
  context.subscriptions.push(settingsDisposable);
  panel.onDidDispose(() => settingsDisposable.dispose());

  const genreOptions = await collectGenreOptions(
    initial.genres || initial.genre,
    context,
  );

  panel.webview.html = getSettingsWebviewHtml(panel.webview, initial, {
    ...target,
    genreOptions,
    penNameOptions: getPenNameOptions(context, initial.penName),
  });

  async function persistSettings(message, notifyWebview = true) {
    const revision = Number(message?.revision || 0);
    const autoSave = Boolean(message?.autoSave);

    settingsSaveQueue = settingsSaveQueue
      .catch(() => undefined)
      .then(async () => {
        const saved = await writeSettingsFile(target.path, {
          ...initial,
          ...(message?.payload || {}),
          folderName: initial.folderName || item?.workName || "",
        });

        initial = saved;
        await rememberPenName(context, saved.penName);
        await collectGenreOptions(saved.genres || saved.genre, context);
        panel.title = saved.title ? `作品設定: ${saved.title}` : "作品設定";
        treeProvider?.refresh();
        await syncExportOptionsToWorkspace(saved.exportOptions);
        await vscode.commands.executeCommand("mojigoto.refreshStats");
        await vscode.commands.executeCommand(
          "setContext",
          "mojigoto.settingsUpdated",
          Date.now(),
        );
        return saved;
      });

    const saved = await settingsSaveQueue;
    if (notifyWebview) {
      panel.webview.postMessage({
        type: "saved",
        revision,
        autoSave,
      });
    }
    return saved;
  }

  panel.webview.onDidReceiveMessage(
    async (message) => {
      try {
        if (message?.type === "close") {
          panel.dispose();
          return;
        }

        if (message?.type === "hideGenreOptions") {
          const result = await hideCustomGenreOptions(
            context,
            message.values || [],
          );
          panel.webview.postMessage({
            type: "genreOptionsRemoved",
            hidden: result?.hidden || [],
            deleted: result?.deleted || [],
          });
          return;
        }

        if (message?.type === "restoreGenreOptions") {
          await restoreGenreOptions(context, message.values || []);
          return;
        }

        if (message?.type === "scheduleSettingsSave") {
          if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
          const uiSettings = getSettingsUiSettings();
          if (!uiSettings.autoSaveEnabled) {
            settingsAutoSaveTimer = null;
            return;
          }

          const pendingMessage = {
            payload: message.payload || {},
            revision: Number(message.revision || 0),
            autoSave: true,
          };
          settingsAutoSaveTimer = setTimeout(() => {
            settingsAutoSaveTimer = null;
            persistSettings(pendingMessage, true).catch((error) => {
              panel.webview.postMessage({
                type: "error",
                message: `自動保存に失敗しました: ${String(error)}`,
              });
            });
          }, uiSettings.autoSaveDelayMs);
          return;
        }

        if (message?.type === "requestClose") {
          const dirty = Boolean(message?.payload?.dirty);

          if (!dirty) {
            panel.dispose();
            return;
          }

          const picked = await vscode.window.showWarningMessage(
            "未保存の変更があります。このまま閉じますか？",
            { modal: true },
            "閉じる",
            "キャンセル",
          );

          if (picked === "閉じる") {
            panel.dispose();
          }

          return;
        }

        if (message?.type === "saveAndExport") {
          if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
          settingsAutoSaveTimer = null;
          await persistSettings(message, false);

          await exportTreeItem(context, {
            kind: "settingsEntry",
            contextValue: "settingsEntry",
            fsPath: item?.fsPath || "",
            workName: item?.workName || "",
          });

          panel.webview.postMessage({
            type: "saved",
            revision: Number(message.revision || 0),
            autoSave: false,
          });
          return;
        }

        if (message?.type === "save") {
          if (settingsAutoSaveTimer) clearTimeout(settingsAutoSaveTimer);
          settingsAutoSaveTimer = null;
          await persistSettings(message, true);
          return;
        }
      } catch (e) {
        panel.webview.postMessage({
          type: "error",
          message: `保存または書き出しに失敗しました: ${String(e)}`,
        });
      }
    },
    null,
    context.subscriptions,
  );
}

module.exports = {
  openSettingsWebview,
};
