import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGenres, normalizeWorkSettings } from "../web/lib/work-settings.mjs";

test("作品設定の未知項目と書き出し設定を保持して正規化する", () => {
  const settings = normalizeWorkSettings({
    title: "作品",
    subtitle: "シリーズ名",
    genre: "恋愛、 ミステリー, 恋愛",
    custom: { keep: true },
    exportOptions: { includeGenre: false, customExport: 1 },
  }, "folder");
  assert.deepEqual(settings.genres, ["恋愛", "ミステリー"]);
  assert.deepEqual(settings.custom, { keep: true });
  assert.equal(settings.subtitle, "シリーズ名");
  assert.equal(settings.exportOptions.includeSubtitle, true);
  assert.equal(settings.exportOptions.includeGenre, false);
  assert.equal(settings.exportOptions.customExport, 1);
  assert.match(settings.workId, /^work-/);
});

test("補助タイトルの書き出し設定をOFFのまま保持する", () => {
  const settings = normalizeWorkSettings({
    title: "作品",
    subtitle: "副題",
    exportOptions: { includeSubtitle: false },
  });
  assert.equal(settings.subtitle, "副題");
  assert.equal(settings.exportOptions.includeSubtitle, false);
});

test("ジャンル配列を空項目と重複なしにする", () => {
  assert.deepEqual(normalizeGenres(["SF", "", "sf", "歴史"]), ["SF", "歴史"]);
});
