import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const init = await readFile(new URL("../web/theme-init.js", import.meta.url), "utf8");
const fontFunction = app.match(/^function applyWritingFont\([^]*?\r?\n}/m)[0];
const listener = app.match(/elements\.displayWritingFontSelect\.addEventListener\("change", \(\) => \{[^]*?\r?\n}\);/)[0];
const key = "mojigoto.web.writingFont";

test("書体は明朝を既定にし、選択を保存して初期描画と再起動で同じ書体を使う", () => {
  const saved = new Map();
  const localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const boot = () => {
    const document = { documentElement: { dataset: {} } };
    vm.runInNewContext(init, { document, localStorage, matchMedia: () => ({ matches: false }) });
    return document;
  };
  const document = boot();
  const listeners = {};
  const select = { value: "", addEventListener: (name, callback) => { listeners[name] = callback; } };
  const context = vm.createContext({ document, localStorage, elements: { displayWritingFontSelect: select }, WRITING_FONT_KEY: key });
  vm.runInContext(`${fontFunction}\n${listener}\napplyWritingFont();`, context);
  assert.equal(select.value, "mincho");
  assert.equal(document.documentElement.dataset.writingFont, "mincho");
  select.value = "gothic";
  listeners.change();
  assert.equal(saved.get(key), "gothic");
  assert.equal(document.documentElement.dataset.writingFont, "gothic");
  assert.equal(boot().documentElement.dataset.writingFont, "gothic");
  select.value = "mincho";
  listeners.change();
  assert.equal(boot().documentElement.dataset.writingFont, "mincho");
  saved.set(key, "invalid-font");
  assert.equal(boot().documentElement.dataset.writingFont, "mincho");
  vm.runInContext("applyWritingFont();", context);
  assert.equal(select.value, "mincho");
});

const previewKey = "mojigoto.editor.previewFont";
const resolvePreviewFont = app.match(/^function resolveManuscriptPreviewFont\([^]*?\r?\n}/m)[0];
const applyPreviewFont = app.match(/^function applyManuscriptPreviewFont\([^]*?\r?\n}/m)[0];
const previewListener = app.match(/elements\.manuscriptPreviewFont\.addEventListener\("change", \(\) => \{[^]*?\r?\n}\);/)[0];
function previewFontFixture(saved) {
  const listeners = {}, calls = [];
  const state = { dirty: true, originalContent: "保存済みの本文" };
  const document = { documentElement: { dataset: {} } };
  const select = { value: "", addEventListener: (name, callback) => { listeners[name] = callback; } };
  const elements = { manuscriptPreviewFont: select, manuscriptPreviewDialog: { open: true }, displayWritingFontSelect: {} };
  const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const context = vm.createContext({ state, document, elements, localStorage, MANUSCRIPT_PREVIEW_FONT_KEY: previewKey, WRITING_FONT_KEY: key,
    wholeManuscriptController: { settingsChanged: () => calls.push("whole-preview") }, renderManuscriptPreview: () => calls.push("render") });
  vm.runInContext([resolvePreviewFont,applyPreviewFont,fontFunction,previewListener,
    'state.manuscriptPreviewFont = resolveManuscriptPreviewFont(localStorage.getItem(MANUSCRIPT_PREVIEW_FONT_KEY), localStorage.getItem(WRITING_FONT_KEY));',
    'applyManuscriptPreviewFont();'].join("\n"),context);
  return { state, document, elements, select, context, listeners, calls, localStorage };
}

test("原稿プレビューは初回だけ従来の書体を引き継ぎ、以後は本文の設定と再起動から独立する",()=>{
  for (const legacy of ["mincho","gothic"]) {
    const saved=new Map([[key,legacy]]);
    const f=previewFontFixture(saved);
    assert.equal(f.document.documentElement.dataset.manuscriptPreviewFont,legacy);
    assert.equal(saved.get(previewKey),legacy);
    const other=legacy==="mincho"?"gothic":"mincho";
    saved.set(key,other);
    vm.runInContext("applyWritingFont();",f.context);
    assert.equal(f.document.documentElement.dataset.writingFont,other);
    assert.equal(f.document.documentElement.dataset.manuscriptPreviewFont,legacy);
    assert.equal(previewFontFixture(saved).state.manuscriptPreviewFont,legacy);
  }
});

test("プレビューの書体変更は再描画・保持され、本文の書体や保存基準・未保存状態を変更しない",()=>{
  const saved=new Map([[key,"mincho"]]);
  const f=previewFontFixture(saved);
  f.select.value="gothic";f.listeners.change();
  assert.equal(f.state.manuscriptPreviewFont,"gothic");
  assert.equal(saved.get(previewKey),"gothic");
  assert.equal(saved.get(key),"mincho");
  assert.deepEqual(f.calls,["render","whole-preview"]);
  assert.equal(f.state.dirty,true);
  assert.equal(f.state.originalContent,"保存済みの本文");
  assert.equal(previewFontFixture(saved).state.manuscriptPreviewFont,"gothic");
});

test("不正なプレビュー書体は既存の書体へ戻し、設定の保存失敗では起動を止めない",()=>{
  const f=previewFontFixture(new Map([[previewKey,"invalid"],[key,"gothic"]]));
  assert.equal(f.state.manuscriptPreviewFont,"gothic");
  f.localStorage.setItem=()=>{throw new Error("quota");};
  assert.doesNotThrow(()=>vm.runInContext('applyManuscriptPreviewFont("mincho");',f.context));
  assert.equal(f.document.documentElement.dataset.manuscriptPreviewFont,"mincho");
});


