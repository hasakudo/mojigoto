import { readVerifiedFile } from "../web/lib/verified-file-read.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { OneDriveConflictError, OneDriveProvider } from "../web/storage/onedrive-provider.mjs";

test("OneDriveのfetchをglobalThisへ結び付けて呼び出す", async () => {
  let receiver = null;
  let authorization = "";
  const fakeFetch = function (_url, options) {
    receiver = this;
    authorization = options.headers.Authorization;
    return Promise.resolve({
      ok: true,
      json: async () => ({ displayName: "Test User" }),
    });
  };
  const auth = { getAccessToken: async () => "test-token" };
  const provider = new OneDriveProvider(auth, fakeFetch);

  const profile = await provider.getProfile();

  assert.equal(receiver, globalThis);
  assert.equal(authorization, "Bearer test-token");
  assert.equal(profile.displayName, "Test User");
});

test("OneDriveの403に権限確認の案内を付ける", async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { code: "accessDenied", message: "Access denied" } }),
  });
  const auth = { getAccessToken: async () => "test-token" };
  const provider = new OneDriveProvider(auth, fakeFetch);

  await assert.rejects(
    () => provider.getRoot(),
    /Files\.ReadWrite.*accessDenied/,
  );
});

test("複数フォルダの一覧をMicrosoft Graph batchでまとめて取得する", async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const requests = JSON.parse(options.body).requests;
    return {
      ok: true,
      json: async () => ({
        responses: requests.map((request) => ({
          id: request.id,
          status: 200,
          body: { value: [{ id: `child-${request.id}`, name: `子${request.id}`, file: {} }] },
        })),
      }),
    };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);

  const result = await provider.listChildrenBatch(["folder-a", "folder-b"]);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\.0\/\$batch$/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).requests.length, 2);
  assert.equal(result.get("folder-a")[0].id, "child-1");
  assert.equal(result.get("folder-b")[0].id, "child-2");
});

test("本文は事前認証済みURLから認証ヘッダーなしで取得する", async () => {
  const downloadUrl = "https://example.files.1drv.com/temporary-download";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("https://graph.microsoft.com/")) {
      return {
        ok: true,
        json: async () => ({
          id: "file-id",
          "@microsoft.graph.downloadUrl": downloadUrl,
        }),
      };
    }
    return {
      ok: true,
      text: async () => "原稿本文",
    };
  };
  const auth = { getAccessToken: async () => "test-token" };
  const provider = new OneDriveProvider(auth, fakeFetch);

  assert.equal(await provider.readText("file-id"), "原稿本文");
  assert.match(calls[0].url, /\?select=id,name,file,remoteItem,parentReference,@microsoft\.graph\.downloadUrl$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(calls[1].url, downloadUrl);
  assert.equal(calls[1].options.headers, undefined);
  assert.equal(calls.some((call) => call.url.endsWith("/content")), false);
});

test("一覧に含まれるダウンロードURLは追加のGraph要求なしで使う", async () => {
  const downloadUrl = "https://example.files.1drv.com/from-list";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, text: async () => "一覧から取得" };
  };
  const auth = { getAccessToken: async () => "test-token" };
  const provider = new OneDriveProvider(auth, fakeFetch);

  const content = await provider.readText({
    id: "file-id",
    file: {},
    "@microsoft.graph.downloadUrl": downloadUrl,
  });

  assert.equal(content, "一覧から取得");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, downloadUrl);
  assert.equal(calls[0].options.headers, undefined);
});

test("原稿ダウンロードの同時接続数を制限する", async () => {
  let active = 0;
  let maximum = 0;
  const fakeFetch = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    active -= 1;
    return { ok: true, text: async () => "本文" };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);
  await Promise.all(Array.from({ length: 14 }, (_, index) => provider.readText({
    id: `file-${index}`,
    file: {},
    "@microsoft.graph.downloadUrl": `https://download.example/${index}`,
  })));
  assert.equal(maximum, 6);
});

test("共有ファイルのremoteItemにあるダウンロードURLを使う", async () => {
  const downloadUrl = "https://example.files.1drv.com/remote-item";
  const fakeFetch = async () => ({ ok: true, text: async () => "共有本文" });
  const auth = { getAccessToken: async () => "test-token" };
  const provider = new OneDriveProvider(auth, fakeFetch);

  const content = await provider.readText({
    id: "shortcut-id",
    remoteItem: { "@microsoft.graph.downloadUrl": downloadUrl },
  });

  assert.equal(content, "共有本文");
});

test("ブラウザでは事前認証済みURLをXMLHttpRequestで取得する", async () => {
  const originalXhr = globalThis.XMLHttpRequest;
  let openedUrl = "";
  let sent = false;
  class FakeXmlHttpRequest {
    status = 200;
    responseText = "XHR本文";
    open(_method, url) { openedUrl = url; }
    overrideMimeType() {}
    send() {
      sent = true;
      queueMicrotask(() => this.onload());
    }
  }
  globalThis.XMLHttpRequest = FakeXmlHttpRequest;
  try {
    const downloadUrl = "https://dynamic-host.example/temporary";
    const provider = new OneDriveProvider(
      { getAccessToken: async () => "test-token" },
      async () => { throw new Error("fetch should not be used for the download"); },
    );
    const content = await provider.readText({
      id: "file-id",
      file: {},
      "@microsoft.graph.downloadUrl": downloadUrl,
    });
    assert.equal(content, "XHR本文");
    assert.equal(openedUrl, downloadUrl);
    assert.equal(sent, true);
  } finally {
    if (originalXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = originalXhr;
  }
});

test("eTagが一致する場合だけ原稿を保存する", async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "PUT") {
      return {
        ok: true,
        json: async () => ({ id: "file-id", name: "01.txt", eTag: '"etag-2"', lastModifiedDateTime: "2026-09-16T00:00:00Z" }),
      };
    }
    return {
      ok: true,
      json: async () => ({ id: "file-id", name: "01.txt", eTag: '"etag-1"', parentReference: { driveId: "drive-id" } }),
    };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);

  const saved = await provider.writeText(
    { id: "file-id", eTag: '"etag-1"', parentReference: { driveId: "drive-id" } },
    "更新本文",
    '"etag-1"',
  );

  assert.equal(saved.eTag, '"etag-2"');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.headers["If-Match"], '"etag-1"');
  assert.equal(calls[1].options.body, "更新本文");
});

test("保存前にeTagが変わっていたら上書きしない", async () => {
  let putCalled = false;
  const fakeFetch = async (_url, options = {}) => {
    if (options.method === "PUT") putCalled = true;
    return {
      ok: true,
      json: async () => ({ id: "file-id", eTag: '"new-etag"', parentReference: { driveId: "drive-id" } }),
    };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);

  await assert.rejects(
    () => provider.writeText(
      { id: "file-id", eTag: '"old-etag"', parentReference: { driveId: "drive-id" } },
      "更新本文",
      '"old-etag"',
    ),
    OneDriveConflictError,
  );
  assert.equal(putCalled, false);
});

test("新規原稿は同名上書きを禁止して作成する", async () => {
  let requestCall;
  const fakeFetch = async (url, options = {}) => {
    requestCall = { url: String(url), options };
    return { ok: true, json: async () => ({ id: "new-id", name: "新しい章.txt", eTag: '"new"' }) };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);

  await provider.createTextFile(
    { id: "parent-id", parentReference: { driveId: "drive-id" } },
    "新しい章.txt",
  );

  assert.match(requestCall.url, /\/drives\/drive-id\/items\/parent-id:\/%E6%96%B0%E3%81%97%E3%81%84%E7%AB%A0\.txt:\/content$/);
  assert.equal(requestCall.options.headers["If-None-Match"], "*");
  assert.equal(requestCall.options.method, "PUT");
});

test("ノート保存用の子フォルダを作成する", async () => {
  let requestCall;
  const fakeFetch = async (url, options = {}) => {
    requestCall = { url: String(url), options };
    return { ok: true, json: async () => ({ id: "folder-id", name: "plots", folder: {} }) };
  };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, fakeFetch);
  const created = await provider.createFolder(
    { id: "metadata-id", parentReference: { driveId: "drive-id" } },
    "plots",
  );
  assert.equal(created.name, "plots");
  assert.match(requestCall.url, /\/drives\/drive-id\/items\/metadata-id\/children$/);
  assert.equal(requestCall.options.method, "POST");
  assert.deepEqual(JSON.parse(requestCall.options.body), {
    name: "plots",
    folder: {},
    "@microsoft.graph.conflictBehavior": "fail",
  });
});

test("OneDriveの原稿ファイルを別の原稿フォルダへ移動する", async () => {
  let requestCall;
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async (url, options = {}) => {
    requestCall = { url: String(url), options };
    return { ok: true, json: async () => ({ id: "file-id", name: "01.txt", parentReference: { id: "to-id", driveId: "drive-id" } }) };
  });

  const moved = await provider.moveItem(
    { id: "file-id", parentReference: { id: "from-id", driveId: "drive-id" } },
    { id: "to-id", parentReference: { driveId: "drive-id" } },
  );

  assert.equal(moved.parentReference.id, "to-id");
  assert.match(requestCall.url, /\/drives\/drive-id\/items\/file-id$/);
  assert.equal(requestCall.options.method, "PATCH");
  assert.deepEqual(JSON.parse(requestCall.options.body), { parentReference: { id: "to-id" } });
});

test("OneDriveの整理対象バックアップを削除する", async () => {
  let requestCall;
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async (url, options = {}) => {
    requestCall = { url: String(url), options };
    return { ok: true };
  });
  await provider.deleteItem({ id: "backup-id", parentReference: { driveId: "drive-id" } });
  assert.match(requestCall.url, /\/drives\/drive-id\/items\/backup-id$/);
  assert.equal(requestCall.options.method, "DELETE");
});

test("同じフォルダの同時一覧取得だけを共有し結果の変更を呼出元間で混ぜない", async () => {
  let release, calls = 0;
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async () => {
    calls++; await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ value: [{ id: "item", file: { mimeType: "text/plain" } }] }) };
  });
  const a = provider.listChildren("folder"), b = provider.listChildren("folder");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1); release(); const [one, two] = await Promise.all([a, b]);
  one[0].file.mimeType = "changed"; assert.equal(two[0].file.mimeType, "text/plain");
  const c = provider.listChildren("folder"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); release(); await c;
});
test("同時一覧の失敗を共有しても次の要求は再取得する", async () => {
  let calls = 0;
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async () => {
    calls++; if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ value: [] }) };
  });
  const results = await Promise.allSettled([provider.listChildren("folder"), provider.listChildren("folder")]);
  assert.equal(calls, 1); assert.ok(results.every(result => result.status === "rejected"));
  await provider.listChildren("folder"); assert.equal(calls, 2);
});
test("別フォルダや別の接続インスタンスの一覧取得を共有しない", async () => {
  let calls = 0; const fetch = async () => { calls++; return { ok: true, json: async () => ({ value: [] }) }; };
  const a = new OneDriveProvider({ getAccessToken: async () => "token" }, fetch);
  const b = new OneDriveProvider({ getAccessToken: async () => "other" }, fetch);
  await Promise.all([a.listChildren("one"), a.listChildren("two"), b.listChildren("one")]);
  assert.equal(calls, 3);
});

test("版確認で得た最新ダウンロードURLを使い、本文取得の追加メタデータ通信を省く", async () => {
  const calls = [];
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("graph.microsoft.com")) return { ok: true, json: async () => ({ id: "file", name: "note.json", file: {}, eTag: "v2", parentReference: { id: "folder" }, "@microsoft.graph.downloadUrl": "https://download.invalid/file" }) };
    return { ok: true, text: async () => "latest body" };
  });
  const item = await provider.getItemMetadata({ id: "file" });
  assert.equal(await provider.readText(item), "latest body");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /@microsoft.graph.downloadUrl/);
  assert.equal(calls[1].url, "https://download.invalid/file");
});

function verifiedWriteHarness() {
  const calls = [], samples = [];
  let version = '"v1"';
  const item = { id: "file", name: "note.json", file: {}, eTag: version, parentReference: { id: "folder", driveId: "drive" } };
  const provider = new OneDriveProvider({ getAccessToken: async () => "token" }, async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === "PUT") {
      if (options.headers["If-Match"] !== version) return { ok: false, status: 412, json: async () => ({ error: { code: "preconditionFailed" } }) };
      version = '"v2"'; return { ok: true, json: async () => ({ ...item, eTag: version }) };
    }
    return { ok: true, json: async () => ({ ...item, eTag: version }) };
  }, { beginPerformanceMeasurement: label => sample => samples.push({ label, ...sample }) });
  return { provider, item, calls, samples, changeVersion: value => { version = value; } };
}
test("反映直前の同版確認を再利用しGET・GET・PUTをGET・PUTに減らす", async () => {
  const h = verifiedWriteHarness();
  const verified = await readVerifiedFile(h.provider, { item: h.item, raw: "saved body" }, "folder", "note.json");
  await h.provider.writeText(verified.item, "new body", verified.item.eTag);
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].options.method, "PUT");
  assert.equal(h.calls[1].options.headers["If-Match"], '"v1"');
  assert.equal(h.samples[0].metadataReused, true); assert.equal(h.samples[0].failed, false);
});
test("直前の確認がない書込では従来どおりGETとPUTを行う", async () => {
  const h = verifiedWriteHarness(); await h.provider.writeText(h.item, "new body", h.item.eTag);
  assert.equal(h.calls.length, 2); assert.equal(h.samples[0].metadataReused, false);
});
test("次のイベントまで待った確認結果は書込に再利用しない", async () => {
  const h = verifiedWriteHarness(); await h.provider.getItemMetadata(h.item);
  await new Promise(resolve => setTimeout(resolve, 10));
  await h.provider.writeText(h.item, "new body", h.item.eTag);
  assert.equal(h.calls.length, 3); assert.equal(h.samples[0].metadataReused, false);
});
test("再利用した確認結果でも版が違えばPUTを送らず停止する", async () => {
  const h = verifiedWriteHarness(); h.changeVersion('"external"'); await h.provider.getItemMetadata(h.item);
  await assert.rejects(h.provider.writeText(h.item, "new body", h.item.eTag), OneDriveConflictError);
  assert.equal(h.calls.length, 1); assert.equal(h.samples[0].metadataReused, true); assert.equal(h.samples[0].failed, true);
});
test("確認直後の外部更新もIf-Matchの412で停止し再送しない", async () => {
  const h = verifiedWriteHarness(); await h.provider.getItemMetadata(h.item); h.changeVersion('"external"');
  await assert.rejects(h.provider.writeText(h.item, "new body", h.item.eTag), OneDriveConflictError);
  assert.equal(h.calls.length, 2); assert.equal(h.samples[0].failed, true);
});
test("一度使った確認結果は次の書込へ持ち越さない", async () => {
  const h = verifiedWriteHarness(); await h.provider.getItemMetadata(h.item);
  const saved = await h.provider.writeText(h.item, "first", h.item.eTag);
  await h.provider.writeText(saved, "second", saved.eTag);
  assert.equal(h.calls.length, 4); assert.equal(h.samples[0].metadataReused, true); assert.equal(h.samples[1].metadataReused, false);
});
test("呼出元が返却メタデータを変更しても確認済みの版を変更できない", async () => {
  const h = verifiedWriteHarness(); const current = await h.provider.getItemMetadata(h.item); current.eTag = '"fake"';
  await assert.rejects(h.provider.writeText(current, "new body", current.eTag), OneDriveConflictError);
  assert.equal(h.calls.length, 1);
});
test("同じIDでも別ドライブの書込へ版確認を使い回さない", async () => {
  const h = verifiedWriteHarness(); await h.provider.getItemMetadata(h.item);
  await h.provider.writeText({ ...h.item, parentReference: { driveId: "other" } }, "new body", h.item.eTag);
  assert.equal(h.calls.length, 3); assert.equal(h.samples[0].metadataReused, false);
});

test('設定メタデータは20件ずつ一括取得し、別ドライブと返答順を保ち書込検証に流用しない',async()=>{
 const calls=[];const p=new OneDriveProvider({getAccessToken:async()=>''},async()=>{throw Error('外部通信禁止');});
 p.request=async(url,options)=>{calls.push({url,requests:JSON.parse(options.body).requests});return {json:async()=>({responses:calls.at(-1).requests.map(req=>({id:req.id,status:200,body:{id:decodeURIComponent(req.url.match(/items\/([^?]+)/)[1]),eTag:'fresh'}})).reverse()})};};
 const items=Array.from({length:23},(_,i)=>({id:'item-'+i,parentReference:{driveId:i===0?'peer-drive':undefined}}));
 const result=await p.getItemMetadataBatch(items);
 assert.deepEqual(calls.map(c=>c.requests.length),[20,3]);assert.match(calls[0].requests[0].url,/drives\/peer-drive/);
 for(const item of items)assert.equal(result.get(item).id,item.id);assert.equal(p.freshWriteMetadata.size,0);
 assert.ok(calls.every(c=>c.requests.every(r=>r.method==='GET')));
});
test('一括メタデータの一部失敗や不一致は個別確認し、成功と失敗を混ぜない',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');});const items=[{id:'a'},{id:'b'},{id:'c'}],fallback=[];
 p.request=async()=>({json:async()=>({responses:[{id:'1',status:200,body:{id:'a',eTag:'fresh'}},{id:'2',status:200,body:{id:'wrong'}},{id:'3',status:403}]})});
 p.getItemMetadata=async item=>{fallback.push(item.id);if(item.id==='c')throw Error('permission');return {...item,eTag:'fallback'};};
 const result=await p.getItemMetadataBatch(items);assert.deepEqual(fallback,['b','c']);assert.equal(result.get(items[0]).eTag,'fresh');assert.equal(result.get(items[1]).eTag,'fallback');assert.match(result.get(items[2]).message,/permission/);
});
test('一括通信自体の失敗でも個別確認で部分成功を返す',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');});p.request=async()=>{throw Error('batch failed');};p.getItemMetadata=async item=>({...item,eTag:'verified'});
 const items=[{id:'a'},{id:'b'}];const result=await p.getItemMetadataBatch(items);assert.equal(result.size,2);assert.equal(result.get(items[1]).eTag,'verified');
});

test('参照用管理フォルダをパスと展開で20件ずつ取得し、返答順と別ドライブを区別する',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');}),calls=[];
 p.request=async(url,options)=>{const requests=JSON.parse(options.body).requests;calls.push(requests);return {json:async()=>({responses:requests.map(req=>{
  const parent=decodeURIComponent(req.url.match(/items\/([^:]+):/)[1]);return {id:req.id,status:200,body:{id:'meta-'+parent,name:'.mojigoto',folder:{childCount:1},parentReference:{id:parent},children:[{id:'settings-'+parent,name:'work.json',file:{}}]}};
 }).reverse()})};};
 const folders=Array.from({length:23},(_,i)=>({id:'folder-'+i,parentReference:{driveId:i===0?'peer-drive':undefined}}));
 const result=await p.inspectReferenceFolders(folders);assert.deepEqual(calls.map(r=>r.length),[20,3]);assert.match(calls[0][0].url,/drives\/peer-drive/);assert.match(calls[0][0].url,/\$expand=children/);
 assert.ok(calls.every(rows=>rows.every(r=>r.method==='GET')));for(const folder of folders)assert.equal(result.get(folder.id).children[0].id,'settings-'+folder.id);
 assert.equal(p.freshWriteMetadata.size,0);
});
test('管理フォルダの展開一覧は続きのページにある設定ファイルまで取得する',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');}),calls=[];
 p.request=async(url)=>{calls.push(url);return {json:async()=>url==='/$batch'?{responses:[{id:'1',status:200,body:{id:'meta',name:'.mojigoto',folder:{childCount:2},parentReference:{id:'work'},children:[{id:'first',name:'first.txt',file:{}}],'children@odata.nextLink':'/next'}}]}:{value:[{id:'settings',name:'singleWork.json',file:{}}]}};};
 const result=await p.inspectReferenceFolders([{id:'work'}]);assert.equal(result.get('work').children[1].name,'singleWork.json');assert.deepEqual(calls,['/$batch','/next']);
});
test('展開一覧の件数が足りない場合は管理フォルダを再列挙する',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');});p.request=async()=>({json:async()=>({responses:[{id:'1',status:200,body:{id:'meta',name:'.mojigoto',folder:{childCount:2},parentReference:{id:'work'},children:[]}}]})});
 let listed='';p.listChildren=async id=>{listed=id;return [{id:'settings',name:'work.json',file:{}}];};
 assert.equal((await p.inspectReferenceFolders([{id:'work'}])).get('work').children[0].id,'settings');assert.equal(listed,'meta');
});
test('404・権限拒否・不完全な展開・別作品の返答は成功した候補に混ぜず通常探索へ渡す',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');});
 const folders=['ok','missing','denied','incomplete','wrong'].map(id=>({id}));
 p.request=async()=>({json:async()=>({responses:folders.map((f,i)=>({id:String(i+1),status:i===1?404:i===2?403:200,body:{id:'meta-'+f.id,name:'.mojigoto',folder:{},parentReference:{id:i===4?'another':f.id},...(i===3?{}:{children:[]})}}))})});
 assert.deepEqual([...(await p.inspectReferenceFolders(folders)).keys()],['ok']);
});
test('一括展開の通信失敗と続きを取得できないフォルダは通常探索へ戻す',async()=>{
 const p=new OneDriveProvider({},async()=>{throw Error('外部通信禁止');});p.request=async()=>{throw Error('batch failed');};assert.equal((await p.inspectReferenceFolders([{id:'work'}])).size,0);
 p.request=async url=>{if(url==='/next')throw Error('page failed');return {json:async()=>({responses:[{id:'1',status:200,body:{id:'meta',name:'.mojigoto',folder:{},parentReference:{id:'work'},children:[],'children@odata.nextLink':'/next'}}]})};};
 assert.equal((await p.inspectReferenceFolders([{id:'work'}])).size,0);
});
