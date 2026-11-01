import assert from "node:assert/strict";
import test from "node:test";
import { hasExternalVersion, hasSameExternalContent, writeTextWithBaseline } from "../web/lib/editor-sync.mjs";
import { createNote, createNoteEntry } from "../web/lib/notes.mjs";
import { normalizeConceptDocument } from "../web/lib/concept-memos.mjs";

test("eTagが変わった外部更新を検出する", () => {
  assert.equal(hasExternalVersion({ eTag: '"v1"' }, { eTag: '"v2"' }), true);
  assert.equal(hasExternalVersion({ eTag: '"v2"' }, { eTag: '"v2"' }), false);
});

test("eTagを取得できない場合は誤って競合扱いしない", () => {
  assert.equal(hasExternalVersion({}, { eTag: '"v2"' }), false);
  assert.equal(hasExternalVersion({ eTag: '"v1"' }, {}), false);
});

test("同期後の本文が保存済み内容と同じなら競合扱いしない", () => {
  assert.equal(hasSameExternalContent("同じ本文\n", "同じ本文\n"), true);
  assert.equal(hasSameExternalContent("Windows\r\n改行\r\n", "Windows\n改行\n"), true);
  assert.equal(hasSameExternalContent("保存済み本文", "外部で変更された本文"), false);
});

test("空のノートをVS Codeで整形保存してもWebの下書きと競合しない", async () => {
  const note = createNote("plot", "新しいノート");
  note.groups[0].items.push(createNoteEntry());
  const baseline = JSON.stringify(note);
  const remote = { ...note, updatedAt: "2026-10-04T01:00:00Z" };
  const remoteRaw = JSON.stringify(remote, null, 2);
  const draft = structuredClone(note);
  draft.groups[0].items[0].body = "Webで書いた内容";
  const content = JSON.stringify(draft);
  const calls = [];
  const conflict = Object.assign(new Error("conflict"), { code: "conflict" });
  const provider = {
    async writeText(item, value, version) {
      calls.push({ item, value, version });
      if (version === "v1") throw conflict;
      return { id: item.id, eTag: "v3" };
    },
    async getItemMetadata() { return { eTag: "v2" }; },
    async readText() { return remoteRaw; },
  };
  assert.equal(hasSameExternalContent(baseline, remoteRaw, "note"), true);
  assert.equal(hasSameExternalContent(baseline, content, "note"), false);
  const saved = await writeTextWithBaseline(provider, { id: "note", eTag: "v1" }, content, baseline, "note");
  assert.equal(saved.eTag, "v3");
  assert.deepEqual(calls.map(({ version }) => version), ["v1", "v2"]);
  assert.equal(calls[1].value, content);
});

test("空の構想ファイルの更新日時だけが変わっても新規メモを保存できる", () => {
  const document = normalizeConceptDocument({ memos: [] });
  const remote = { ...structuredClone(document), updatedAt: "別の更新日時" };
  assert.equal(hasSameExternalContent(JSON.stringify(document), JSON.stringify(remote, null, 2), "concept"), true);
  remote.memos.push({ id: "external", title: "VS Codeで作成", body: "内容", createdAt: "2026-10-04" });
  assert.equal(hasSameExternalContent(JSON.stringify(document), JSON.stringify(remote), "concept"), false);
});

test("外部で本文が変わった場合は再試行して上書きしない", async () => {
  const baseline = JSON.stringify(createNote("reference", "資料"));
  const remote = JSON.parse(baseline);
  remote.groups[0].title = "外部で編集";
  const conflict = Object.assign(new Error("conflict"), { code: "conflict" });
  let writes = 0;
  const provider = {
    async writeText() { writes += 1; throw conflict; },
    async getItemMetadata() { return { eTag: "v2" }; },
    async readText() { return JSON.stringify(remote); },
  };
  await assert.rejects(writeTextWithBaseline(provider, { id: "note", eTag: "v1" }, "draft", baseline, "note"), (error) => error === conflict);
  assert.equal(writes, 1);
  assert.equal(hasSameExternalContent(baseline, "破損したJSON", "note"), false);
});

test("再試行中の外部更新と通信エラーも握りつぶさない", async () => {
  const baseline = JSON.stringify(normalizeConceptDocument({ memos: [] }));
  const conflict = Object.assign(new Error("conflict"), { code: "conflict" });
  let writes = 0;
  const provider = {
    async writeText() { writes += 1; throw conflict; },
    async getItemMetadata() { return { eTag: "v2" }; },
    async readText() { return baseline; },
  };
  await assert.rejects(writeTextWithBaseline(provider, { id: "concept", eTag: "v1" }, "draft", baseline, "concept"), (error) => error === conflict);
  assert.equal(writes, 2);
  const offline = new Error("offline");
  provider.writeText = async () => { throw offline; };
  provider.getItemMetadata = async () => { assert.fail("通信エラーでは再試行しない"); };
  await assert.rejects(writeTextWithBaseline(provider, { id: "concept" }, "draft", baseline, "concept"), (error) => error === offline);
});
