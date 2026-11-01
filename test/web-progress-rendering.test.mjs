import assert from "node:assert/strict";
import test from "node:test";
import { createProgressRendering } from "../web/lib/progress-rendering.mjs";
import { createProgressSummary } from "../web/lib/progress-summary.mjs";

function harness({ logoFails = false } = {}) {
  const texts=[],images=[]; let imageLoads=0;
  const context={beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},fill(){},stroke(){},fillRect(){},strokeRect(){},drawImage(...args){images.push(args);},
    measureText(text){return {width:[...text].length*10};},fillText(text){texts.push(text);}};
  const canvas={getContext:()=>context};
  class Image { set src(value){imageLoads++;this.source=value;if(logoFails)this.onerror();else this.onload();} }
  const state={progressSummaries:{today:{period:{date:"2026-10-27"}}}};
  const controller=createProgressRendering({state,elements:{progressShareCanvas:canvas},Image});
  const summary=createProgressSummary({date:"2026-10-27",generatedAt:"2026-10-27T00:00:00Z",workTitle:"検証作品",totalCharacters:100,dailyRecords:{"2026-10-27":{deltaTotal:12}}});
  summary.workBreakdown=[{title:"作品A",characters:5},{title:"作品B",characters:7}];summary.annualWorkBreakdown=[...summary.workBreakdown];
  return {controller,summary,canvas,texts,images,context,imageLoads:()=>imageLoads};
}

test("日別投稿文は選択項目だけを含め、対象日が今日かどうかを区別する",()=>{
  const h=harness();const text=h.controller.createProgressShareText(h.summary,{today:true,total:true});
  assert.match(text,/今日 \+12文字/);assert.match(text,/総文字数 100文字/);assert.doesNotMatch(text,/検証作品/);
  const previous={...h.summary,period:{...h.summary.period,date:"2026-10-26"}};
  assert.match(h.controller.createProgressShareText(previous,{today:true}),/当日/);
});

test("月間・年間投稿文は全作品の合計と指定した内訳を含める",()=>{
  const h=harness();
  const monthly=h.controller.createProgressShareText(h.summary,{works:true},"monthly");
  assert.match(monthly,/今月の執筆 \+12文字/);assert.match(monthly,/作品A \+5文字/);assert.match(monthly,/#もじごと/);
  const annual=h.controller.createProgressShareText(h.summary,{annualWorks:true},"annual");
  assert.match(annual,/2026年の作品全体まとめ/);assert.match(annual,/年間の執筆 \+12文字/);assert.match(annual,/作品B \+7文字/);
  assert.doesNotMatch(h.controller.createProgressShareText(h.summary,{},"annual"),/作品A/);
});

test("日別・月間・年間の描画は幅720と選択した指標・内訳・グラフを使う",async()=>{
  const h=harness();
  await h.controller.drawProgressShareImage(h.summary,{today:true,graph:true},"daily");
  assert.equal(h.canvas.width,720);assert.ok(h.texts.includes("今日"));assert.ok(h.texts.includes("直近7日の執筆"));
  h.texts.length=0;await h.controller.drawProgressShareImage(h.summary,{works:true,graph:true},"monthly");
  assert.ok(h.texts.includes("作品ごとの月間差分"));assert.ok(h.texts.includes("作品A"));
  h.texts.length=0;await h.controller.drawProgressShareImage(h.summary,{annualWorks:true,graph:true},"annual");
  assert.ok(h.texts.includes("2026年 1～12月の執筆"));assert.ok(h.texts.includes("作品ごとの年間差分"));
  assert.ok(h.canvas.height>=520);assert.equal(h.imageLoads(),1);assert.equal(h.images.length,3);
});

test("ロゴ読込失敗でも画像を作り、表示項目を外すと作品名と指標を描画しない",async()=>{
  const h=harness({logoFails:true});await h.controller.drawProgressShareImage(h.summary,{});
  assert.equal(h.images.length,0);assert.equal(h.canvas.height,520);assert.ok(!h.texts.includes("検証作品"));assert.ok(!h.texts.includes("総文字数"));
  await h.controller.drawProgressShareImage(h.summary,{});assert.equal(h.imageLoads(),1);
  const lines=h.controller.progressCanvasTextLines(h.context,"長い作品名の折り返しを確認",40,2);
  assert.equal(lines.length,2);assert.ok(lines[1].endsWith("…"));
});

test("Canvas未対応やグラフ系列の不正は呼出元へエラーを返す",async()=>{
  const h=harness();h.canvas.getContext=()=>null;
  await assert.rejects(h.controller.drawProgressShareImage(h.summary,{}),/Canvasを初期化/);
  const g=harness();await assert.rejects(g.controller.drawProgressShareImage({...g.summary,annual:null},{graph:true},"annual"),/進捗グラフを更新できません/);
});
