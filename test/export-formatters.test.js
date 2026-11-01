const test=require("node:test");
const assert=require("node:assert/strict");
const {createSingleExportFormatters}=require("../src/export/single-export-formatters");
const {createBundleExportFormatters}=require("../src/export/bundle-export-formatters");
const {createHarness,loadEnvironment}=require("./fixtures/note-export-harness.cjs");

test("整形はVS Codeなしで実行でき、単体とまとめの見出し規則を区別する",()=>{
  const environment=loadEnvironment(),single=createSingleExportFormatters(environment),bundle=createBundleExportFormatters(environment);
  const note={title:"ノート",groups:[{title:"",items:[{kind:"entry",heading:"",body:"本文"}]}]};
  const before=structuredClone(note),md=single.getFormatters("plot").md(note);
  assert.match(md,/# 無題大分類/);assert.match(md,/### 無題項目/);
  const combined=bundle.buildNoteTypeBundleMd({title:"作品",noteType:"plot",notes:[note]});
  assert.match(combined,/# 作品 プロットまとめ/);assert.match(combined,/### プロット: ノート/);
  assert.doesNotMatch(combined,/無題大分類|無題項目/);assert.deepEqual(note,before);
});

test("出力設定は呼び出し時に読み、作品ごとの指定を優先する",()=>{
  const config={exportIncludeSubtitle:false,exportIncludeMemo:false},environment=loadEnvironment(config);
  const single=createSingleExportFormatters(environment),bundle=createBundleExportFormatters(environment);
  const settings={title:"作品",subtitle:"補助",memo:"設定メモ",genres:["幻想","冒険"]};
  assert.doesNotMatch(single.formatSettingsHtml(settings),/補助|設定メモ/);
  config.exportIncludeSubtitle=true;config.exportIncludeMemo=true;
  assert.match(single.formatSettingsHtml(settings),/補助/);assert.match(single.formatSettingsHtml(settings),/設定メモ/);
  const local={...settings,exportOptions:{includeSubtitle:false,includeMemo:false}};
  assert.doesNotMatch(single.formatSettingsHtml(local),/補助|設定メモ/);
  assert.doesNotMatch(bundle.buildBundleHtml({title:"作品",settings:local,plotNotes:[],referenceNotes:[]}),/補助|設定メモ/);
  assert.match(single.formatSettingsTxt(settings),/幻想, 冒険/);
});

test("作品設定の日時・HTMLエスケープ・CSVの引用を維持する",()=>{
  const formatters=createSingleExportFormatters(loadEnvironment({exportIncludeMemo:true,exportIncludeUpdatedAt:true}));
  const settings={title:'作品,"名"',memo:'<script>文字列</script>\n次の行',updatedAt:"2026-10-19T00:12:00Z"};
  const html=formatters.formatSettingsHtml(settings),csv=formatters.formatSettingsCsv(settings);
  assert.match(html,/&lt;script&gt;文字列&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(csv,/title,"作品,""名"""/);assert.match(csv,/2026-10-19 09:12:00/);
  assert.equal(csv.startsWith("\uFEFF"),false);
});

test("実際の単体サービスを通したCSVだけにBOMを付け、公開APIと出力名を保つ",async()=>{
  for(const kind of ["single","settings"]){
    const h=createHarness({format:"csv"});await h.run(kind);
    assert.deepEqual(Object.keys(h.single).sort(),["exportTreeItem","formatSettingsCsv","formatSettingsHtml","formatSettingsMd","formatSettingsTxt"].sort());
    assert.equal(h.writes.length,1);assert.equal(h.writes[0][1][0],"\uFEFF");assert.equal(h.writes[0][2],"utf8");
    assert.match(h.writes[0][0],kind==="single"?/プロット_20261019\.csv$/:/作品_作品設定\.csv$/);
  }
});

test("各サービスの形式選択・HTMLのメモON/OFF・取消は実際の整形へ反映される",async()=>{
  for(const kind of ["single","settings","view","work","plot","reference"]) {
    for(const format of ["txt","md","html"]) {
      const h=createHarness({format,includeItemMemos:true});await h.run(kind);
      assert.equal(h.writes.length,1,`${kind}/${format}`);
      assert.equal(h.writes[0][1].startsWith("\uFEFF"),false);
      if(format==="html"&&!["settings","reference"].includes(kind))assert.match(h.writes[0][1],/aria-label="項目メモ"/);
    }
  }
  const omitted=createHarness({format:"html",includeItemMemos:false});await omitted.run("work");
  assert.doesNotMatch(omitted.writes[0][1],/aria-label="項目メモ"/);
  const canceled=createHarness({format:"html",cancelTitle:"項目メモ"});await canceled.run("work");
  assert.deepEqual(canceled.writes,[]);assert.deepEqual(canceled.events,[]);
});
