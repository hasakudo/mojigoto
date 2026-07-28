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
} = require("../data/settings-store");
const { exportTreeItem } = require("../export/export-service");
const { getNonce, escapeHtml } = require("../core/path-utils");

const settingsPanels = new Map();

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
  const nonce = getNonce();
  const config = vscode.workspace.getConfiguration("mojigoto");

  const exportDefaults = {
    includeFolderName: config.get("exportIncludeFolderName", false),
    includeGenre: config.get("exportIncludeGenre", true),
    includeTargetChars: config.get("exportIncludeTargetChars", true),
    includeDeadline: config.get("exportIncludeDeadline", true),
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
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 20px;
    }

    .wrap {
      max-width: 980px;
      margin: 0 auto;
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
      font-size: 12px;
      opacity: 0.8;
      margin-top: 6px;
      line-height: 1.5;
    }

    .metaRow {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin-top: 6px;
      font-size: 12px;
      opacity: 0.9;
      line-height: 1.5;
    }

    .metaBox {
      white-space: nowrap;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
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
      margin-top: 14px;
      min-height: 1.4em;
      font-size: 12px;
      opacity: 0.9;
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
      font-size: 20px;
      margin: 0;
    }

    .dirtyBadge {
      flex: 0 0 auto;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
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
      font-size: 10px;
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
      font-size: 12px;
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
      font-size: 11px;
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
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="headerRow">
      <h1>${escapeHtml(title)}</h1>
      <div id="dirtyBadge" class="dirtyBadge" hidden>未保存</div>
    </div>

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
            <label><input type="checkbox" id="includeMemo"> メモ</label>
            <label><input type="checkbox" id="includeUpdatedAt"> 更新日時</label>
          </div>
        </div>
      </div>
    </div>

    <div class="status" id="statusMessage"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initial = ${JSON.stringify(settings)};
    const exportDefaults = ${JSON.stringify(exportDefaults)};

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

    function updateDirtyUi() {
      if (dirtyBadgeEl) {
        dirtyBadgeEl.hidden = !dirty;
      }
    }

    function markDirty() {
      dirty = true;
      updateDirtyUi();
    }

    function clearDirty() {
      dirty = false;
      updateDirtyUi();
    }

    function setStatus(message) {
      statusEl.textContent = message || "";
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
        summary: document.getElementById("summary").value,
        memo: memoInput.value,

        exportOptions: {
          includeFolderName: document.getElementById("includeFolderName").checked,
          includeGenre: document.getElementById("includeGenre").checked,
          includeTargetChars: document.getElementById("includeTargetChars").checked,
          includeDeadline: document.getElementById("includeDeadline").checked,
          includeMemo: document.getElementById("includeMemo").checked,
          includeUpdatedAt: document.getElementById("includeUpdatedAt").checked,
        },
      };
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
        payload: collectPayload()
      });

      setStatus("保存中...");
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
      vscode.postMessage({
        type: "saveAndExport",
        payload: collectPayload(),
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
        "summary",
        "memo",
        "includeFolderName",
        "includeGenre",
        "includeTargetChars",
        "includeDeadline",
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

    clearDirty();

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === "saved") {
        clearDirty();
        setStatus("保存しました。");
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
        setStatus(msg.message || "保存に失敗しました。");
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

  panel.onDidDispose(() => {
    if (settingsPanels.get(panelKey) === panel) {
      settingsPanels.delete(panelKey);
    }
  });

  const genreOptions = await collectGenreOptions(
    initial.genres || initial.genre,
    context,
  );

  panel.webview.html = getSettingsWebviewHtml(panel.webview, initial, {
    ...target,
    genreOptions,
  });

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
          const saved = await writeSettingsFile(target.path, {
            ...initial,
            ...message.payload,
            folderName: initial.folderName || item?.workName || "",
          });

          initial = saved;

          const genreOptions = await collectGenreOptions(
            saved.genres || saved.genre,
            context,
          );

          panel.title = saved.title ? `作品設定: ${saved.title}` : "作品設定";
          panel.webview.html = getSettingsWebviewHtml(panel.webview, initial, {
            ...target,
            genreOptions,
          });

          treeProvider?.refresh();

          await syncExportOptionsToWorkspace(saved.exportOptions);
          await vscode.commands.executeCommand("mojigoto.refreshStats");
          await vscode.commands.executeCommand(
            "setContext",
            "mojigoto.settingsUpdated",
            Date.now(),
          );

          await exportTreeItem(context, {
            kind: "settingsEntry",
            contextValue: "settingsEntry",
            fsPath: item?.fsPath || "",
            workName: item?.workName || "",
          });

          panel.webview.postMessage({ type: "saved" });
          return;
        }

        if (message?.type === "save") {
          const saved = await writeSettingsFile(target.path, {
            ...initial,
            ...message.payload,
            folderName: initial.folderName || item?.workName || "",
          });

          initial = saved;

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

          panel.webview.postMessage({ type: "saved" });
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
