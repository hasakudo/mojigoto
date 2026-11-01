const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePanelState, pxToPt } = require("../src/export/merged-manuscript-panel-state");

test("書き出し設定はVS Codeなしで補正でき、欠落時の既定値を維持する", () => {
  assert.deepEqual(normalizePanelState(), {
    format:"html", exportScopeDescription:"", previewChapters:[], htmlTarget:"browser",
    htmlDirection:"vertical", htmlShowTitle:false, htmlPageSize:"auto", htmlOrientation:"auto",
    htmlPrintLayoutMode:"single", htmlPrintOrientation:"portrait", showPageNumbers:false,
    printFontSizePt:6, printFontSizePx:14.5, printLineHeight:1.72, printMarginMm:0, printBodyPaddingPx:0,
    charsPerLine:42, linesPerPage:16, fontFamily:"serif", punctuationLayoutMode:"hanging",
    useTypographyAdjustments:true, pageSizeLabel:"auto", exportMode:"simple",
    realPrintPageSize:"b6", realPrintColumnMode:"single", realPrintColumnGapMm:0,
    realPrintFontSizePt:9, realPrintBleedMm:0, realPrintBleedMode:"all", realPrintMirrorMargins:true,
    realPrintStartPageSide:"odd", realPrintBookOptionsEnabled:false, realPrintShowPageNumber:false,
    realPrintPageNumberStart:1, realPrintShowHeading1:false, realPrintHeading1Mode:"all",
    realPrintHeaderOrder:"numberTitle", realPrintHeaderPosition:"bottom",
    realPrintMarginTopMm:22, realPrintMarginBottomMm:18, realPrintMarginRightMm:18, realPrintMarginLeftMm:14,
    realPrintCharsPerLine:42, realPrintLinesPerPage:16, realPrintMetrics:null,
    realPrintSavedBySize:{}, simpleSavedByLayout:{},
  });
});

test("数値設定の欠落・不正値・上下限と、空値をゼロへ変換する既存動作を維持する", () => {
  const fields = [
    ["printLineHeight",1.72,1.4,3], ["printMarginMm",0,0,60],
    ["charsPerLine",42,1,200], ["linesPerPage",16,1,200],
    ["realPrintColumnGapMm",0,0,30], ["realPrintFontSizePt",9,1,40],
    ["realPrintBleedMm",0,0,20], ["realPrintPageNumberStart",1,1,9999],
    ["realPrintMarginTopMm",22,0,100], ["realPrintMarginBottomMm",18,0,100],
    ["realPrintMarginRightMm",18,0,100], ["realPrintMarginLeftMm",14,0,100],
    ["realPrintCharsPerLine",42,1,200], ["realPrintLinesPerPage",16,1,200],
  ];
  for (const [key, fallback, min, max] of fields) {
    for (const input of [undefined, NaN, Infinity, -Infinity, "不正値"]) {
      assert.equal(normalizePanelState({[key]:input})[key], fallback, `${key}: ${input}`);
    }
    for (const input of [null, "", " ", -10000]) {
      assert.equal(normalizePanelState({[key]:input})[key], min, `${key}: ${input}`);
    }
    assert.equal(normalizePanelState({[key]:100000})[key], max, key);
    const middle=(min+max)/2;
    assert.equal(normalizePanelState({[key]:String(middle)})[key], middle, key);
  }
});

test("pt優先・pxからの変換と丸めを保ち、既存の補正順序を変えない", () => {
  assert.equal(pxToPt(14.5),10.9);
  for (const value of [undefined,null,0,-1,NaN,Infinity,"不正値"]) assert.equal(pxToPt(value),0);
  assert.equal(pxToPt("16"),12);
  const point=normalizePanelState({printFontSizePt:11.25,printFontSizePx:40});
  assert.equal(point.printFontSizePt,11.25); assert.equal(point.printFontSizePx,15);
  const pixel=normalizePanelState({printFontSizePx:16});
  assert.equal(pixel.printFontSizePt,12); assert.equal(pixel.printFontSizePx,16);
  const high=normalizePanelState({printFontSizePt:100});
  assert.equal(high.printFontSizePt,40); assert.equal(high.printFontSizePx,133);
  const low=normalizePanelState({printFontSizePt:1});
  assert.equal(low.printFontSizePt,6); assert.equal(low.printFontSizePx,1);
  assert.equal(normalizePanelState({printFontSizePx:100}).printFontSizePx,40);
  assert.equal(normalizePanelState({printFontSizePx:null}).printFontSizePx,8);
  assert.equal(normalizePanelState({printBodyPaddingPx:50}).printBodyPaddingPx,0);
});

test("実寸の判型と二段の組み合わせ、モード名の既存の正規化を維持する", () => {
  for (const size of ["a5","a6","b6","shiroku","shinsho"]) {
    const result=normalizePanelState({realPrintPageSize:` ${size.toUpperCase()} `, realPrintColumnMode:" TWO ", exportMode:" REAL ", punctuationLayoutMode:" PUSHOUT "});
    assert.equal(result.realPrintPageSize,size);
    assert.equal(result.realPrintColumnMode,["a5","shinsho"].includes(size)?"two":"single");
    assert.equal(result.exportMode,"real"); assert.equal(result.punctuationLayoutMode,"pushout");
  }
  const unknown=normalizePanelState({realPrintPageSize:"a4",realPrintColumnMode:"two", exportMode:"other", htmlPrintLayoutMode:"2UP", htmlPrintOrientation:"LANDSCAPE"});
  assert.equal(unknown.realPrintPageSize,"b6"); assert.equal(unknown.realPrintColumnMode,"single");
  assert.equal(unknown.exportMode,"simple"); assert.equal(unknown.htmlPrintLayoutMode,"single");
  assert.equal(unknown.htmlPrintOrientation,"portrait");
  const choices={htmlPrintLayoutMode:"2up",htmlPrintOrientation:"landscape",realPrintBleedMode:"nonSpine",
    realPrintStartPageSide:"even",realPrintHeading1Mode:"evenOnly",realPrintHeaderOrder:"titleNumber",realPrintHeaderPosition:"top"};
  const result=normalizePanelState(choices);
  for(const [key,value] of Object.entries(choices)) assert.equal(result[key],value,key);
});

test("ON/OFFは保存済み値の型を含めて従来どおりに判定する", () => {
  const initiallyOff=["showPageNumbers","realPrintBookOptionsEnabled","realPrintShowPageNumber","realPrintShowHeading1"];
  const initiallyOn=["useTypographyAdjustments","realPrintMirrorMargins"];
  for(const key of initiallyOff) for(const value of [true,false,"true","false",1,0,null]) {
    assert.equal(normalizePanelState({[key]:value})[key],value===true,key);
  }
  for(const key of initiallyOn) for(const value of [true,false,"true","false",1,0,null]) {
    assert.equal(normalizePanelState({[key]:value})[key],value!==false,key);
  }
});

test("章なし・章名・判型別の保存値を保持し、入力を書き換えたり未定義項目を取り込んだりしない", () => {
  const input={previewChapters:[{id:"",title:"章なし"},{id:2,title:'<章&"名>'}],
    simpleSavedByLayout:{single:{printMarginMm:8}}, realPrintSavedBySize:{a5_two:{realPrintFontSizePt:9}},
    realPrintMetrics:{status:"確認用"}, fontFamily:"  Yu Mincho  ",pageLabel:"A4",exportScopeDescription:"2章を出力",unexpected:"捨てる"};
  const before=structuredClone(input), result=normalizePanelState(input);
  assert.deepEqual(input,before);
  assert.deepEqual(result.previewChapters,[{id:"",title:"章なし"},{id:"2",title:'<章&"名>'}]);
  assert.notEqual(result.previewChapters,input.previewChapters);
  for(const key of ["simpleSavedByLayout","realPrintSavedBySize","realPrintMetrics"]) assert.equal(result[key],input[key]);
  assert.equal(result.fontFamily,"Yu Mincho"); assert.equal(result.pageSizeLabel,"A4");
  assert.equal(result.exportScopeDescription,"2章を出力"); assert.equal(Object.hasOwn(result,"unexpected"),false);
  const invalid=normalizePanelState({previewChapters:{},simpleSavedByLayout:"bad",realPrintSavedBySize:1,realPrintMetrics:"bad"});
  assert.deepEqual(invalid.previewChapters,[]); assert.deepEqual(invalid.simpleSavedByLayout,{});
  assert.deepEqual(invalid.realPrintSavedBySize,{}); assert.equal(invalid.realPrintMetrics,null);
});
