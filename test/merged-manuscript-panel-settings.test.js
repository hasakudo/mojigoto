const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../src/export/merged-manuscript-panel-settings");
const {
  MERGED_MANUSCRIPT_BROWSER_PANEL_STATE_KEY: KEY,
  readMergedManuscriptBrowserPanelState: read,
  writeMergedManuscriptBrowserPanelState: submit,
  updatePersistedPanelUiState: updateUi,
} = settings;

function store(initial, {failRead=false, failWrite=false}={}) {
  let value=initial;
  const updates=[];
  const context={workspaceState:{get(key) {
    assert.equal(key,KEY);
    if(failRead) throw Error("read failed");
    return value;
  }, async update(key,next) {
    assert.equal(key,KEY);
    if(failWrite) throw Error("write failed");
    updates.push(structuredClone(next)); value=next;
  }}};
  return {context,updates,get value(){return value;}};
}
function previous() {
  return {exportMode:"real",realPrintPageSize:"a5",realPrintColumnMode:"two",rootExtra:"keep-ui-only",
    simple:{currentLayoutMode:"2up",simpleExtra:"keep",byLayout:{single:{charsPerLine:31},"2up":{charsPerLine:40}}},
    realBySize:{"a5:single":{realPrintFontSizePt:8},"a5:two":{realPrintFontSizePt:9,oldExtra:true},"b6:single":{realPrintFontSizePt:10}}};
}

test("保存キーを維持し、読み込みの欠落・不正値・失敗を従来どおり扱う", () => {
  assert.equal(KEY,"mojigoto.mergedManuscriptBrowserPanelState");
  for(const value of [undefined,null,false,1,"bad"]) assert.equal(read(store(value).context),null);
  const saved=previous(); assert.equal(read(store(saved).context),saved);
  assert.equal(read({}),null); assert.equal(read(store({}, {failRead:true}).context),null);
});

test("判型と段組のキーを補正し、保存済みデータから取り出すモードも維持する", () => {
  for(const size of ["a5","a6","b6","shiroku","shinsho","unknown"]) {
    const normalized=size==="unknown"?"b6":size;
    const mode=["a5","shinsho"].includes(size)?"two":"single";
    assert.equal(settings.getRealPrintStateKey(` ${size.toUpperCase()} `," TWO "),`${normalized}:${mode}`);
    const restored=settings.normalizePersistedPanelState({exportMode:" REAL ",realPrintPageSize:size,realPrintColumnMode:"two",punctuationLayoutMode:" PUSHOUT ",useTypographyAdjustments:false});
    assert.equal(restored.realPrintPageSize,normalized); assert.equal(restored.realPrintColumnMode,mode);
    assert.equal(restored.exportMode,"real"); assert.equal(restored.punctuationLayoutMode,"hanging");
    assert.equal(restored.useTypographyAdjustments,false);
  }
  assert.equal(settings.normalizeSimpleLayoutKey("2up"),"2up");
  assert.equal(settings.normalizeSimpleLayoutKey("2UP"),"single");
});

test("画面操作中は受け取った版組マップをマージし、他の設定と入力を保つ", async () => {
  const initial=previous(), before=structuredClone(initial), h=store(initial);
  const input={exportMode:" REAL ",realPrintPageSize:" SHINSHO ",realPrintColumnMode:" TWO ",
    htmlPrintLayoutMode:"single",punctuationLayoutMode:"pushout",useTypographyAdjustments:false,
    simpleSavedByLayout:{single:{charsPerLine:33}},realPrintSavedBySize:{"shinsho:two":{realPrintFontSizePt:11}}};
  const inputBefore=structuredClone(input);
  await updateUi(h.context,input);
  assert.equal(h.updates.length,1); assert.equal(h.value.rootExtra,"keep-ui-only");
  assert.equal(h.value.exportMode,"real"); assert.equal(h.value.realPrintPageSize,"shinsho");
  assert.equal(h.value.realPrintColumnMode,"two"); assert.equal(h.value.useTypographyAdjustments,false);
  assert.equal(h.value.simple.currentLayoutMode,"single"); assert.equal(h.value.simple.simpleExtra,"keep");
  assert.deepEqual(h.value.simple.byLayout,{single:{charsPerLine:33},"2up":{charsPerLine:40}});
  assert.deepEqual(h.value.realBySize,{...before.realBySize,"shinsho:two":{realPrintFontSizePt:11}});
  assert.deepEqual(initial,before); assert.deepEqual(input,inputBefore);
});

test("画面から版組マップが届かない場合は保持し、版組未指定なら直前の選択を使う", async () => {
  const h=store(previous()), initial=h.value;
  await updateUi(h.context,{exportMode:"simple"});
  assert.equal(h.value.simple,initial.simple); assert.equal(h.value.realBySize,initial.realBySize);
  await updateUi(h.context,{simpleSavedByLayout:{single:{linesPerPage:19}},realPrintSavedBySize:"invalid"});
  assert.equal(h.value.simple.currentLayoutMode,"2up");
  assert.deepEqual(h.value.simple.byLayout.single,{linesPerPage:19});
  assert.equal(h.value.realBySize,initial.realBySize);
});

test("書き出し時は現在の版組を確定し、別版組・別判型の設定を維持する", async () => {
  const initial=previous(), before=structuredClone(initial), h=store(initial);
  const input={exportMode:"real",realPrintPageSize:" A5 ",realPrintColumnMode:"two",realPrintFontSizePt:10.5,
    realPrintMarginTopMm:24,realPrintMirrorMargins:false,realPrintPageNumberStart:7,
    realPrintBookOptionsEnabled:true,htmlPrintLayoutMode:"single",htmlPrintOrientation:"landscape",
    printFontSizePt:11.25,charsPerLine:38,linesPerPage:20,useTypographyAdjustments:false,punctuationLayoutMode:"pushout",
    previewChapterId:"第2章",simpleSavedByLayout:{"2up":{charsPerLine:999}},realPrintSavedBySize:{"b6:single":{realPrintFontSizePt:999}}};
  await submit(h.context,input);
  assert.equal(h.value.simple.simpleExtra,"keep"); assert.equal(h.value.simple.currentLayoutMode,"single");
  assert.deepEqual(h.value.simple.byLayout["2up"],before.simple.byLayout["2up"]);
  assert.equal(h.value.simple.byLayout.single.charsPerLine,38);
  assert.equal(h.value.simple.byLayout.single.printFontSizePt,11.25);
  assert.equal(h.value.simple.byLayout.single.printFontSizePx,15);
  assert.equal(h.value.simple.byLayout.single.htmlPrintOrientation,"landscape");
  assert.deepEqual(h.value.realBySize["a5:single"],before.realBySize["a5:single"]);
  assert.deepEqual(h.value.realBySize["b6:single"],before.realBySize["b6:single"]);
  const current=h.value.realBySize["a5:two"];
  assert.equal(current.realPrintFontSizePt,10.5); assert.equal(current.realPrintMarginTopMm,24);
  assert.equal(current.realPrintMirrorMargins,false); assert.equal(current.realPrintPageNumberStart,7);
  assert.equal(current.realPrintBookOptionsEnabled,true); assert.equal(Object.hasOwn(current,"oldExtra"),false);
  for(const key of ["rootExtra","previewChapterId","simpleSavedByLayout","realPrintSavedBySize"]) assert.equal(Object.hasOwn(h.value,key),false,key);
  assert.deepEqual(initial,before);
});

test("通常・二面・実寸二段を続けて確定しても以前の設定を上書きしない", async () => {
  const h=store(undefined);
  await submit(h.context,{htmlPrintLayoutMode:"single",charsPerLine:32,realPrintPageSize:"b6",realPrintFontSizePt:9});
  await submit(h.context,{htmlPrintLayoutMode:"2up",charsPerLine:40,realPrintPageSize:"a5",realPrintColumnMode:"two",realPrintFontSizePt:11});
  await submit(h.context,{htmlPrintLayoutMode:"single",charsPerLine:33,realPrintPageSize:"shinsho",realPrintColumnMode:"two",realPrintFontSizePt:12});
  assert.equal(h.value.simple.byLayout.single.charsPerLine,33);
  assert.equal(h.value.simple.byLayout["2up"].charsPerLine,40);
  assert.equal(h.value.realBySize["b6:single"].realPrintFontSizePt,9);
  assert.equal(h.value.realBySize["a5:two"].realPrintFontSizePt,11);
  assert.equal(h.value.realBySize["shinsho:two"].realPrintFontSizePt,12);
});

test("保存環境がなければ処理せず、保存失敗は呼び出し元へ返す", async () => {
  for(const save of [submit,updateUi]) {
    assert.equal(await save(undefined,{}),undefined); assert.equal(await save({},{}),undefined);
    const h=store(previous(),{failWrite:true}), before=structuredClone(h.value);
    await assert.rejects(save(h.context,{}),/write failed/);
    assert.deepEqual(h.value,before); assert.deepEqual(h.updates,[]);
  }
  // 読込時の例外を吸収するのは書き出し時のみ。画面操作側の既存挙動も維持する。
  const readFailure=store({}, {failRead:true});
  await submit(readFailure.context,{}); assert.equal(readFailure.updates.length,1);
  await assert.rejects(updateUi(store({}, {failRead:true}).context,{}),/read failed/);
});
