import assert from "node:assert/strict";
import test from "node:test";
import { GoogleDriveProvider } from "../web/storage/google-drive-provider.mjs";
import { OneDriveProvider } from "../web/storage/onedrive-provider.mjs";
import { DropboxProvider } from "../web/storage/dropbox-provider.mjs";

const auth = { getAccessToken: async () => "token" };
const factories = { google: GoogleDriveProvider, oneDrive: OneDriveProvider, dropbox: DropboxProvider };
const item = { id: "file", eTag: "1" };
function cloudHarness(kind, { concurrent = false, metadataOverride = {}, status = 200, initialRevision = "1" } = {}) {
  const calls = [];
  let body = initialRevision === "1" ? "元の本文" : "別端末が保存した本文", revision = initialRevision;
  const metadata = () => kind === "google"
    ? { id: "file", title: "原稿.txt", mimeType: "text/plain", version: revision, etag: `"tag-${revision}"`, fileSize: "10", modifiedDate: "2026-10-12T00:00:00Z", parents: [{ id: "folder" }] }
    : kind === "oneDrive" ? { id: "file", name: "原稿.txt", eTag: revision }
    : { ".tag": "file", id: "file", name: "原稿.txt", rev: revision };
  const provider = new factories[kind](auth, async (url, options) => {
    calls.push({ url: String(url), options });
    const writing = /\/upload\/|\/content$|\/files\/upload$/.test(String(url));
    if (status !== 200) return Response.json({ error: { message: "unavailable" } }, { status });
    if (!writing) {
      const result = { ...metadata(), ...metadataOverride };
      if (concurrent) { body = "別端末が保存した本文"; revision = "2"; }
      return Response.json(result);
    }
    if (kind === "dropbox" && concurrent) { body = "別端末が保存した本文"; revision = "2"; }
    const condition = kind === "dropbox" ? JSON.parse(options.headers["Dropbox-API-Arg"]).mode.update : options.headers["If-Match"];
    const currentCondition = kind === "google" ? `"tag-${revision}"` : revision;
    if (condition && condition !== currentCondition) {
      return kind === "dropbox"
        ? Response.json({ error: { ".tag": "path", reason: { ".tag": "conflict" } } }, { status: 409 })
        : Response.json({ error: { message: "precondition failed" } }, { status: 412 });
    }
    body = kind === "dropbox" ? new TextDecoder().decode(options.body) : options.body;
    revision = "3";
    return Response.json(metadata());
  });
  return { provider, calls, body: () => body, revision: () => revision };
}

for (const kind of Object.keys(factories)) {
  test(`${kind}: 確認後の別端末更新を条件付き保存で止めて本文を保持する`, async () => {
    const h = cloudHarness(kind, { concurrent: true });
    await assert.rejects(h.provider.writeText(item, "Webの下書き", "1"), (error) => error.code === "conflict");
    assert.equal(h.body(), "別端末が保存した本文");
    assert.equal(h.revision(), "2");
    assert.equal(h.calls.filter(({ options }) => options.method === "PUT" || options.method === "PATCH" || String(options.headers?.["Dropbox-API-Arg"] || "").includes('"mode"')).length, 1);
  });
  test(`${kind}: 保存基準がない場合は最新版を取得して上書きしない`, async () => {
    const h = cloudHarness(kind);
    await assert.rejects(h.provider.writeText({ id: "file" }, "下書き"), /版情報/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.body(), "元の本文");
  });
  test(`${kind}: 引数省略でも古いitem.eTagを最新版へ置き換えて上書きしない`, async () => {
    const h = cloudHarness(kind, { initialRevision: "2" });
    await assert.rejects(h.provider.writeText(item, "Webの下書き"), (error) => error.code === "conflict");
    assert.equal(h.body(), "別端末が保存した本文");
    assert.equal(h.revision(), "2");
  });
  test(`${kind}: 引数省略時も読み込み時のitem.eTagを条件に保存する`, async () => {
    const h = cloudHarness(kind);
    const saved = await h.provider.writeText(item, "Webの本文");
    assert.equal(h.body(), "Webの本文");
    assert.equal(saved.eTag, "3");
    const options = h.calls.at(-1).options;
    if (kind !== "dropbox") assert.equal(options.headers["If-Match"], kind === "google" ? '"tag-1"' : "1");
    else {
      const args = JSON.parse(options.headers["Dropbox-API-Arg"]);
      assert.equal(args.mode.update, "1");
      assert.equal(args.autorename, false);
      assert.equal(args.strict_conflict, true);
    }
    if (kind === "google") {
      assert.match(h.calls[0].url, /\/drive\/v2\/files\/file\?/);
      assert.match(h.calls.at(-1).url, /\/upload\/drive\/v2\/files\/file\?/);
      assert.equal(options.method, "PUT");
      assert.equal(saved.name, "原稿.txt");
      assert.equal(saved.parentReference.id, "folder");
      assert.equal(saved.size, 10);
    }
  });
  test(`${kind}: 認可エラーは競合と区別し再試行しない`, async () => {
    const h = cloudHarness(kind, { status: 401 });
    await assert.rejects(h.provider.writeText(item, "下書き", "1"), (error) => error.status === 401 && error.code !== "conflict");
    assert.equal(h.calls.length, 1);
    assert.equal(h.body(), "元の本文");
  });
}

for (const [label, metadataOverride] of [["ETagなし", { etag: undefined }], ["弱いETag", { etag: 'W/"weak"' }], ["versionなし", { version: undefined }]]) {
  test(`google: ${label}では本文を送らない`, async () => {
    const h = cloudHarness("google", { metadataOverride });
    await assert.rejects(h.provider.writeText(item, "下書き", "1"), /版情報/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.body(), "元の本文");
  });
}
