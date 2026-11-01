import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const guide = await readFile(new URL("../web/guide.html", import.meta.url), "utf8");
function appFunction(name) {
  const start = app.indexOf(`function ${name}(`), end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}

test("全体未設定では従来の方向別許可を保持し、自動保存の設定と混ぜない", () => {
  const storage = new Map();
  const context = vm.createContext({ localStorage: { getItem: key => storage.get(key) ?? null } });
  const keys = app.match(/const NOTE_AUTO_REFLECT_KEY = [^;]+;\s*const CONCEPT_AUTO_REFLECT_KEY = [^;]+;/)[0];
  const note = app.match(/noteToConceptAutoReflect: ([^\n]+),/)[1];
  const concept = app.match(/conceptToNoteAutoReflect: ([^\n]+),/)[1];
  vm.runInContext(keys, context);
  const initialize = () => vm.runInContext("var state = { autoSaveEnabled: false, noteToConceptAutoReflect: " + note + ", conceptToNoteAutoReflect: " + concept + " }", context);
  initialize();
  assert.equal(context.state.noteToConceptAutoReflect, true);
  storage.set("mojigoto.web.noteToConceptAutoReflect", "false"); initialize();
  assert.equal(context.state.noteToConceptAutoReflect, false);
  assert.equal(context.state.conceptToNoteAutoReflect, true);
  assert.equal(context.state.autoSaveEnabled, false);
});

test("各編集画面の歯車から保存ガイドへ、原稿・ノートから読込ガイドへ移動できる", () => {
  for (const id of ["readerSection", "noteEditorSection", "conceptMemoEditorSection", "workSettingsSection"]) {
    const start = html.indexOf(`<section id="${id}"`), section = html.slice(start, html.indexOf("</section>", start));
    assert.match(section, /class="editor-options-panel"/); assert.match(section, /data-editor-guide="guide-(?:saving|auto-reflect)"/);
    if (["readerSection", "noteEditorSection"].includes(id)) assert.match(section, /data-editor-guide="guide-file-import"/);
    assert.doesNotMatch(section, /自動保存とは別なので/);
  }
  for (const source of [html, guide]) {
    assert.match(source, /自動保存とは別なので/); assert.match(source, /手動保存時に自動反映/);
    for (const phrase of ["原本を開く", "新しいコピーを作成", "既存ノートに上書き", "note-images", "呼び名一覧", "連携ID・自動反映設定"]) assert.ok(source.includes(phrase), phrase);
  }
});

test("編集中の下書きを変えず画面内ガイドの該当箇所を開く", () => {
  const opened = [], appGuideContent = { hidden: true, querySelector: () => target };
  const details = { tagName: "DETAILS", open: false, parentElement: appGuideContent };
  let scrolled = false;
  const target = { tagName: "H3", parentElement: details, scrollIntoView: () => { scrolled = true; } };
  const elements = { settingsDialog: { open: false }, loginGate: { hidden: true }, loginGuideContent: {}, appGuideContent,
    guideDialog: { open: false, showModal() { this.open = true; } } };
  const state = { dirty: true, draft: "未保存の入力" };
  const context = vm.createContext({ state, elements, closeHeaderMenu() {}, closeEditorOptions() {}, guideWindow: null,
    window: { open: (...args) => { opened.push(args); return { focus() {} }; } } });
  vm.runInContext(appFunction("openGuide"), context);
  context.window.open = () => { throw new Error("別ウィンドウを開かない"); };
  context.openGuide("guide-auto-reflect"); assert.equal(elements.guideDialog.open, true); assert.equal(details.open, true); assert.equal(scrolled, true);
  assert.equal(state.dirty, true); assert.equal(state.draft, "未保存の入力"); assert.equal(opened.length, 0);
});

test("ガイドの直接リンクで閉じた詳細を開き、該当見出しまで移動する", async () => {
  const script = await readFile(new URL("../web/guide.mjs", import.meta.url), "utf8");
  const details = { tagName: "DETAILS", open: false, parentElement: null }; let scrolled = 0;
  const heading = { tagName: "H3", parentElement: details, scrollIntoView() { scrolled++; } };
  const context = vm.createContext({ location: { hash: "#guide-auto-reflect" }, document: { getElementById: (id) => id === "guide-auto-reflect" ? heading : null }, requestAnimationFrame: (callback) => callback() });
  vm.runInContext(script.slice(script.indexOf("function showGuideSection("), script.indexOf('document.querySelectorAll(')), context);
  context.showGuideSection(); assert.equal(details.open, true); assert.equal(scrolled, 1);
  context.showGuideSection("#missing"); assert.equal(scrolled, 1);
});
