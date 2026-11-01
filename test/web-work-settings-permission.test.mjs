import assert from "node:assert/strict";
import test from "node:test";
import { createWorkSettingsPersistence } from "../web/lib/work-settings-persistence.mjs";

const settingsFile = { id: "pc-settings", name: "work.json", file: {} };
function harness(cloudKind = "googleDrive", children = []) {
  const calls = [];
  const state = {
    cloudKind,
    selectedWork: { id: "work", name: "移行作品", mojigoto: { id: "metadata" }, mojigotoChildren: [] },
    provider: {
      async listChildren(id) { calls.push(["list", id]); return children; },
      async createTextFile(parent, name, content) {
        calls.push(["create", parent.id, name, JSON.parse(content)]);
        return { id: "new", name, file: {} };
      },
    },
  };
  const controller = createWorkSettingsPersistence({ state });
  return { state, calls, ensure: () => controller.ensureWorkSettingsFile() };
}

test("移行後の未許可work.jsonが一覧に出なくても重複を作らず、追加許可を案内する", async () => {
  // The server has a work.json, but drive.file exposes an empty listing.
  const h = harness();
  await assert.rejects(h.ensure(), /追加許可.*Single→Multi/s);
  assert.deepEqual(h.calls, [["list", "metadata"]]);
  assert.equal(h.state.selectedWork.settingsFile, undefined);
  assert.deepEqual(h.state.selectedWork.mojigotoChildren, []);
});

test("許可後は古い空の一覧を使わず既存work.jsonを参照し、次回も作成しない", async () => {
  const children = [];
  const h = harness("googleDrive", children);
  await assert.rejects(h.ensure());
  children.push(settingsFile);
  assert.equal(await h.ensure(), settingsFile);
  assert.equal(await h.ensure(), settingsFile);
  assert.deepEqual(h.calls, [["list", "metadata"], ["list", "metadata"]]);
});

test("Single設定も新規作成せず使用し、両方見えるときはwork.jsonを優先する", async () => {
  const single = { id: "single", name: "singleWork.json", file: {} };
  const h = harness("googleDrive", [single]);
  assert.equal(await h.ensure(), single);
  const multi = harness("googleDrive", [single, settingsFile]);
  assert.equal(await multi.ensure(), settingsFile);
  assert.equal(multi.calls.length, 1);
});

test("一覧取得失敗時も新規作成しない", async () => {
  const h = harness();
  h.state.provider.listChildren = async () => { throw new Error("403"); };
  await assert.rejects(h.ensure(), /403/);
  assert.deepEqual(h.calls, []);
});

test("Google Driveで本当に設定がない場合も、不存在を断定せず停止する", async () => {
  const h = harness();
  await assert.rejects(h.ensure(), /新規作成していません/);
  assert.equal(h.calls.some(([action]) => action === "create"), false);
});

test("OneDrive・Dropboxは取得した最新一覧を使い、設定の新規作成を維持する", async () => {
  for (const kind of ["oneDrive", "dropbox"]) {
    const h = harness(kind);
    assert.equal((await h.ensure()).id, "new");
    assert.equal(h.calls[1][2], "work.json");
    assert.equal(h.state.selectedWork.mojigotoChildren.length, 1);
    const existing = harness(kind, [settingsFile]);
    assert.equal(await existing.ensure(), settingsFile);
    assert.equal(existing.calls.length, 1);
  }
});
