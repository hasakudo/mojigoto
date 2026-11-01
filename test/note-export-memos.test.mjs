import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { readTemplateFile } from "../web/lib/template-import.mjs";
const require = createRequire(import.meta.url);
const memo = require("../src/export/note-memo-export");
const parser = require("../src/import/note-markdown-import");
const { createSingleExportFormatters } = require("../src/export/single-export-formatters");
const { createBundleExportFormatters } = require("../src/export/bundle-export-formatters");
const {escapeHtml} = require("../src/core/path-utils");
const single = fs.readFileSync(new URL("../src/export/export-service.js",import.meta.url),"utf8");
const bundle = fs.readFileSync(new URL("../src/export/export-bundle-service.js",import.meta.url),"utf8");
function fn(source,name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`,"m").exec(source).index;
  const end = /\r?\n}\r?\n/.exec(source.slice(start));
  return source.slice(start,start+end.index+end[0].length);
}
function context() {
  const environment={getEffectiveExportOptions:settings=>settings.exportOptions||{},getGenreDisplayText:settings=>settings.genre||""};
  const singleFormats=createSingleExportFormatters(environment),bundleFormats=createBundleExportFormatters(environment);
  const noteFormats=singleFormats.getFormatters("plot");
  const ctx = vm.createContext({...memo,...singleFormats,...bundleFormats,escapeHtml,path,
    formatNoteTxt:noteFormats.txt,formatNoteMd:noteFormats.md,formatNoteCsv:noteFormats.csv,formatNoteHtml:noteFormats.html});
  vm.runInContext(fn(single,"exportTreeItem"),ctx);
  vm.runInContext(["exportViewBundle","exportTargetWorkBundle","exportNoteTypeBundle"].map(name=>fn(bundle,name)).join("\n"),ctx);
  return ctx;
}
function note() {
  return {title:"項目メモのあるノート",updatedAt:"today",groups:[{title:"大分類",items:[
    {kind:"divider",label:"区分",value:"補足"},
    {id:"a",kind:"entry",heading:"項目",body:"詳細本文",memo:{type:"list",body:"メモの一行目\n\n\n### メモ内の見出し\n~~~\n｜国《くに》\n<script>文字列</script>\n",tags:["資料","<タグ>","引用\""],linkedConceptMemoIds:["private-id"],autoSyncToConceptMemoOverride:true}},
    {id:"b",kind:"entry",heading:"タグだけ",body:"",memo:{body:"",tags:["タグのみ"]}},
    {id:"c",kind:"entry",heading:"メモなし",body:"内容"},
  ]}]};
}

test("通常Markdownから本文と項目メモ・形式・タグを分けて読み戻し、同期情報を持ち込まない",()=>{
  const ctx=context(), original=note(), markdown=ctx.formatNoteMd(original);
  assert.doesNotMatch(markdown,/private-id|autoSync|linkedConcept/);
  const parsed=parser.parseMarkdownImport(markdown);
  assert.equal(parsed.previewData.counts.entries,3);
  assert.equal(parsed.previewData.counts.dividers,1);
  const imported=parsed.parsedNote.groups[0].items[1];
  assert.equal(imported.body.trimEnd(),"詳細本文");
  assert.equal(imported.memo.body,original.groups[0].items[1].memo.body);
  assert.equal(imported.memo.type,"list");
  assert.deepEqual(imported.memo.tags,original.groups[0].items[1].memo.tags);
  assert.deepEqual(imported.memo.linkedConceptMemoIds,[]);
  assert.equal(imported.memo.autoSyncToConceptMemoOverride,false);
  assert.equal(parsed.previewData.preview.groups[0].items[1].memo.body,imported.memo.body);
  assert.deepEqual(parsed.parsedNote.groups[0].items[2].memo.tags,["タグのみ"]);
  assert.equal(parsed.parsedNote.groups[0].items[3].memo,undefined);
});

test("項目追加用の読込とWebの通常Markdown読込にも同じ項目メモが渡る",async()=>{
  const ctx=context(), markdown=ctx.formatNoteMd(note());
  const entries=parser.parseMarkdownEntriesImport("### 項目\n本文\n\n"+memo.formatItemMemoMarkdown(note().groups[0].items[1].memo));
  assert.equal(entries.entries.length,1);
  assert.equal(entries.entries[0].body,"本文");
  assert.equal(entries.entries[0].memo.type,"list");
  const content=await readTemplateFile({name:"ノート.md",size:Buffer.byteLength(markdown),arrayBuffer:async()=>new TextEncoder().encode(markdown)},"note");
  assert.equal(content.note.groups[0].items[1].memo.body,note().groups[0].items[1].memo.body);
  assert.equal(content.note.groups[0].items[1].memo.autoSyncToConceptMemoOverride,false);
});

test("通常コード内の目印や壊れたメモ形式を勝手に消さず、破損は警告する",()=>{
  const encoded=memo.formatItemMemoMarkdown({body:"メモ",tags:[]});
  const literal=parser.parseMarkdownImport("# 分類\n### 項目\n``````\n"+encoded+"\n``````");
  assert.equal(literal.parsedNote.groups[0].items[0].memo,undefined);
  assert.match(literal.parsedNote.groups[0].items[0].body,/mojigoto-item-memo/);
  for(const block of [encoded.replace('"type":"text"','"type":"unknown"'),encoded.replace(/\n~~~$/,"")]) {
    const parsed=parser.parseMarkdownImport("# 分類\n### 項目\n"+block);
    assert.match(parsed.parsedNote.groups[0].items[0].body,/mojigoto-item-memo/);
    assert.ok(parsed.previewData.warnings.some(w=>w.code==="INVALID_ITEM_MEMO"));
  }
});

test("HTMLは指定したときだけメモ・タグを出力し、ルビ変換とHTMLの無害化を行う",()=>{
  const ctx=context(), original=note();
  const omitted=ctx.formatNoteHtml(original);
  assert.doesNotMatch(omitted,/メモの一行目|タグのみ|aria-label="項目メモ"/);
  const included=ctx.formatNoteHtml(original,{includeItemMemos:true});
  assert.match(included,/メモの一行目/); assert.match(included,/<ruby>国/);
  assert.match(included,/#&lt;タグ&gt;/); assert.match(included,/&lt;script&gt;/);
  assert.doesNotMatch(included,/<script>|private-id/);
  for(const options of [{},{includeItemMemos:true}]) {
    const work=ctx.buildBundleHtml({title:"作品",settings:null,plotNotes:[original],referenceNotes:[]},options);
    const notes=ctx.buildNoteTypeBundleHtml({title:"作品",noteType:"plot",notes:[original]},options);
    for(const html of [work,notes]) assert.equal(html.includes('aria-label="項目メモ"'),options.includeItemMemos===true);
  }
});

test("テキスト・CSVとまとめ書き出しにもメモを含め、入力データは変更しない",()=>{
  const ctx=context(), original=note(), before=JSON.stringify(original);
  const bundle={title:"作品",noteType:"reference",notes:[original]};
  for(const output of [ctx.formatNoteTxt(original),ctx.formatNoteCsv(original),ctx.buildNoteTypeBundleTxt(bundle),ctx.buildNoteTypeBundleMd(bundle)]) {
    assert.match(output,/メモの一行目/); assert.match(output,/タグのみ/); assert.doesNotMatch(output,/private-id/);
  }
  assert.match(ctx.formatNoteCsv(original),/項目メモ,項目メモのタグ/);
  assert.equal(JSON.stringify(original),before);
});

test("HTMLの含める・含めない・取消を単体と3種のまとめ書き出しへ反映する",async()=>{
  for(const action of [true,false,undefined]) for(const kind of ["single","view","work","type"]) {
    const ctx=context(), writes=[],dirs=[], original=note();
    Object.assign(ctx,{vscode:{window:{showQuickPick:async()=>action===undefined?undefined:{value:action},showInformationMessage:async()=>undefined}},
      fs:{writeFile:async(...args)=>writes.push(args)},pickFormat:async()=>"html",loadSourceData:async()=>({sourceType:"plot",title:"ノート",data:original}),
      resolveExportDir:async()=>{dirs.push("dir");return "/exports";},sanitizeFileName:v=>v,buildSingleExportFileName:()=>"note.html",
      pickBundleFormat:async()=>"html",pickIncludeSettings:async()=>false,pickBundleMode:async()=>"all",normalizeViewBundleItem:item=>item,
      pickPlotNotes:async()=>[],pickReferenceNotes:async()=>[],loadBundleData:async()=>({title:"作品",settings:null,plotNotes:[original],referenceNotes:[],allPlotNotesMeta:[],allReferenceNotesMeta:[]}),
      loadNoteTypeBundleData:async()=>({title:"作品",notes:[original],allMetas:[{}],noteType:"plot"}),
      resolveViewBundleExportDir:async()=>{dirs.push("dir");return "/exports";},resolveTargetBundleExportDir:async()=>{dirs.push("dir");return "/exports";},buildStableBundleFileName:()=>"bundle.html"});
    const item={fsPath:"/work",workDir:"/work"};
    if(kind==="single")await ctx.exportTreeItem({},item);
    else if(kind==="view")await ctx.exportViewBundle({},item);
    else if(kind==="work")await ctx.exportTargetWorkBundle({},item);
    else await ctx.exportNoteTypeBundle({},item,"plot");
    assert.equal(writes.length,action===undefined?0:1);
    assert.equal(dirs.length,action===undefined?0:1);
    if(writes.length)assert.equal(writes[0][1].includes('aria-label="項目メモ"'),action);
  }
});

test("メモのないHTMLでは追加選択を出さず、通常の本文だけを書き出す",async()=>{
  assert.equal(await memo.pickIncludeNoteMemos({window:{showQuickPick(){throw Error("不要な選択");}}},[{groups:[{items:[{kind:"entry",body:"本文"}]}]}]),false);
});

test("選択挿入の項目・大分類でもメモを保持し、新しいIDと同期OFFを使う",()=>{
  const ctx={...require("../src/views/note-webview/item-operations"), ...require("../src/import/note-import-preview")};
  const original=note(), body=original.groups[0].items[1].memo.body;
  assert.equal(ctx.flattenSourceEntries(original)[0].memo.body,body);
  const entry=ctx.flattenSourceInsertables(original).find(item=>item.sourceType==="entry");
  assert.equal(entry.memo.body,body);
  const target={groups:[{id:"target",items:[]}]};
  ctx.insertItemAtPosition(target,"target",0,original.groups[0].items[1]);
  const inserted=target.groups[0].items[0];
  assert.notEqual(inserted.id,original.groups[0].items[1].id);
  assert.equal(inserted.memo.body,body);
  assert.equal(inserted.memo.autoSyncToConceptMemoOverride,false);
  assert.equal(inserted.memo.linkedConceptMemoIds.length,0);
  ctx.insertGroupAtPosition(target,1,original.groups[0]);
  assert.equal(target.groups[1].items[1].memo.body,body);
  ctx.replaceItemBody(target,"target",inserted.id,"本文のみの上書き");
  assert.equal(inserted.memo.body,body);
});

test("メモ付きの通常読込画面・選択読込画面の生成スクリプトが有効で、プレビューにメモを示す",()=>{
  const preview=parser.parseMarkdownImport(context().formatNoteMd(note()));
  for(const name of ["note-import-webview","note-partial-import-webview"]) {
    const { loadViewModule } = require("./fixtures/note-import-harness.cjs");
    const view = loadViewModule(name.replace("-webview", "-html"), { "../core/path-utils": { getNonce: () => "test", escapeHtml } });
    const functionName=name==="note-import-webview"?"getImportHtml":"getHtml";
    const html=view[functionName]({noteType:"plot",parsedNote:preview.parsedNote,previewData:preview.previewData});
    assert.doesNotThrow(()=>new vm.Script(html.match(/<script nonce="test">([\s\S]*?)<\/script>/)[1]));
    assert.match(html,/項目メモ/);
  }
});
