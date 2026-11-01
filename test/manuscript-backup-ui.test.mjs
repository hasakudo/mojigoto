import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import conceptEditor from "../src/views/concept-memo/script-editor.js";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("VS Codeで原稿バックアップを作成・比較・復元できる", async () => {
  const [extension, commands, manifest] = await Promise.all([
    read("extension.js"), read("src/backup/manuscript-backup.js"), read("package.json"),
  ]);
  assert.match(extension, /registerManuscriptBackupCommands\(context\)/);
  assert.match(manifest, /mojigoto\.createManuscriptBackup/);
  assert.match(manifest, /mojigoto\.openManuscriptBackupHistory/);
  assert.match(commands, /"vscode\.diff"/);
  assert.match(commands, /createManuscriptBackup\(context\.document, "before-restore"\)/);
  assert.match(commands, /context\.document\.save\(\)/);
  assert.match(commands, /onDidSaveTextDocument/);
  assert.match(commands, /maybeCreateAutomaticBackup/);
  assert.match(commands, /履歴の保護を解除/);
  assert.match(commands, /fs\.realpathSync/);
  assert.match(commands, /migrateLegacyBackups/);
  assert.match(commands, /legacyBackupRoot/);
  assert.match(commands, /findMovedBackupSourcePath/);
  assert.match(commands, /migrateMovedManuscriptHistory/);
  assert.match(commands, /entry\.contentHash === currentHash/);
  assert.match(commands, /migrateManuscriptBackupsForMove/);
  assert.match(await read("src/backup/backup-settings.js"), /backupIntervalMinutes/);
  assert.match(commands, /rebuildBackupIndexFromSnapshots/);
  assert.match(commands, /このバックアップを復元/);
  assert.match(commands, /比較を閉じる/);
  assert.match(commands, /tabGroups\.close\(comparisonTab\)/);
  assert.match(commands, /createBackupContentUri/);
  assert.doesNotMatch(commands, /openTextDocument\(\{ content:/);
  assert.match(manifest, /mojigoto\.backupIntervalMinutes/);
});

test("原稿の名前変更・移動時にバックアップ履歴のパスも引き継ぐ", async () => {
  const commands = await read("src/tree/work-tree-commands.js");
  assert.match(commands, /require\("\.\.\/backup\/manuscript-backup"\)/);
  const rename = await read("src/tree/work-tree-rename-actions.js");
  const move = await read("src/tree/work-tree-move-actions.js");
  assert.match(commands, /createWorkTreeRenameActions\(\{[\s\S]*?migrateManuscriptBackupPath/);
  assert.match(commands, /createWorkTreeMoveActions\(\{[\s\S]*?migrateManuscriptBackupPath/);
  assert.match(rename, /await migrateManuscriptBackupPath\(oldPath, newPath\)/);
  assert.match(move, /await migrateManuscriptBackupPath\(oldPath, newPath\)/);
  assert.match(commands, /バックアップ履歴の保存先更新に失敗しました/);
});

test("VS Codeでノートと構想メモの履歴を作成・比較・復元できる", async () => {
  const [backup, note, noteEvents, concept, conceptHtml, conceptScript] = await Promise.all([
    read("src/backup/structured-data-backup.js"),
    read("src/views/note-webview.js"),
    read("src/views/note-webview/script-events.js"),
    read("src/views/concept-memo-webview.js"),
    read("src/views/concept-memo/concept-memo-html.js"),
    conceptEditor.getConceptMemoEditorScript(),
  ]);
  assert.match(backup, /targetType: context\.targetType/);
  assert.match(backup, /"vscode\.diff"/);
  assert.match(backup, /reason: "before-restore"/);
  assert.match(backup, /snapshot\.protected = protectedValue/);
  assert.match(backup, /このバックアップを復元/);
  assert.match(backup, /比較を閉じる/);
  assert.match(backup, /createBackupContentUri/);
  assert.doesNotMatch(backup, /openTextDocument\(\{ content:/);
  assert.match(await read("src/views/note-webview/editor-view.js"), /id="noteBackupBtn"/);
  assert.match(await read("src/views/note-webview/host-actions.js"), /targetType: "note"/);
  assert.match(noteEvents, /openNoteBackupHistory/);
  assert.match(conceptHtml, /id="conceptMemoBackupButton"/);
  assert.match(concept, /targetType: "conceptMemo"/);
  assert.match(conceptScript, /openConceptMemoBackupHistory/);
});

test("Webで原稿バックアップを履歴表示・比較・安全に復元できる", async () => {
  const [html, app, css, worker] = await Promise.all([
    read("web/index.html"), read("web/app.mjs"), read("web/styles.css"), read("web/sw.js"),
  ]);
  assert.match(html, /id="readerBackupButton"/);
  assert.match(html, /id="manuscriptBackupDialog"/);
  assert.match(html, /id="manuscriptBackupComparison"/);
  assert.match(await read("web/lib/backup-creation.mjs"), /async function createWebManuscriptBackup/);
  assert.match(await read("web/lib/backup-restore.mjs"), /createWebManuscriptBackup\("before-restore", target.content, target\)/);
  assert.match(await read("web/lib/backup-restore.mjs"), /provider\.writeText\(target\.item, restoredContent, target\.item\.eTag\)/);
  const manuscriptSave = await read("web/lib/manuscript-save.mjs");
  assert.match(manuscriptSave, /maybeCreateWebAutomaticBackup\(snapshot\)/);
  assert.match(app, /setWebBackupProtection/);
  assert.match(await read("web/lib/backup-comparison-controller.mjs"), /createBackupComparisonRows\(String\(snapshot.content \|\| ""\), target.content, target.targetType\)/);
  assert.match(html, /id="backupDiffNextButton"/);
  assert.match(html, /id="backupComparisonCurrentTitle"/);
  assert.match(html, /id="restoreComparedBackupButton"[^>]*>このバックアップを復元</);
  assert.match(html, /id="cancelComparedBackupButton"[^>]*>キャンセル</);
  assert.match(html, /id="backupIntervalSelect"/);
  assert.match(html, /<option value="5">5分<\/option>/);
  assert.match(html, /id="noteBackupButton"/);
  assert.match(html, /id="conceptMemoBackupButton"/);
  assert.match(html, /対象は\s*現在開いている原稿、ノート、または\s*作品の構想メモ\s*です/);
  assert.match(app, /targetType: "note"/);
  assert.match(app, /targetType: "conceptMemo"/);
  assert.match(app, /rebuildWebBackupIndexFromSnapshots/);
  assert.match(app, /manuscriptBackupComparisonEntry/);
  assert.match(app, /比較するバックアップを読み込んでいます/);
  assert.match(app, /履歴の保護状態を更新しています/);
  assert.match(await read("web/lib/backup-restore.mjs"), /復元するバックアップを読み込んでいます/);
  assert.match(app, /button\.dataset\.busy !== "true"/);
  assert.match(await read("web/lib/backup-comparison-controller.mjs"), /elements\.manuscriptBackupList\.hidden = true/);
  assert.doesNotMatch(html, /<option value="120">2時間<\/option>/);
  assert.match(app, /BACKUP_INTERVAL_KEY/);
  assert.match(css, /\.manuscript-backup-diff/);
  assert.match(css, /white-space:\s*nowrap/);
  const previewZIndex = Number(css.match(/\.reader-preview-launcher\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
  const navigationZIndex = Number(css.match(/\.global-work-nav\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
  assert.ok(previewZIndex > 0 && previewZIndex < navigationZIndex, "プレビュー設定は本文の上、ナビゲーションの下に表示する");
  assert.match(worker, /lib\/backup-format\.mjs/);
  assert.match(worker, /lib\/text-diff\.mjs/);
});
