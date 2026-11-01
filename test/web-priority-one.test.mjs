import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWebFile = (name) => readFile(new URL(`../web/${name}`, import.meta.url), "utf8");

test("狭い画面ではヘッダー操作を開閉メニューにまとめる", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="headerMenuButton"[^>]+aria-controls="headerMenu"/);
  assert.match(html, /id="headerMenu" class="header-menu"/);
  assert.match(css, /\.header-menu-button \{ display: none;/);
  assert.match(css, /\.header-menu\.open \{ display: grid; \}/);
  assert.match(app, /elements\.headerMenuButton\.addEventListener\("click"/);
});

test("Google Driveのフォルダ未選択時は接続パネルを隠さない", async () => {
  const [css, app] = await Promise.all([readWebFile("styles.css"), readWebFile("app.mjs")]);
  assert.match(css, /\.connection-panel\.connected:not\(\.needs-folder-selection\)/);
  assert.match(app, /state\.cloudKind === "googleDrive" && !state\.workRoot\?\.id/);
  assert.match(app, /connectionPanel\.classList\.remove\("needs-folder-selection"\)/);
});

test("ログイン遷移と作品設定の読み込み状態を表示する", async () => {
  const [html, app] = await Promise.all([readWebFile("index.html"), readWebFile("app.mjs")]);
  assert.match(html, /id="authBootMessage"/);
  assert.match(html, /id="workSettingsLoading"[^>]+role="status"/);
  assert.match(app, /showLoginRedirectLoading\("Microsoft"\)/);
  assert.match(app, /showLoginRedirectLoading\("Google"\)/);
  assert.match(app, /workSettingsForm\.hidden = true/);
  assert.match(app, /workSettingsLoading\.hidden = false/);
});

test("ノート編集画面に専用の読み込み状態を表示する", async () => {
  const [html, css] = await Promise.all([readWebFile("index.html"), readWebFile("styles.css")]);
  assert.match(html, /id="noteEditorLoading"[^>]+role="status"/);
  assert.match(css, /#noteEditorSection\.is-loading/);
});

test("ノートと一覧の優先修正を反映する", async () => {
  const [css, app] = await Promise.all([readWebFile("styles.css"), readWebFile("app.mjs")]);
  assert.match(app, /relatedPanel\.open = relationList\.length <= 2/);
  assert.match(app, /\? "区" : "項"\}：\$\{tocLabel\}/);
  assert.match(css, /\.concept-memos-list \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /#noteEditorSection \{[^}]*overflow-x: hidden;/);
  assert.doesNotMatch(css, /content: "→"/);
});

test("原稿の呼び名一覧とノート一覧プレビューから編集を支援する", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="readerAddressBookButton"/);
  assert.match(html, /count-mode-details[\s\S]*id="readerAddressBookButton" class="reader-meta-button"/);
  assert.match(html, /id="notePreviewButton"/);
  assert.match(html, /class="note-view-tools"/);
  assert.match(html, /id="notePreviewDialog"/);
  assert.match(app, /function openNotePreview\(/);
  assert.match(app, /function moveToNotePreviewTarget\(groupIndex, itemIndex = null\)/);
  assert.match(app, /readerAddressBookButton\.addEventListener/);
  assert.match(css, /\.note-preview-item/);
  assert.doesNotMatch(css, /-webkit-line-clamp: 5/);
  assert.match(app, /appendPreviewLine\("項目詳細：", item\.body/);
});

test("Androidでノート名称欄を個人情報入力として扱わず、外部更新は未編集なら静かに反映する", async () => {
  const [app, css] = await Promise.all([readWebFile("app.mjs"), readWebFile("styles.css")]);
  assert.match(app, /const NOTE_NAME_FIELDS = new Set/);
  assert.match(app, /control\.autocomplete = "off"/);
  assert.match(app, /control\.setAttribute\("data-form-type", "other"\)/);
  const monitor = await readWebFile("lib/editor-external-update.mjs");
  assert.doesNotMatch(monitor, /notify\("OneDriveの外部更新を反映しました。"\)/);
  assert.match(css, /\.reader-status \{[^}]*white-space: nowrap;/);
});

test("VS Code同期で版情報だけが変わった場合はWebを再読み込みしない", async () => {
  const app = await readWebFile("lib/editor-external-update.mjs");
  assert.match(app, /hasSameExternalContent\(originalContent, remoteContent, contentKind\)/);
  const sameContentBranch = app.indexOf("if (hasSameExternalContent(originalContent, remoteContent, contentKind))");
  const dirtyConflictBranch = app.indexOf("if (state.dirty) {", sameContentBranch);
  assert.ok(sameContentBranch >= 0 && dirtyConflictBranch > sameContentBranch);
  assert.match(app, /const status = state\.dirty \? \["未保存", "dirty"\] : \["保存済み", ""\]/);
  assert.match(app, /state\.currentFile = refreshedTarget;[\s\S]*state\.originalContent = remoteContent/);
  assert.match(app, /state\.currentNote\.raw = remoteContent/);
  assert.match(app, /state\.conceptOriginalContent = remoteContent/);
  assert.match(app, /state\.currentSettings\.raw = remoteContent/);
});

test("保存と競合の案内に接続中のDrive名を表示する", async () => {
  const [html, app] = await Promise.all([readWebFile("index.html"), readWebFile("app.mjs")]);
  assert.match(html, /id="conflictCloudMessage"/);
  assert.match(app, /function cloudLabel\(kind = state\.cloudKind\)/);
  const manuscriptSave = await readWebFile("lib/manuscript-save.mjs");
  assert.match(manuscriptSave, /notify\(`\$\{cloudLabel\(\)\}へ保存しました。`\)/);
  assert.match(await readWebFile("lib/note-save.mjs"), /notify\(`ノートを\$\{cloudLabel\(\)\}へ保存しました。`\)/);
  assert.match(await readWebFile("lib/concept-save.mjs"), /notify\(`構想メモを\$\{cloudLabel\(\)\}へ保存しました。`\)/);
  assert.match(await readWebFile("lib/work-settings-persistence.mjs"), /notify\(`作品設定を\$\{cloudLabel\(\)\}へ保存しました。`\)/);
  assert.match(app, /notify\(`\$\{cloudLabel\(\)\}の最新版を読み込みました。`\)/);
  assert.match(app, /conflictCloudMessage\.textContent = `[^`]*\$\{label\}の最新版/);
});

test("原稿編集画面も詳細編集としてメインヘッダーを隠す", async () => {
  const [app, css] = await Promise.all([readWebFile("app.mjs"), readWebFile("styles.css")]);
  assert.match(app, /const detailEditor =[^;]*!elements\.readerSection\.hidden/);
  assert.match(await readWebFile("lib/view-navigation.mjs"), /function commitRoute\([^)]*\) \{\s*updateShellContext\(\);/);
  assert.match(css, /\.detail-editor-context \.topbar \{ display: none; \}/);
  assert.match(css, /\.detail-editor-context \.reader-section > \.reader-toolbar \{ top: var\(--safe-area-top\); \}/);
});

test("先頭・末尾ボタンが選択中のテーマ色へ追従する", async () => {
  const css = await readWebFile("styles.css");
  for (const selector of ["reader-jump-controls", "note-jump-controls", "concept-list-jump-controls"]) {
    assert.match(css, new RegExp(`\\.${selector} button \\{[^}]*background: var\\(--nav-active\\)`));
  }
  assert.doesNotMatch(css, /jump-controls button \{[^}]*background: rgb\(18 63 82/);
});

test("数え方ポップアップをボタン直下かつ画面内へ表示する", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="readerCountModeDetails" class="count-mode-details"/);
  assert.match(css, /\.count-mode-details \{[^}]*position: relative/);
  assert.match(css, /\.count-mode-control \{[^}]*position: absolute;[^}]*top: calc\(100% \+ 6px\);[^}]*left: 0;/);
  const layout = await readWebFile("lib/editor-popup-layout.mjs");
  assert.match(app, /createEditorPopupLayout\(\{ window, document, elements \}\)/);
  assert.match(layout, /function positionReaderCountModePopup\(\)/);
  assert.match(layout, /desiredLeft - anchorRect\.left/);
  assert.match(layout, /readerCountModeDetails\.addEventListener\("toggle"/);
});

test("大きい文字でもログイン見出しと原稿プレビュー設定を画面内へ収める", async () => {
  const [css, app] = await Promise.all([readWebFile("styles.css"), readWebFile("app.mjs")]);
  assert.match(css, /\.login-card h1 \{[^}]*font-size: clamp\(15px, 4\.5vw, 22px\);[^}]*white-space: nowrap/);
  const layout = await readWebFile("lib/editor-popup-layout.mjs");
  assert.match(layout, /function positionManuscriptPreviewControls\(\)/);
  assert.match(layout, /anchorRect\.right - popupWidth/);
  assert.match(layout, /readerPreviewLauncher\.addEventListener\("toggle"/);
});

test("構想メモの一覧と編集を開くとページ先頭へ移動する", async () => {
  const app = await readWebFile("app.mjs");
  assert.match(app, /function resetPageScroll\(\)/);
  assert.match(app, /if \(reveal && !state\.navigationRestoring\) resetPageScroll\(\)/);
  assert.match(app, /if \(resetScroll\) resetPageScroll\(\)/);
  assert.match(app, /backToConceptMemosButton[\s\S]*?resetPageScroll\(\)/);
});

test("編集画面のフッター付近からアプリ共通メニューを開く", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="editorFooterMenu" class="editor-footer-menu" hidden/);
  for (const action of ["announcements", "guide", "settings"]) {
    assert.match(html, new RegExp(`data-editor-footer-action="${action}"`));
  }
  assert.match(css, /\.editor-footer-menu > summary \{[^}]*min-height: 34px/);
  assert.match(app, /elements\.editorFooterMenu\.hidden = !inWork/);
  assert.match(app, /editorFooterMenu\.addEventListener\("click"/);
});

test("狭い編集画面で入力補助と自動保存を一つのメニューへまとめる", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.equal((html.match(/class="editor-options-toggle"/g) || []).length, 6);
  assert.match(html, /editor-options-panel[\s\S]*id="inputAssistToggle"[\s\S]*id="autoSaveToggle"/);
  assert.match(html, /editor-options-panel[\s\S]*id="noteInputAssistToggle"[\s\S]*id="noteAutoSaveToggle"/);
  assert.match(html, /editor-options-panel[\s\S]*id="conceptInputAssistToggle"[\s\S]*id="conceptAutoSaveToggle"/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.editor-options-toggle \{[^}]*display: grid/);
  assert.match(css, /@media \(max-width: 370px\)[\s\S]*\.reader-toolbar \{[^}]*flex-wrap: wrap/);
  assert.match(app, /function closeEditorOptions\(except = null\)/);
});

test("原稿編集中にノートを右側または開閉パネルで参照できる", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="readerNoteReferenceButton"/);
  assert.match(html, /id="readerNoteReferencePanel"/);
  assert.match(html, /id="readerNoteTypeSelect"/);
  assert.match(html, /id="readerNoteSelect"/);
  assert.match(app, /function toggleReaderNoteReference/);
  assert.match(app, /loadReaderNoteReferences/);
  assert.match(app, /function resetReaderNoteReference/);
  assert.match(app, /makeElement\("details", "note-preview-group reader-note-reference-group"\)/);
  assert.match(css, /\.reader-note-reference \{/);
  assert.match(css, /@media \(min-width: 840px\) and \(max-width: 1679px\)/);
  assert.match(css, /--reader-note-column: clamp\(380px, 30vw, 420px\)/);
  assert.match(css, /@media \(min-width: 1680px\)[\s\S]*\.reader-note-reference \{ width: 400px; \}/);
  assert.match(css, /\.reader-toolbar \{[^}]*z-index: 10/);
  assert.match(css, /margin-right: calc\(var\(--reader-note-column\) \+ 28px\)/);
  assert.match(css, /@media \(min-width: 1680px\)/);
  assert.match(css, /grid-auto-rows: max-content/);
  assert.doesNotMatch(css, /\.reader-note-reference \.note-preview-items \{[^}]*overflow-y: auto/);
  assert.match(app, /appendLine\("項目詳細：", item\.body, "未入力"\)/);
  assert.match(css, /#readerSection \.editor-options-panel \{ position: fixed;/);
  assert.match(css, /\.reader-note-reference-controls \{ grid-template-columns: minmax\(92px, \.72fr\) minmax\(0, 1\.28fr\)/);
  assert.match(css, /\.reader-note-reference \.note-preview-items \{ max-height: none; overflow-y: visible/);
  assert.match(app, /makeElement\("details", "note-preview-group note-preview-collapsible-group"\)/);
  assert.match(app, /inputAssistBar\.getBoundingClientRect\(\)\.top/);
  assert.match(css, /\.input-assist-visible \.note-preview-dialog \{ bottom: var\(--preview-assist-bottom/);
  assert.match(css, /input-assist-visible \.reader-note-reference/);
  assert.match(css, /\.count-mode-control select \{ width: 100%; max-width: 100%/);
  assert.doesNotMatch(css, /note-reference-open \.reader-content \{[^}]*translateX/);
  assert.match(html, /id="readerCountModeDetails" class="count-mode-details"/);
});

test("原稿一覧の現在階層へ新しいフォルダを作成する", async () => {
  const [html, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="newFolderButton"[^>]*>＋ 新規フォルダ</);
  assert.match(html, /id="newFolderDialog"/);
  assert.match(html, /id="newFolderNameInput"/);
  assert.match(app, /normalizeManuscriptFolderName/);
  assert.match(app, /state\.provider\.createFolder\(parent, folderName\)/);
  assert.match(app, /openManuscriptFolder\(created, \[\.\.\.trail, created\]\)/);
});

test("原稿ファイルを原稿ルートまたは別の章フォルダへ移動する", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="moveFileDialog"/);
  assert.match(html, /id="moveFileDestinations"/);
  assert.match(css, /\.file-row-with-actions/);
  assert.match(css, /\.move-destination-button/);
  assert.match(app, /function makeManuscriptRow\(item, onOpen\)/);
  assert.match(app, /async function collectManuscriptMoveDestinations\(\)/);
  assert.match(app, /state\.provider\.moveItem\(context\.file, destination\)/);
  assert.match(app, /移動先に同じ名前のファイルまたはフォルダがあります/);
});

test("原稿だけが下位階層にある章フォルダを一覧から一度で開く", async () => {
  const [css, app] = await Promise.all([
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(app, /item\.manuscriptShortcutFolders = children\.filter\(\(child\) => child\.folder\)/);
  assert.match(app, /const targetTrail = shortcutFolder \? \[\.\.\.trail, item, shortcutFolder\]/);
  assert.match(app, /shortcut\.addEventListener\("click", \(\) => onOpen\(folder\)\)/);
  assert.match(css, /\.manuscript-folder-shortcuts \{/);
  assert.match(css, /\.manuscript-folder-shortcut \{[^}]*font-size: \.72rem/);
  assert.match(css, /\.folder-row-with-shortcuts:hover > \.manuscript-folder-shortcuts \{[^}]*background: var\(--hover-surface\)/);
});

test("二重になった原稿フォルダを表示し、ユーザーへ修正方法を通知する", async () => {
  const [css, app] = await Promise.all([
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(app, /nestedManuscriptWarnings: new Set\(\)/);
  assert.match(app, /item\.nestedManuscriptWarning = true/);
  assert.match(app, /原稿フォルダが二重になっています/);
  assert.match(app, /内側の原稿を外側の原稿フォルダへ移動し、空になった内側のフォルダを削除してください/);
  assert.match(css, /\.folder-row\.nested-manuscript-folder/);
});

test("狭いノート編集画面の補助チップを一行ヘッダー直下へ配置する", async () => {
  const [css, app] = await Promise.all([
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.note-view-tools \{ top: calc\(var\(--safe-area-top\) \+ 54px\)/);
  assert.match(css, /\.current-note-group-indicator \{ top: calc\(var\(--safe-area-top\) \+ 54px\);[^}]*max-width: 10\.5em/);
  assert.match(css, /\.note-toc \{ top: calc\(var\(--safe-area-top\) \+ 94px\)/);
  assert.match(app, /function compactNoteGroupTitle\(value, maxLength = 9\)/);
  assert.match(app, /window\.innerWidth <= 370 \? 150 : window\.innerWidth <= 600 \? 100 : 166/);
  assert.match(app, /currentNoteGroupIndicator\.textContent = compactNoteGroupTitle\(title\)/);
  assert.match(css, /@media \(max-width: 370px\)[\s\S]*\.note-view-tools \{ top: calc\(var\(--safe-area-top\) \+ 98px\); right: max\(10px, var\(--safe-area-right\)\); left: auto;/);
  assert.match(css, /\.current-note-group-indicator \{ top: calc\(var\(--safe-area-top\) \+ 98px\); right: auto; left: max\(10px, var\(--safe-area-left\)\)/);
  assert.doesNotMatch(css, /#noteEditorSection > \.reader-toolbar \{ padding-bottom: 48px; \}/);
});

test("ノートの区分と項目を上下移動し狭い画面では操作を折りたたむ", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(app, /"move-item-up"/);
  assert.match(app, /"move-item-down"/);
  assert.match(app, /moveNoteItem\(group\.items, itemIndex, itemIndex - 1\)/);
  assert.match(app, /moveNoteItem\(group\.items, itemIndex, itemIndex \+ 1\)/);
  assert.match(app, /makeElement\("div", "note-item-order-move"\)/);
  assert.match(app, /moveNoteItemToGroup\(state\.currentNote\.data\.groups, groupIndex, itemIndex, targetGroupIndex\)/);
  assert.match(app, /makeElement\("div", "note-item-group-move"\)/);
  assert.match(css, /\.note-item-actions-toggle \{ display: none/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.note-item-actions-toggle \{ display: inline-flex/);
  assert.match(css, /\.note-item-footer\.open \.note-item-actions-panel \{ display: grid/);
  assert.match(css, /\.note-item-group-move \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.note-item-order-move \{[^}]*width: 100%;[^}]*grid-column: 1 \/ -1/);
  assert.match(app, /insertGroup.dataset.noteAction = "insert-group-after"/);
  assert.match(app, /function updateNoteGroupMoveLabels\(groupIndex\)/);
  assert.match(app, /option\.textContent = label/);
  assert.match(app, /if \(group\) insertNoteGroup\(groupIndex \+ 1\)/);
});

test("作品内の移動ボタンとスマホ用操作パネルを適切な幅で表示する", async () => {
  const css = await readWebFile("styles.css");
  assert.match(css, /\.concept-list-jump-controls, \.note-jump-controls \{[^}]*position: fixed;[^}]*display: grid/);
  assert.match(css, /\.input-assist-visible \.note-jump-controls \{[^}]*bottom: max\(66px/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.note-item-footer \{[^}]*width: 100%;[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.note-item-actions-toggle \{[^}]*justify-self: end/);
  assert.match(css, /\.note-item-actions-panel \{[^}]*width: 100%;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("Web仕上げの表示・入力支援・お知らせを反映する", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.doesNotMatch(html, /続きを、どこからでも/);
  assert.match(html, /value="preparing">準備中/);
  assert.match(html, /data-assist-kind="ruby"/);
  assert.match(html, /data-assist-kind="emphasis"/);
  assert.match(html, /id="announcementButton"/);
  assert.match(html, /icon-bullhorn/);
  assert.match(app, /ログインを確認しています/);
  assert.match(app, /window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/);
  assert.match(css, /--notice-bg: #153845/);
  assert.match(css, /\.note-preview-line > strong/);
});

test("読み込み・入力補助・編集一覧の仕上げを反映する", async () => {
  const [html, css, app, serviceWorker] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
    readWebFile("sw.js"),
  ]);
  assert.match(css, /\.spinner \{[^}]*data:image\/svg\+xml;base64,/);
  assert.match(css, /\.icon-space \{ --icon: url\("data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(css, /url\(["']?\.\/icons\//);
  assert.doesNotMatch(serviceWorker, /icons\/bullhorn\.svg/);
  assert.match(html, /data-assist-kind="unwrap"/);
  assert.match(html, /id="readerListButton"/);
  assert.match(html, /id="noteListButton"/);
  assert.match(html, /id="conceptListButton"/);
  assert.match(html, /id="editorListDialog"/);
  assert.match(app, /async function openEditorList\(kind\)/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /\.work-context \.topbar \{ display: none; \}/);
  assert.match(css, /\.address-book-table tr > th:first-child/);
});

test("お知らせの既読管理と原稿画面の表示修正を反映する", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /id="announcementBadge"/);
  assert.match(html, /id="markAllAnnouncementsReadButton"/);
  assert.match(app, /mojigoto\.announcements\.read\.v1/);
  assert.match(app, /function markAnnouncementRead/);
  assert.match(app, /showLoading\(elements\.filesList, "原稿を読み込んでいます…"\)/);
  assert.match(css, /\.announcement-badge/);
  assert.match(css, /\.work-context \.reader-toolbar \{ top: calc\(var\(--safe-area-top\) \+ var\(--work-nav-height\) \+ 8px\); \}/);
  assert.match(css, /min-height: 72dvh/);
});

test("環境情報コピー・タグ履歴・関連ノート高速表示を備える", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"), readWebFile("app.mjs"), readWebFile("styles.css"),
  ]);
  assert.match(html, /id="copyEnvironmentButton"/);
  assert.match(html, /id="tagHistoryDialog"/);
  assert.match(app, /利用者ID:/);
  assert.match(app, /TAG_HISTORY_KEY/);
  assert.match(app, /preferCache/);
  assert.match(css, /@media \(max-width: 370px\)/);
  assert.match(css, /tag-history-list/);
});

test("原稿を横書きと文字数指定付き縦書きでプレビューする", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"), readWebFile("app.mjs"), readWebFile("styles.css"),
  ]);
  assert.match(html, /id="readerAddressBookButton"[\s\S]*id="readerPreviewButton"/);
  assert.match(html, /id="manuscriptPreviewMode"/);
  assert.match(html, /id="manuscriptPreviewFontSize"/);
  assert.match(html, /id="readerPreviewLauncher"[\s\S]*id="readerPreviewButton"[\s\S]*id="readerWholeManuscriptButton"[\s\S]*id="readerPreviewSettings"[\s\S]*id="manuscriptPreviewMode"/);
  assert.match(html, /id="manuscriptPreviewLineCharacters"[^>]*min="10"[^>]*max="40"/);
  assert.match(html, /収まらない場合は文字を縮小します。/);
  assert.match(app, /parseManuscriptPreview\(elements\.readerContent\.value\)/);
  assert.match(app, /if \(elements\.manuscriptPreviewDialog\.open\) renderManuscriptPreview\(\)/);
  assert.match(css, /\.manuscript-preview-paper\.vertical \{[^}]*writing-mode: vertical-rl/);
  assert.match(css, /\.manuscript-preview-content\.vertical \{[^}]*overflow-y: hidden;[^}]*direction: rtl/);
  assert.match(css, /height: min\(100%, var\(--preview-paper-height\)\)/);
  assert.match(css, /\.manuscript-preview-emphasis \{[^}]*text-emphasis: filled sesame/);
  assert.match(app, /manuscriptPreviewContent\.scrollLeft -= movement/);
});

test("スマホ原稿入力補助の配置・記号サブメニュー・縦書き自動調整を備える", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"), readWebFile("app.mjs"), readWebFile("styles.css"),
  ]);
  assert.match(html, /id="inputAssistSymbolsButton"/);
  assert.match(html, /id="inputAssistSymbolsMenu"[^>]+hidden/);
  for (const marker of ["# ", "## ", "### "]) {
    assert.match(html, new RegExp(`data-assist-text="${marker}"`));
  }
  assert.match(html, /data-assist-open="【" data-assist-close="】"/);
  assert.match(html, /data-assist-open="〝" data-assist-close="〟"/);
  assert.match(html, /id="manuscriptPreviewAutoFit"/);
  assert.match(html, /id="manuscriptPreviewLineHeight"/);
  assert.match(app, /manuscriptPreviewAutoFit/);
  assert.match(app, /const fontSize = state\.manuscriptPreviewFontSize/);
  assert.match(app, /content\.clientHeight - 8/);
  assert.match(app, /availableTextHeight \/ state\.manuscriptPreviewLineCharacters/);
  assert.match(app, /Math\.min\(state\.manuscriptPreviewFontSize, fittedFontSize\)/);
  assert.match(app, /inputAssistSymbolsMenu\.hidden = !open/);
  assert.match(app, /--preview-line-height/);
  assert.match(css, /\.manuscript-editor-context\.input-assist-visible \.input-assist \{ top: auto; bottom:/);
  assert.match(css, /\.keyboard-visible\.manuscript-editor-context\.input-assist-visible \.input-assist/);
  assert.match(css, /\.keyboard-visible\.manuscript-editor-context\.input-assist-visible \.input-assist \{ bottom: var\(--keyboard-inset, 0px\); \}/);
  assert.match(app, /function updateInputAssistViewport\(\)/);
  assert.match(app, /function trackInputAssistViewport\(duration = 800\)/);
  assert.match(app, /document\.addEventListener\("focusin", \(\) => trackInputAssistViewport\(1000\)\)/);
  assert.match(app, /window\.visualViewport\?\.addEventListener\("resize", \(\) => trackInputAssistViewport\(\)/);
  assert.match(css, /\.input-assist > button:last-child \{ margin-right: auto; \}/);
  assert.match(css, /\.assist-more-menu\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.assist-symbols-button:focus[^}]*outline: 0/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.account-session-panel \{[^}]*flex-direction: column/);
  assert.match(css, /\.account-session-panel > div:first-child \{[^}]*flex: 1 1 auto/);
  assert.match(css, /line-height: var\(--preview-line-height, 1\.9\)/);
  assert.match(app, /--preview-paragraph-gap", "0em"/);
  assert.match(css, /\.manuscript-preview-paper p \{ margin: 0;/);
  assert.match(css, /\.manuscript-preview-paper\.vertical p \{[^}]*var\(--preview-paragraph-gap/);
  assert.match(html, /id="readerJumpControls" class="reader-jump-controls"/);
  assert.match(app, /readerJumpControls\.classList\.toggle\("is-scrolling"/);
  assert.match(css, /\.reader-jump-controls\.is-scrolling/);
});

test("Webの原稿アイコンとブランドロゴを埋め込み、テーマ色へ追従させる", async () => {
  const [html, css, serviceWorker, penSvg] = await Promise.all([
    readWebFile("index.html"), readWebFile("styles.css"), readWebFile("sw.js"),
    readWebFile("icons/pen2.svg"),
  ]);
  const penDataUrl = `data:image/svg+xml;base64,${Buffer.from(penSvg).toString("base64")}`;
  const logos = [...html.matchAll(/class="brand-mark" aria-hidden="true">(<svg\b[\s\S]*?<\/svg>)<\/span>/g)];
  assert.equal(logos.length, 2, "ログイン画面とアプリの両方にロゴを配置する");
  for (const [, svg] of logos) {
    assert.match(svg, /viewBox="0 0 32 32"/);
    assert.equal((svg.match(/<path\b/g) || []).length, 2);
    assert.doesNotMatch(svg, /<image\b|<script\b/);
  }
  assert.doesNotMatch(html, /class="brand-mark">も<\/span>/);
  assert.match(css, /\.brand-mark svg > path:first-child\s*\{[^}]*fill: var\(--green\);/);
  assert.match(css, /\.brand-mark svg > path:last-child\s*\{[^}]*fill: var\(--nav-active-text\);/);
  assert.ok(css.includes(`.icon-pen { --icon: url("${penDataUrl}"); }`));
  assert.doesNotMatch(serviceWorker, /"\.\/logo\.svg"/);
  assert.doesNotMatch(serviceWorker, /"\.\/icons\/pen2\.svg"/);
});


