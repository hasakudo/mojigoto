import assert from "node:assert/strict";
import test from "node:test";
import { environmentContext } from "../web/lib/environment-context.mjs";

test("同じURLでも一覧・編集・資料とプロットを区別する", () => {
  for (const [id, noteType, label] of [["worksSection", "", "作品一覧"], ["filesSection", "", "原稿一覧"], ["readerSection", "", "原稿編集"], ["notesSection", "reference", "資料一覧"], ["noteEditorSection", "plot", "プロット編集"], ["conceptMemoEditorSection", "", "構想メモ編集"]]) {
    assert.equal(environmentContext({ visibleSections: [id], noteType })[0], `表示画面: ${label}`);
  }
});

test("接続設定を開いても元の編集画面と未保存状態を保持する", () => {
  const result = environmentContext({ visibleSections: ["readerSection"], openDialogs: ["settingsDialog"], dirty: true });
  assert.deepEqual(result, ["表示画面: 原稿編集", "表示状態: 編集中（未保存の変更あり）", "開いている操作画面: 接続設定"]);
});

test("プレビュー状態を報告し、作品名・本文・未知の識別子を出力しない", () => {
  const result = environmentContext({ visibleSections: ["readerSection"], openDialogs: ["manuscriptPreviewDialog", "秘密のファイル名"], manuscriptPreviewMode: "vertical", title: "秘密の作品名", content: "秘密の本文" }).join("\n");
  assert.match(result, /原稿プレビュー（縦書き）/);
  assert.doesNotMatch(result, /秘密/);
});
