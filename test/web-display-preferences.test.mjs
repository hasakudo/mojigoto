import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readWebFile = (name) => readFile(new URL(`../web/${name}`, import.meta.url), "utf8");

test("作品状態と構想メモのフォルダ・タグをチェック式で複数選択できる", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
    readWebFile("styles.css"),
  ]);
  assert.match(html, /id="workStatusFilter" class="multi-filter"/);
  assert.match(html, /id="conceptFolderFilter" class="multi-filter concept-folder-filter"/);
  assert.match(html, /id="conceptFolderFilterOptions" class="multi-filter-options"/);
  assert.match(html, /id="conceptTagFilterOptions" class="multi-filter-options"/);
  assert.match(html, /data-clear-multi="work"/);
  assert.match(app, /data-clear-multi="concept"/);
  assert.match(app, /clearFolders\.dataset\.clearMulti = "concept-folder-filter"/);
  assert.match(app, /statuses\.includes\(work\.status \|\| "unset"\)/);
  assert.match(app, /selectedFolders\.some\(\(folderId\) =>/);
  assert.match(app, /selectedTags\.some\(\(tag\) => \(memo\.tags \|\| \[\]\)\.includes\(tag\)\)/);
  assert.match(css, /\.multi-filter-options/);
  assert.match(css, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
});

test("Web構想メモで複数フォルダを崩れないチェックUIから選択できる", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
    readWebFile("styles.css"),
  ]);
  assert.match(html, /id="conceptMemoFolderSelect" class="multi-filter concept-folder-select"/);
  assert.match(html, /id="conceptMemoFolderOptions" class="multi-filter-options"/);
  assert.match(app, /function renderConceptMemoFolderOptions/);
  assert.match(app, /state\.currentConceptMemo\.folderIds = folderIds/);
  assert.match(app, /data-clear-multi="concept-folders"/);
  assert.match(css, /\.concept-editor \.concept-folder-select \.multi-filter-options input\[type="checkbox"\]/);
  assert.match(css, /overflow-x: hidden/);
});

test("Web作品設定で補助タイトルを編集でき、書き出し設定は非表示で保持する", async () => {
  const [html, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
  ]);
  assert.match(html, /<details class="work-export-options" hidden>/);
  assert.match(html, /id="workSubtitleInput"/);
  assert.match(html, /id="exportSubtitleInput"/);
  assert.match(app, /\["includeSubtitle", "exportSubtitleInput"\]/);
  assert.match(app, /\[elements\.workSubtitleInput, "subtitle"\]/);
});

test("表示テーマをシステム・ライト系・ダーク系から選び端末へ保存する", async () => {
  const [html, app, css, initializer, palettes] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
    readWebFile("styles.css"),
    readWebFile("theme-init.js"),
    readWebFile("theme-palettes.css"),
  ]);
  assert.match(html, /id="displayThemeSelect"/);
  assert.match(html, /value="system"/);
  assert.match(html, /value="light"/);
  assert.match(html, /value="dark"/);
  assert.match(html, /value="beige">ベージュ/);
  assert.match(html, /value="green">グリーン/);
  assert.match(html, /value="navy">ダークブルー/);
  assert.match(html, /value="deep-green">深緑/);
  assert.match(html, /theme-palettes\.css/);
  assert.match(app, /mojigoto\.web\.theme/);
  assert.match(app, /DARK_DISPLAY_THEMES/);
  assert.match(app, /prefers-color-scheme: dark/);
  assert.match(css, /data-color-scheme="dark"/);
  assert.match(css, /--nav-surface:/);
  assert.match(css, /background: var\(--nav-active\)/);
  assert.match(css, /--note-divider-bg:/);
  assert.match(initializer, /"navy", "deep-green"/);
  assert.match(initializer, /dataset\.colorScheme/);
  for (const theme of ["beige", "green", "navy", "deep-green"]) {
    assert.match(palettes, new RegExp(`data-theme="${theme}"`));
  }
  assert.match(palettes, /--paper: #efe7d8/);
  assert.match(palettes, /--paper: #e7efe4/);
  assert.match(palettes, /--paper: #071426/);
  assert.match(palettes, /--paper: #0d1c17/);
});

test("サイトと入力欄の文字サイズを端末ごとに変更できる", async () => {
  const [html, app, css] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.mjs"),
    readWebFile("styles.css"),
  ]);
  assert.match(html, /id="displayFontScaleSelect"/);
  assert.match(app, /mojigoto\.web\.fontScale/);
  assert.match(app, /function applyFontScale/);
  assert.match(css, /--ui-font-scale: 1/);
  assert.match(css, /font-size: calc\(16px \* var\(--ui-font-scale\)\)/);
});
