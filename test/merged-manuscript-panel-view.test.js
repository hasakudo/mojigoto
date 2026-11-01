const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { normalizePanelState } = require("../src/export/merged-manuscript-panel-state");
const { getPanelHtml } = require("../src/export/merged-manuscript-panel-html");
const { getPanelScript } = require("../src/export/merged-manuscript-panel-script");

test("通常・二面・各判型の画面はCSPと同じnonceのスクリプトを生成する", () => {
  const inputs=[{}, {htmlPrintLayoutMode:"2up"}, ...["a5","a6","b6","shiroku","shinsho"].map(realPrintPageSize => ({exportMode:"real",realPrintPageSize,realPrintColumnMode:"two"}))];
  for(const input of inputs) {
    const state=normalizePanelState(input),html=getPanelHtml({cspSource:"vscode-webview:"},state,state);
    const match=html.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);
    assert.ok(match); assert.ok(html.includes(`script-src 'nonce-${match[1]}'`));
    assert.match(html,/default-src 'none'; style-src vscode-webview: 'unsafe-inline'/);
    assert.doesNotMatch(html,/<script[^>]+src=/);
    assert.match(html,/id="openSimplePreviewButton"/); assert.match(html,/id="openRealPreviewButton"/);
    assert.match(html,/id="submitButton"/);
    new vm.Script(match[2]);
  }
});

test("画面の現在値とリセット値を混同せず、ホストでの単位換算も保持する", () => {
  const state=normalizePanelState({printFontSizePt:15,charsPerLine:38,linesPerPage:20,exportMode:"real",realPrintPageSize:"a5"});
  const reset=normalizePanelState({printFontSizePx:16,charsPerLine:42,linesPerPage:16,exportMode:"simple",realPrintPageSize:"b6"});
  const html=getPanelHtml({},state,reset),script=getPanelScript(state,reset);
  assert.match(html,/<input id="printFontSizePt"[^>]*value="15"/);
  const start=script.indexOf("    const defaultState = {");
  const end=script.indexOf("    let realPrintSavedBySize",start);
  assert.ok(start>=0&&end>start);
  const runtime=vm.createContext({});
  vm.runInContext(script.slice(start,end)+"\nresult=defaultState;",runtime);
  assert.equal(runtime.result.printFontSizePt,12);
  assert.equal(runtime.result.charsPerLine,42); assert.equal(runtime.result.linesPerPage,16);
  assert.equal(runtime.result.exportMode,"simple"); assert.equal(runtime.result.realPrintPageSize,"b6");
});

test("章名・対象の説明をHTMLへ安全に表示し、章なしと通常出力の切り替えを保つ", () => {
  const state=normalizePanelState({exportScopeDescription:'<章&"説明>',previewChapters:[{id:"",title:"章なし"},{id:'第"2<章',title:'<章&"名>'}]});
  const html=getPanelHtml({},state,state);
  assert.match(html,/&lt;章&amp;&quot;説明&gt;/);
  assert.match(html,/<option value="">章なし<\/option>/);
  assert.match(html,/<option value="第&quot;2&lt;章">&lt;章&amp;&quot;名&gt;<\/option>/);
  const all=normalizePanelState();
  assert.doesNotMatch(getPanelHtml({},all,all),/id="previewChapterSelect"/);
});
