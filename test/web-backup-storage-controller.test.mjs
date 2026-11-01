import assert from "node:assert/strict";
import test from "node:test";
import { createBackupStorage } from "../web/lib/backup-storage.mjs";
import { createBackupSnapshot, backupIndexEntry, hashBackupContent } from "../web/lib/backup-format.mjs";

function harness() {
  const writes = [], measurements = [];
  const indexFile = { id: "index", name: "index.json", file: {}, eTag: "index-1" };
  const snapshotFile = { id: "snapshot", name: "one.json", file: {}, eTag: "snapshot-1" };
  const data = new Map([["index", JSON.stringify({ snapshots: [] })]]);
  const provider = {
    async listChildren(id) { return id === "meta" ? [{ id: "backups", name: "backups", folder: {} }]
      : id === "backups" ? [{ id: "snapshots", name: "snapshots", folder: {} }, indexFile] : [snapshotFile]; },
    async readText(item) { return data.get(item.id); },
    async writeText(item, text, eTag) { writes.push({ id: item.id, text, eTag }); data.set(item.id, text); return { ...item, eTag: item.id + "-2" }; },
  };
  const state = { provider, selectedWork: { mojigoto: { id: "meta" } } };
  let target = { targetType: "manuscript", relativePath: "chapter.txt" };
  const controller = createBackupStorage({ state, currentBackupTarget: () => target,
    beginPerformanceMeasurement: (label, details) => extra => measurements.push({ label, ...details, ...extra }),
  });
  return { controller, state, provider, data, writes, measurements, setTarget(value) { target = value; } };
}

test("分離した保存先取得と索引入出力は条件付き書込の版を引き継ぐ", async () => {
  const h = harness();
  const storage = await h.controller.loadManuscriptBackupStorage();
  const index = await h.controller.readWebBackupIndex(storage);
  await h.controller.saveWebBackupIndex(storage, index);
  await h.controller.saveWebBackupIndex(storage, index);
  assert.equal(h.writes[0].eTag, "index-1");
  assert.equal(h.writes[1].eTag, "index-2");
  assert.equal(storage.provider, h.provider);
  assert.equal(h.measurements.filter(row => row.label === "バックアップ・索引保存").length, 2);
});

test("分離したGoogle Drive入出力でも未許可フォルダと索引再構築を停止する", async () => {
  const h = harness(); h.provider.requiresExplicitFileAccess = true;
  h.provider.listChildren = async () => [];
  await assert.rejects(h.controller.loadManuscriptBackupStorage({ create: true }), /追加許可/);
  await assert.rejects(h.controller.readWebBackupIndex({ provider: h.provider }), /Webでは.*再構築しません/);
  assert.equal(h.writes.length, 0);
});

test("履歴本文の検証は呼出時の対象とハッシュを確認して別データを拒む", async () => {
  const h = harness(); const content = "検証本文";
  const snapshot = createBackupSnapshot({ id: "one", targetType: "manuscript", relativePath: "chapter.txt", content, contentHash: await hashBackupContent(content), createdAt: "2026-10-27T00:00:00.000Z", source: "web", reason: "manual" });
  h.data.set("snapshot", JSON.stringify(snapshot));
  const entry = backupIndexEntry(snapshot), storage = await h.controller.loadManuscriptBackupStorage();
  assert.equal((await h.controller.readWebBackupSnapshot(storage, entry)).content, content);
  h.setTarget({ targetType: "note", relativePath: "plots/other.json" });
  await assert.rejects(h.controller.readWebBackupSnapshot(storage, entry), /別のデータ/);
  h.setTarget({ targetType: "manuscript", relativePath: "chapter.txt" });
  h.data.set("snapshot", JSON.stringify({ ...snapshot, content: "壊れた本文" }));
  await assert.rejects(h.controller.readWebBackupSnapshot(storage, entry), /内容を検証/);
  assert.equal(h.writes.length, 0);
});

test("履歴保護は本文と索引を更新し渡された索引を変更しない", async () => {
  const h = harness(), entry = { id: "one", snapshotFile: "one.json", protected: false };
  const index = { snapshots: [entry] };
  h.data.set("snapshot", JSON.stringify({ id: "one", protected: false }));
  const storage = await h.controller.loadManuscriptBackupStorage();
  await h.controller.setWebBackupProtection(storage, index, entry, true);
  assert.deepEqual(h.writes.map(row => [row.id, row.eTag]), [["snapshot", "snapshot-1"], ["index", "index-1"]]);
  assert.equal(JSON.parse(h.data.get("snapshot")).protected, true);
  assert.equal(JSON.parse(h.data.get("index")).snapshots[0].protected, true);
  assert.equal(index.snapshots[0].protected, false);
  assert.equal(h.state.manuscriptBackupStorage, storage);
});

test("履歴保護本文の書込失敗では索引を更新せず例外を呼出元へ返す", async () => {
  const h = harness(), entry = { id: "one", snapshotFile: "one.json" };
  h.data.set("snapshot", JSON.stringify({ id: "one" }));
  h.provider.writeText = async () => { throw new Error("conflict"); };
  const storage = await h.controller.loadManuscriptBackupStorage();
  await assert.rejects(h.controller.setWebBackupProtection(storage, { snapshots: [entry] }, entry, true), /conflict/);
  assert.equal(JSON.parse(h.data.get("index")).snapshots.length, 0);
  assert.equal(h.state.manuscriptBackupStorage, undefined);
});
