import assert from "node:assert/strict";
import test from "node:test";
import { DropboxAuth } from "../web/auth/dropbox.mjs";
import { DropboxProvider, DropboxConflictError, DROPBOX_ROOT_ID } from "../web/storage/dropbox-provider.mjs";
import { discoverWorks, createWorkCatalogSnapshot } from "../web/lib/work-discovery.mjs";
import { normalizeRuntimeConfig } from "../web/lib/runtime-config.mjs";

function authContext(fetchImpl = async () => Response.json({ access_token: "token", expires_in: 14400 })) {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const locationRef = { search: "", assign: (url) => { locationRef.assigned = new URL(url); } };
  const historyRef = { replaceState: (...args) => { locationRef.cleaned = args[2]; } };
  const auth = new DropboxAuth({ clientId: "app-key", redirectUri: "http://localhost:4173/", storage, locationRef, historyRef, fetchImpl });
  return { auth, data, storage, locationRef };
}

test("DropboxはPKCEで認可しApp secret・更新トークンを使わない", async () => {
  let request;
  const ctx = authContext(async (url, options) => { request = { url, options }; return Response.json({ access_token: "token", expires_in: 14400 }); });
  await ctx.auth.signIn();
  const params = ctx.locationRef.assigned.searchParams;
  assert.equal(params.get("code_challenge_method"), "S256");
  const pending = JSON.parse(ctx.data.get("mojigoto.dropbox.pending"));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pending.verifier));
  assert.equal(params.get("code_challenge"), Buffer.from(digest).toString("base64url"));
  assert.equal(params.get("token_access_type"), "online");
  ctx.locationRef.search = `?code=example&state=${params.get("state")}`;
  assert.equal(await ctx.auth.completeRedirect(), true);
  assert.equal(request.options.body.get("code_verifier"), pending.verifier);
  assert.equal(request.options.body.has("client_secret"), false);
  assert.equal(await ctx.auth.getAccessToken(), "token");
  assert.equal(ctx.locationRef.cleaned, "http://localhost:4173/");
  assert.equal(ctx.data.has("mojigoto.dropbox.pending"), false);
  assert.equal(await ctx.auth.completeRedirect(), false);
});

test("Dropbox認可のstate不一致・期限切れ・App key変更を拒否する", async () => {
  for (const mode of ["state", "expiry", "client"]) {
    let fetched = false;
    const ctx = authContext(async () => { fetched = true; });
    await ctx.auth.signIn();
    const pending = JSON.parse(ctx.data.get("mojigoto.dropbox.pending"));
    if (mode === "expiry") pending.createdAt = Date.now() - 11 * 60 * 1000;
    if (mode === "client") pending.clientId = "other";
    ctx.data.set("mojigoto.dropbox.pending", JSON.stringify(pending));
    ctx.locationRef.search = `?code=code&state=${mode === "state" ? "dropbox_wrong" : pending.state}`;
    await assert.rejects(() => ctx.auth.completeRedirect(), /接続応答/);
    assert.equal(fetched, false);
    assert.equal(ctx.data.has("mojigoto.dropbox.pending"), false);
  }
});

test("Dropboxの認可キャンセルとトークン交換失敗ではトークンを保存しない", async () => {
  for (const error of [true, false]) {
    const ctx = authContext(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await ctx.auth.signIn();
    ctx.locationRef.search = `?${error ? "error=access_denied" : "code=bad"}&state=${ctx.locationRef.assigned.searchParams.get("state")}`;
    await assert.rejects(() => ctx.auth.completeRedirect(), error ? /中止/ : /取得できません/);
    assert.equal(await ctx.auth.getAccessToken(), "");
  }
});

test("Microsoftの応答をDropbox認証で消費しない", async () => {
  const ctx = authContext();
  await ctx.auth.signIn();
  ctx.locationRef.search = "?code=microsoft-code&state=microsoft-state";
  assert.equal(await ctx.auth.completeRedirect(), false);
  assert.equal(ctx.locationRef.cleaned, undefined);
});

test("Dropboxの期限切れとアプリ変更では古いトークンを使用しない", async () => {
  const ctx = authContext();
  await ctx.auth.signIn();
  ctx.locationRef.search = `?code=code&state=${ctx.locationRef.assigned.searchParams.get("state")}`;
  await ctx.auth.completeRedirect();
  ctx.auth.clientId = "other";
  assert.equal(await ctx.auth.getAccessToken(), "");
  ctx.auth.clientId = "app-key";
  ctx.data.set("mojigoto.dropbox.expiresAt", String(Date.now() - 1));
  assert.equal(await ctx.auth.getAccessToken(), "");
});

test("Dropboxの失効要求に通信失敗しても接続情報を破棄する", async () => {
  const ctx = authContext(async () => { throw new Error("network"); });
  ctx.data.set("mojigoto.dropbox.accessToken", "token");
  ctx.data.set("mojigoto.dropbox.expiresAt", "9999999999999");
  ctx.data.set("mojigoto.dropbox.clientId", "app-key");
  await ctx.auth.signOut();
  assert.equal(ctx.data.size, 0);
});

const folder = (id, name, path) => ({ ".tag": "folder", id, name, path_lower: path.toLowerCase(), path_display: path });
const file = (id = "id:file", name = "原稿.txt", path = "/作品/原稿.txt") => ({ ".tag": "file", id, name,
  path_lower: path.toLowerCase(), path_display: path, rev: "123456789", server_modified: "2026-10-01T00:00:00Z", size: 6 });
const provider = (fetchImpl) => new DropboxProvider({ getAccessToken: async () => "token" }, fetchImpl);

test("Dropbox一覧のページ送りと共通形式への変換", async () => {
  const calls = [];
  const drive = provider(async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return Response.json(calls.length === 1 ? { entries: [folder("id:folder", "作品", "/作品")], has_more: true, cursor: "cursor" }
      : { entries: [file()], has_more: false });
  });
  const items = await drive.listChildren(DROPBOX_ROOT_ID);
  assert.equal(calls[0][1].path, "");
  assert.equal(calls[1][1].cursor, "cursor");
  assert.ok(items[0].folder);
  assert.ok(items[1].file);
  assert.equal(items[1].eTag, "123456789");
  assert.equal(items[0].parentReference.id, DROPBOX_ROOT_ID);
  assert.equal(items[1].parentReference.id, DROPBOX_ROOT_ID);
});

test("Dropbox保存は指定revで原子的に更新し競合コピーを作らない", async () => {
  let args;
  const drive = provider(async (_url, options) => {
    args = JSON.parse(options.headers["Dropbox-API-Arg"]);
    assert.equal(new TextDecoder().decode(options.body), "本文");
    return Response.json(file());
  });
  await drive.writeText({ id: "id:file" }, "本文", "123456789");
  assert.equal(args.path, "id:file");
  assert.deepEqual(args.mode, { ".tag": "update", update: "123456789" });
  assert.equal(args.autorename, false);
  assert.equal(args.strict_conflict, true);
});

test("Dropbox保存で引数未指定なら読み込み済みの版で条件付き更新する", async () => {
  const calls = [];
  const drive = provider(async (url, options) => {
    calls.push(url);
    if (url.endsWith("upload")) assert.equal(JSON.parse(options.headers["Dropbox-API-Arg"]).mode.update, "123456789");
    return Response.json(file());
  });
  await drive.writeText({ id: "id:file", eTag: "123456789" }, "本文");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith("upload"));
});

test("Dropboxのrev競合は共通の競合エラーに変換しnot_foundと区別する", async () => {
  const drive = provider(async () => Response.json({ error: { ".tag": "path", reason: { ".tag": "conflict", conflict: { ".tag": "file" } } } }, { status: 409 }));
  await assert.rejects(() => drive.writeText({ id: "id:file" }, "本文", "old-rev"), DropboxConflictError);
  const missing = provider(async () => Response.json({ error: { ".tag": "path", path: { ".tag": "not_found" } } }, { status: 409 }));
  await assert.rejects(() => missing.readText({ id: "id:missing" }), (error) => error.code !== "conflict" && error.status === 409);
});

test("Dropbox日本語・絵文字ファイル名をASCIIヘッダーで送り同名を上書きしない", async () => {
  let args;
  const drive = provider(async (url, options) => {
    if (url.endsWith("get_metadata")) return Response.json(folder("id:parent", "作品", "/作品"));
    assert.doesNotMatch(options.headers["Dropbox-API-Arg"], /[^\x00-\x7f]/);
    args = JSON.parse(options.headers["Dropbox-API-Arg"]);
    return Response.json(file());
  });
  await drive.createTextFile({ id: "id:parent" }, "第一章🌸.txt", "本文");
  assert.equal(args.path, "/作品/第一章🌸.txt");
  assert.deepEqual(args.mode, { ".tag": "add" });
  assert.equal(args.strict_conflict, true);
});

test("Dropboxバックアップ用フォルダ作成・本文読込・削除・ファイル移動", async () => {
  const calls = [];
  const drive = provider(async (url, options) => {
    const route = url.split("/2/")[1];
    const args = options.body ? JSON.parse(options.body) : JSON.parse(options.headers["Dropbox-API-Arg"]);
    calls.push([route, args]);
    if (route === "files/list_folder") return Response.json({ entries: [], has_more: false });
    if (route === "files/get_metadata") return Response.json(args.path === "id:file" ? file() : folder("id:parent", "作品", "/作品"));
    if (route === "files/download") return new Response("本文");
    return Response.json({ metadata: folder("id:backup", "backup", "/作品/backup") });
  });
  assert.ok((await drive.createFolder({ id: "id:parent" }, "backup")).folder);
  assert.equal(await drive.readText({ id: "id:file" }), "本文");
  await drive.deleteItem({ id: "id:file" });
  await drive.moveItem({ id: "id:file" }, await drive.getRoot());
  assert.ok(calls.some(([route, args]) => route === "files/create_folder_v2" && args.path === "/作品/backup"));
  assert.ok(calls.some(([route, args]) => route === "files/delete_v2" && args.path === "id:file"));
  assert.ok(calls.some(([route, args]) => route === "files/move_v2" && args.to_path === "/原稿.txt" && args.autorename === false));
});

test("Dropbox移動済みフォルダは現在のパスへ作成しパス不明なら停止する", async () => {
  const drive = provider(async () => Response.json(folder("id:parent", "移動先", "/移動先")));
  assert.equal(await drive.childPath({ id: "id:parent", path_display: "/旧パス" }, "原稿.txt"), "/移動先/原稿.txt");
  const unmounted = provider(async () => Response.json({ ".tag": "folder", id: "id:parent", name: "作品" }));
  await assert.rejects(() => unmounted.childPath({ id: "id:parent" }, "原稿.txt"), /パスを確認/);
  await assert.rejects(() => drive.childPath({ id: "id:parent" }, "../原稿.txt"), /ファイル名/);
});

test("Dropbox Single・Multi作品を既存探索処理で検出しキャッシュから操作できる", async () => {
  const lists = {
    "": [folder("id:work", "作品", "/作品")],
    "id:work": [folder("id:meta", ".mojigoto", "/作品/.mojigoto"), folder("id:manuscript", "原稿", "/作品/原稿")],
    "id:meta": [file("id:settings", "singleWork.json", "/作品/.mojigoto/singleWork.json")],
  };
  const drive = provider(async (url, options) => {
    if (url.endsWith("download")) return new Response(JSON.stringify({ title: "Dropbox作品" }));
    const args = JSON.parse(options.body);
    if (url.endsWith("list_folder")) return Response.json({ entries: lists[args.path] || [], has_more: false });
    if (url.endsWith("get_metadata")) return Response.json(folder("id:meta", ".mojigoto", "/作品/.mojigoto"));
    return Response.json(file());
  });
  const single = await discoverWorks(drive, { id: "id:work", name: "作品", folder: {} });
  const multi = await discoverWorks(drive, await drive.getRoot());
  assert.equal(single[0].title, "Dropbox作品");
  assert.equal(multi[0].id, single[0].id);
  const cached = JSON.parse(JSON.stringify(createWorkCatalogSnapshot(single)));
  assert.equal(await drive.childPath(cached[0].mojigoto, "backup.json"), "/作品/.mojigoto/backup.json");
});

test("Dropbox未接続ではAPIへ送信せずHTTP認証・権限・通信制限を案内する", async () => {
  const drive = new DropboxProvider({ getAccessToken: async () => "" }, async () => { throw new Error("must not fetch"); });
  await assert.rejects(() => drive.listChildren(DROPBOX_ROOT_ID), /もう一度接続/);
  for (const [status, message] of [[401, /期限/], [403, /権限/], [429, /集中/]]) {
    const failed = provider(async () => Response.json({}, { status }));
    await assert.rejects(() => failed.listChildren(DROPBOX_ROOT_ID), message);
  }
  assert.equal(normalizeRuntimeConfig({ dropboxClientId: " key " }).dropboxClientId, "key");
});
