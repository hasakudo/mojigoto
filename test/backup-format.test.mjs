import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import * as webFormat from "../web/lib/backup-format.mjs";

const require = createRequire(import.meta.url);
const vscodeFormat = require("../src/backup/backup-format.js");

test("取込上書き前のバックアップ種別をWebとVS Codeで維持する", () => {
  const args = { id: "import-backup", targetType: "note", relativePath: "plots/note.json", fileName: "note.json", createdAt: "2026-10-17T00:00:00.000Z", source: "web", reason: "before-import", content: '{"groups":[]}' };
  for (const writer of [webFormat, vscodeFormat]) for (const reader of [webFormat, vscodeFormat]) {
    const snapshot = writer.createBackupSnapshot(args);
    assert.equal(snapshot.reason, "before-import");
    assert.equal(reader.normalizeBackupIndex({ snapshots: [writer.backupIndexEntry(snapshot)] }).snapshots[0].reason, "before-import");
  }
});

test("ノートの件数は本文・JSONの長さと独立し、区分と項目を分ける", () => {
  const content = JSON.stringify({ groups: [
    { items: [{ kind: "divider", value: "補足" }, { kind: "entry", body: "長い本文".repeat(100), memo: { body: "項目メモ" } }] },
    { items: [{ kind: "entry" }] }, { items: [] },
  ] });
  for (const format of [webFormat, vscodeFormat]) {
    const summary = format.summarizeBackupContent(content, "note");
    assert.deepEqual(summary, { groups: 3, dividers: 1, items: 2 });
    assert.equal(format.backupContentLabel({ targetType: "note", contentSummary: summary, characters: content.length }), "大分類 3・区分 1・項目 2");
    assert.deepEqual(format.summarizeBackupContent('{"sections":[{},{}]}', "note"), { groups: 1, dividers: 0, items: 2 });
    assert.deepEqual(format.summarizeBackupContent('{"groups":[]}', "note"), { groups: 0, dividers: 0, items: 0 });
  }
});

test("構想メモはフォルダや本文内のリストではなく保管済みを含む全メモを数える", () => {
  const content = JSON.stringify({ folders: [{}, {}], commonTodoItems: [{}], memos: [
    { type: "text", body: "本文" }, { type: "list", listItems: [{}, {}, {}] }, { type: "todo", isArchived: true },
  ] });
  for (const format of [webFormat, vscodeFormat]) {
    const summary = format.summarizeBackupContent(content, "conceptMemo");
    assert.deepEqual(summary, { memos: 3 });
    assert.equal(format.backupContentLabel({ targetType: "conceptMemo", contentSummary: summary }), "作品全体のメモ 3件");
    assert.deepEqual(format.summarizeBackupContent('\uFEFF{"memos":[]}', "conceptMemo"), { memos: 0 });
  }
});

test("新しい件数は両実装の索引の読込・保護更新・保持整理・再構築を往復する", async () => {
  const args = { id: "note-counts", targetType: "note", relativePath: "plots/test.json", fileName: "test.json",
    createdAt: "2026-10-16T00:00:00.000Z", source: "web", reason: "manual", content: '{"groups":[{"items":[{"kind":"divider"},{}]}]}' };
  const snapshot = webFormat.createBackupSnapshot(args);
  assert.deepEqual(snapshot, vscodeFormat.createBackupSnapshot(args));
  const expected = { groups: 1, dividers: 1, items: 1 };
  for (const writer of [webFormat, vscodeFormat]) for (const reader of [webFormat, vscodeFormat]) {
    const entry = writer.backupIndexEntry(snapshot);
    const index = reader.normalizeBackupIndex({ snapshots: [{ ...entry, protected: true }] });
    assert.deepEqual(index.snapshots[0].contentSummary, expected);
    assert.deepEqual(reader.planBackupRetention(index).index.snapshots[0].contentSummary, expected);
    const rebuilt = await reader.rebuildBackupIndex([{ ...snapshot, contentSummary: { groups: 999, dividers: 999, items: 999 } }]);
    assert.deepEqual(rebuilt.snapshots[0].contentSummary, expected);
  }
});

test("古い索引と不正な件数を0件やJSON文字数として表示しない", () => {
  for (const format of [webFormat, vscodeFormat]) {
    for (const targetType of ["note", "conceptMemo"]) {
      assert.match(format.backupContentLabel({ targetType, characters: 9999 }), /件数未記録/);
      for (const value of [null, {}, { groups: -1, dividers: 1, items: 1 }, { memos: "1" }, { memos: Infinity }]) {
        assert.equal(format.normalizeBackupSummary(value, targetType), null);
      }
      for (const content of ["bad json", "[]", "null", "{}", '{"groups":"bad","memos":"bad"}']) {
        assert.equal(format.summarizeBackupContent(content, targetType), null);
      }
    }
    assert.equal(format.backupContentLabel({ targetType: "manuscript", characters: 1234 }), "1,234文字");
    assert.equal(format.summarizeBackupContent("原稿", "manuscript"), null);
    const old = format.normalizeBackupIndex({ snapshots: [{ id: "old", targetType: "note", relativePath: "plots/test.json", snapshotFile: "old.json", characters: 9999 }] });
    assert.equal(old.snapshots[0].characters, 9999);
    assert.equal(Object.hasOwn(old.snapshots[0], "contentSummary"), false);
  }
});

test("VS CodeとWebで同じ原稿バックアップ形式を生成する", async () => {
  const content = "# 第一章\n\n本文です。";
  const createdAt = "2026-09-23T12:34:56.789Z";
  const webHash = await webFormat.hashBackupContent(content);
  const vscodeHash = vscodeFormat.hashBackupContent(content);
  assert.equal(webHash, vscodeHash);
  const args = {
    id: "20260923123456789-test",
    relativePath: "第一章\\01.txt",
    fileName: "01.txt",
    createdAt,
    source: "web",
    reason: "manual",
    content,
    contentHash: webHash,
  };
  assert.deepEqual(webFormat.createBackupSnapshot(args), vscodeFormat.createBackupSnapshot(args));
  assert.deepEqual(
    webFormat.backupIndexEntry(webFormat.createBackupSnapshot(args)),
    vscodeFormat.backupIndexEntry(vscodeFormat.createBackupSnapshot(args)),
  );
});

test("壊れたバックアップ索引から有効な原稿履歴だけを読み込む", () => {
  const value = {
    snapshots: [
      { id: "ok", relativePath: "章/01.txt", snapshotFile: "ok.json", source: "vscode", reason: "before-restore" },
      { id: "missing-path", snapshotFile: "bad.json" },
    ],
  };
  const normalized = webFormat.normalizeBackupIndex(value);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.snapshots.length, 1);
  assert.equal(normalized.snapshots[0].source, "vscode");
  assert.equal(normalized.snapshots[0].reason, "before-restore");
});

test("スナップショット本体から原稿・ノート・構想メモの索引を再構築する", async () => {
  const snapshots = [
    { id: "manuscript", targetType: "manuscript", relativePath: "第一章/01.txt", fileName: "01.txt", createdAt: "2026-09-23T10:00:00.000Z", source: "vscode", reason: "manual", content: "本文" },
    { id: "note", targetType: "note", relativePath: "plots/人物.json", fileName: "人物.json", createdAt: "2026-09-23T11:00:00.000Z", source: "web", reason: "automatic", content: "{}" },
    { id: "concept", targetType: "conceptMemo", relativePath: "concept-memos.json", fileName: "concept-memos.json", createdAt: "2026-09-23T12:00:00.000Z", source: "web", reason: "automatic", protected: true, content: "{}" },
    { targetType: "note", relativePath: "plots/破損.json", createdAt: "2026-09-23T13:00:00.000Z", content: "{}" },
  ];
  const webIndex = await webFormat.rebuildBackupIndex(snapshots, "2026-09-24T00:00:00.000Z");
  const vscodeIndex = vscodeFormat.rebuildBackupIndex(snapshots, "2026-09-24T00:00:00.000Z");
  assert.deepEqual(webIndex, vscodeIndex);
  assert.deepEqual(webIndex.snapshots.map((entry) => entry.targetType), ["conceptMemo", "note", "manuscript"]);
  assert.equal(webIndex.snapshots[0].protected, true);
  assert.match(webIndex.snapshots[1].contentHash, /^[a-f0-9]{64}$/);
});

test("保持件数は対象種類と相対パスの組み合わせごとに数える", () => {
  const snapshots = [
    { id: "manuscript", targetType: "manuscript", relativePath: "same.json", snapshotFile: "manuscript.json", createdAt: "2026-09-23T12:00:00.000Z", source: "vscode", reason: "manual" },
    { id: "note", targetType: "note", relativePath: "same.json", snapshotFile: "note.json", createdAt: "2026-09-23T11:00:00.000Z", source: "vscode", reason: "manual" },
  ];
  const result = vscodeFormat.planBackupRetention({ snapshots }, { maxPerFile: 1 });
  assert.deepEqual(result.index.snapshots.map((entry) => entry.id), ["manuscript", "note"]);
});

test("自動バックアップの期限・件数を整理し、保護履歴は残す", () => {
  const snapshots = [
    { id: "protected", relativePath: "01.txt", snapshotFile: "protected.json", createdAt: "2025-01-01T00:00:00.000Z", source: "vscode", reason: "automatic", protected: true },
    { id: "expired", relativePath: "01.txt", snapshotFile: "expired.json", createdAt: "2025-01-02T00:00:00.000Z", source: "vscode", reason: "automatic" },
    { id: "new", relativePath: "01.txt", snapshotFile: "new.json", createdAt: "2026-09-20T00:00:00.000Z", source: "vscode", reason: "automatic" },
    { id: "manual", relativePath: "01.txt", snapshotFile: "manual.json", createdAt: "2025-01-03T00:00:00.000Z", source: "vscode", reason: "manual" },
  ];
  const options = { now: Date.parse("2026-09-23T00:00:00.000Z"), retentionDays: 90, maxPerFile: 1 };
  const webPlan = webFormat.planBackupRetention({ snapshots }, options);
  const vscodePlan = vscodeFormat.planBackupRetention({ snapshots }, options);
  assert.deepEqual(webPlan, vscodePlan);
  assert.deepEqual(webPlan.index.snapshots.map((entry) => entry.id), ["new", "protected"]);
  assert.deepEqual(webPlan.removed.map((entry) => entry.id).sort(), ["expired", "manual"]);
});
