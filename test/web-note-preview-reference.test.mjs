import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { normalizeNote, NOTE_TYPES } from "../web/lib/notes.mjs";
import { parseNoteInline } from "../web/lib/note-inline.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function fn(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
class Node {
  constructor(tag = "div", className = "", textContent = "") {
    Object.assign(this, {tag,className,textContent,children:[],listeners:{},value:"",open:false,scrollTop:0});
    this.classList = {toggle() {}};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  setAttribute() {}
  querySelectorAll() { return this.children.filter(child => child.tag === "details"); }
  show() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  get childElementCount() { return this.children.length; }
}
const all = node => [node,...node.children.flatMap(all)];
const text = node => [node.textContent,...node.children.map(text)].join(" ");
const entry = (id, type = "plot", title = id) => ({item:{id,name:`${id}.json`}, data:normalizeNote({id,type,title,groups:[
  {id:`${id}-group`,title:"大分類",items:[{id:`${id}-item`,heading:"項目",headingRuby:"こうもく",body:"｜本文《ほんぶん》",memo:{body:"参照メモ"}}]},
]},type)});

function harness() {
  const own = entry("own", "plot", "編集中の下書き");
  const elements = Object.fromEntries(["notePreviewButton","closeNotePreviewButton","notePreviewDialog","notePreviewTitle",
    "notePreviewTypeSelect","notePreviewSelect","notePreviewHelp","notePreviewContent","noteToc","noteTocToggle"]
    .map(id => [id,new Node()]));
  const state = {currentNote:own,selectedWork:{id:"work",mojigoto:{id:"meta"}},noteType:"plot",dirty:true,
    notePreviewOwner:null,notePreviewEntries:[],notePreviewReferenceId:"",notePreviewLoadToken:0,
    noteEntriesCache:new Map(),noteFolders:{plot:{id:"plots"},reference:{id:"references"}}};
  const writes = [], reads = [];
  const rows = {plots:[own,entry("other")],references:[entry("reference-a","reference"),entry("reference-b","reference")]};
  state.provider = {
    listChildren:async id => { reads.push(id); return (rows[id] || []).map(row => ({...row.item,file:{}})); },
    readText:async item => JSON.stringify(Object.values(rows).flat().find(row => row.item.id === item.id).data),
    createFolder:async () => { writes.push("folder"); throw Error("参照で作成してはいけない"); },
  };
  const context = {state,elements,NOTE_TYPES,normalizeNote,parseNoteInline,VIEW_CACHE_DURATION:30000,
    Option:function(title,value) { const option = new Node("option","",title); option.value = value; return option; },
    makeElement:(...args) => new Node(...args),document:{createTextNode:value => new Node("text","",value)},
    requestAnimationFrame() {},moveToNotePreviewTarget() {},
    showLoading:(root,message) => root.replaceChildren(new Node("p","",message)),
    showEmpty:(root,message) => root.replaceChildren(new Node("p","",message)),
  };
  vm.createContext(context);
  vm.runInContext(["readerNoteReferenceKey","sortNoteEntries","ensureNoteFolder","readNoteEntry","loadNoteEntriesForType",
    "appendNoteInline","notePreviewHeading","renderReaderNoteReference","isNotePreviewOwnerCurrent",
    "renderNotePreviewReference","loadNotePreviewReferences","openNotePreview"].map(fn).join("\n"),context);
  const start = app.indexOf('elements.notePreviewButton.addEventListener("click",');
  vm.runInContext(app.slice(start,app.indexOf('elements.closeAddressBookButton.addEventListener',start)),context);
  context.openNotePreview();
  return {context,state,elements,own,writes,reads,rows,kind(type) { elements.notePreviewTypeSelect.value = type; elements.notePreviewTypeSelect.listeners.change(); }};
}

test("編集中は通信せず、他ノートの種類・選択を変えても下書きを保存・変更しない", async () => {
  const h = harness(), before = JSON.stringify(h.own);
  assert.deepEqual(h.reads, []);
  assert.match(text(h.elements.notePreviewContent), /項目/);
  h.elements.notePreviewTypeSelect.value = "plot";
  await h.context.loadNotePreviewReferences();
  assert.deepEqual(h.elements.notePreviewSelect.children.map(option => option.value), ["other"]);
  assert.equal(h.elements.notePreviewDialog.open, true);
  assert.equal(h.elements.notePreviewTitle.textContent, "other");
  const rows = all(h.elements.notePreviewContent).filter(node => node.className.startsWith("note-preview-item"));
  assert.ok(rows.some(node => node.tag === "article"));
  assert.equal(rows.some(node => node.listeners.click), false);
  assert.ok(all(h.elements.notePreviewContent).some(node => node.tag === "rt" && node.textContent === "こうもく"));
  assert.match(text(h.elements.notePreviewContent), /参照メモ/);
  h.elements.notePreviewTypeSelect.value = "reference";
  await h.context.loadNotePreviewReferences();
  h.elements.notePreviewSelect.value = "reference-b";
  h.elements.notePreviewSelect.listeners.change();
  assert.equal(h.elements.notePreviewTitle.textContent, "reference-b");
  assert.equal(h.state.currentNote, h.own);
  assert.equal(h.state.noteType, "plot");
  assert.equal(h.state.dirty, true);
  assert.equal(JSON.stringify(h.own), before);
  assert.deepEqual(h.writes, []);
  h.kind("current");
  assert.equal(h.elements.notePreviewTitle.textContent, "編集中の下書き");
  assert.ok(all(h.elements.notePreviewContent).some(node => node.tag === "button" && node.listeners.click));
});

test("他ノート参照中の編集・保存更新で参照先と表示位置を戻さない", async () => {
  const h = harness();
  h.elements.notePreviewTypeSelect.value = "reference";
  await h.context.loadNotePreviewReferences();
  h.elements.notePreviewSelect.value = "reference-b";
  h.elements.notePreviewSelect.listeners.change();
  h.elements.notePreviewContent.scrollTop = 160;
  h.elements.notePreviewContent.children[0].open = false;
  h.state.currentNote = {...h.own,data:{...h.own.data,title:"編集中の新しい題名"}};
  h.context.openNotePreview({refresh:true});
  assert.equal(h.elements.notePreviewTitle.textContent, "reference-b");
  assert.equal(h.elements.notePreviewContent.scrollTop, 160);
  assert.equal(h.elements.notePreviewContent.children[0].open, false);
  h.kind("current");
  assert.equal(h.elements.notePreviewTitle.textContent, "編集中の新しい題名");
});

test("種類変更・編集中へ戻る・閉じる・作品や編集ノートの切替後に古い応答を表示しない", async () => {
  for (const change of [
    h => h.kind("current"),
    h => { h.elements.notePreviewTypeSelect.value = "plot"; },
    h => h.elements.notePreviewDialog.close(),
    h => { h.state.selectedWork = {id:"other-work"}; },
    h => { h.state.provider = {}; },
    h => { h.state.currentNote = entry("another"); },
  ]) {
    const h = harness();
    let resolve;
    h.context.loadNoteEntriesForType = () => new Promise(done => { resolve = done; });
    h.elements.notePreviewTypeSelect.value = "reference";
    const loading = h.context.loadNotePreviewReferences();
    change(h);
    const before = text(h.elements.notePreviewContent);
    resolve([entry("late","reference")]);
    await loading;
    assert.equal(text(h.elements.notePreviewContent), before);
    assert.equal(h.state.notePreviewEntries.length, 0);
  }
});

test("連打で返答順が逆でも最後の種類だけを表示し、別ノートでは編集中へ戻す", async () => {
  const h = harness(), pending = [];
  h.context.loadNoteEntriesForType = () => new Promise(resolve => pending.push(resolve));
  h.elements.notePreviewTypeSelect.value = "plot";
  const first = h.context.loadNotePreviewReferences();
  h.elements.notePreviewTypeSelect.value = "reference";
  const second = h.context.loadNotePreviewReferences();
  pending[1]([entry("latest","reference")]); await second;
  pending[0]([entry("old")]); await first;
  assert.equal(h.elements.notePreviewTitle.textContent, "latest");
  h.state.currentNote = entry("new-editor","reference","新しい編集ノート");
  h.context.openNotePreview();
  assert.equal(h.elements.notePreviewTypeSelect.value, "current");
  assert.equal(h.elements.notePreviewTitle.textContent, "新しい編集ノート");
});

test("空一覧・通信失敗でも下書きを保ち、編集中へすぐ戻れる", async () => {
  for (const failed of [false,true]) {
    const h = harness();
    h.context.loadNoteEntriesForType = async () => { if (failed) throw Error("通信に失敗しました"); return []; };
    h.elements.notePreviewTypeSelect.value = "reference";
    await h.context.loadNotePreviewReferences();
    assert.equal(h.elements.notePreviewSelect.disabled, true);
    assert.match(text(h.elements.notePreviewContent), failed ? /通信に失敗/ : /ほかの資料はありません/);
    h.kind("current");
    assert.equal(h.elements.notePreviewTitle.textContent, "編集中の下書き");
    assert.equal(h.state.dirty, true);
  }
});

test("参照で保存先を作成せず、Google Driveの未許可は案内を表示する", async () => {
  for (const cloud of ["oneDrive","dropbox","googleDrive"]) {
    const h = harness();
    h.state.cloudKind = cloud;
    h.state.noteFolders = {};
    h.elements.notePreviewTypeSelect.value = "reference";
    await h.context.loadNotePreviewReferences();
    assert.deepEqual(h.writes, []);
    assert.match(text(h.elements.notePreviewContent), cloud === "googleDrive" ? /追加許可/ : /ほかの資料はありません/);
  }
});

test("読み取り中に作品が変わってもフォルダ一覧・ノートキャッシュを次の作品へ混ぜない", async () => {
  for (const atFolder of [false,true]) {
    const h = harness();
    if (atFolder) h.state.noteFolders = {};
    let resolve;
    h.state.provider.listChildren = () => new Promise(done => { resolve = done; });
    const loading = h.context.loadNoteEntriesForType("reference",{createFolder:false});
    await Promise.resolve();
    h.state.selectedWork = {id:"next",mojigoto:{id:"next-meta"}};
    resolve([{id:"references",name:"references",folder:{}}]);
    await assert.rejects(loading,/作品が切り替わった/);
    assert.equal(h.state.noteEntriesCache.size, 0);
    assert.equal(h.state.selectedWork.mojigotoChildren, undefined);
  }
});
