import { autoReflectSelection, setAutoReflectSelection } from "../web/lib/memo-auto-reflect.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseNoteInline } from "../web/lib/note-inline.mjs";
import { normalizeNote, createNoteEntry } from "../web/lib/notes.mjs";

const require = createRequire(import.meta.url);
const { convertNoteInlineMarkupToHtml } = require("../src/export/note-html-utils.js");
const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
function appFunction(name) {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
}
class Node {
  constructor(tag = "div", className = "", textContent = "") {
    Object.assign(this, { tag, className, textContent, children: [], dataset: {}, listeners: {}, open: false });
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  setAttribute() {}
  show() { this.open = true; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get childElementCount() { return this.children.length; }
}
const all = (node) => [node, ...node.children.flatMap(all)];
const text = (node) => [node.textContent, ...node.children.map(text)].join("");
const html = (node) => {
  const escape = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (node.tag === "text") return escape(node.textContent);
  return `<${node.tag}>${escape(node.textContent)}${node.children.map(html).join("")}</${node.tag}>`;
};
function harness() {
  const note = normalizeNote({ id: "n", title: "資料", groups: [{ id: "g", title: "人物", items: [
    { id: "i", kind: "entry", heading: "主人公", headingRuby: "しゅじんこう", body: "｜東京《とうきょう》へ\n《《出発》》", memo: { body: "漢字《かんじ》" } },
  ] }] });
  const elements = Object.fromEntries(["toggleNoteItemsButton", "toggleNoteMemosButton", "noteTitleInput", "noteEditorTypeBadge", "noteGroups", "noteToc", "noteTocToggle", "notePreviewContent", "notePreviewTitle", "notePreviewDialog", "notePreviewTypeSelect", "notePreviewSelect", "notePreviewHelp", "relatedPreviewTitle", "relatedPreviewType", "relatedPreviewPath", "relatedPreviewContent", "saveNoteButton"].map(name => [name, new Node()]));
  const state = { currentNote: { data: note }, noteDisclosure: {}, noteTocOpen: false, dirty: false, notePreviewLoadToken:0 };
  let scheduled = 0;
  const context = { autoReflectSelection, setAutoReflectSelection, state, elements, parseNoteInline, createNoteEntry,
    Option: function(text, value) { const option = new Node("option", "", text); option.value = value; return option; },
    NOTE_NAME_FIELDS: new Set(["entry-heading", "entry-heading-ruby"]),
    makeElement: (...args) => new Node(...args), document: { createTextNode: (value) => new Node("text", "", value) },
    requestAnimationFrame() {}, updateCurrentNoteGroupIndicator() {}, renderNoteToc() {}, moveToNotePreviewTarget() {},
    refreshNoteDerivedViews() {}, setNoteStatus() {}, scheduleAutoSave: () => { scheduled++; },
  };
  vm.createContext(context);
  for (const name of ["readerNoteReferenceKey", "isNotePreviewOwnerCurrent", "appendNoteInline", "notePreviewHeading", "bindNoteField", "updateNoteDisclosureButtons", "renderNoteEditor", "openNotePreview", "renderReaderNoteReference", "renderRelatedTarget", "markNoteDirty"]) vm.runInContext(appFunction(name), context);
  const start = app.indexOf('elements.noteGroups.addEventListener("input",');
  const end = app.indexOf("\n});", start) + 4;
  vm.runInContext(app.slice(start, end), context);
  return { note, state, context, elements, scheduled: () => scheduled };
}

test("ノートの明示ルビ・省略ルビ・傍点はVS Code書き出しと同じ内容になる", () => {
  const samples = ["前｜東京《とうきょう》後", "|青い空《あおいそら》", "漢字《かんじ》", "ABC《えーびーしー》", "《《重要》》", "これは《《重要》》な言葉", "一行目\n｜東京《とうきょう》"];
  const h = harness();
  for (const source of samples) {
    const node = new Node();
    h.context.appendNoteInline(node, source);
    const rendered = node.children.map(html).join("").replaceAll("<span>", '<span class="noteBouten">');
    assert.equal(rendered, convertNoteInlineMarkupToHtml(source));
  }
});

test("不完全なルビと通常の改行は入力のまま保持する", () => {
  for (const source of ["｜東京《", "漢字《》", "｜東京\n《とうきょう》", "《《未完", "普通の文章\n次の行"]) {
    assert.equal(parseNoteInline(source).map(token => token.text).join(""), source);
    assert.ok(parseNoteInline(source).every(token => token.type === "text"));
  }
});

test("項目名全体のふりがなを優先し、HTMLやスクリプトを実行用要素にしない", () => {
  const h = harness();
  const node = new Node();
  h.context.appendNoteInline(node, '<img src=x onerror=alert(1)>', '<script>よみ</script>');
  assert.equal(all(node).filter(n => n.tag === "ruby").length, 1);
  assert.equal(all(node).some(n => ["img", "script"].includes(n.tag)), false);
  assert.match(text(node), /<img.*<script>/);
  const heading = h.context.notePreviewHeading({ heading: "｜東京《とうきょう》", headingRuby: "べつのよみ" });
  assert.equal(all(heading).filter(n => n.tag === "ruby").length, 1);
  assert.equal(all(heading).find(n => n.tag === "rt").textContent, "べつのよみ");
});

test("ふりがな欄は既存値を表示し、入力と削除を同じ保存経路へ渡す", () => {
  const h = harness();
  h.context.renderNoteEditor();
  const reading = all(h.elements.noteGroups).find(node => node.dataset.noteField === "entry-heading-ruby");
  assert.equal(reading.value, "しゅじんこう");
  assert.equal(reading.autocomplete, "off");
  assert.ok(all(h.elements.noteGroups).some(node => node.textContent === "ふりがな（任意）"));
  for (const value of ["あらたなよみ", ""]) {
    reading.value = value;
    h.elements.noteGroups.listeners.input({ target: { closest: () => reading } });
    assert.equal(h.note.groups[0].items[0].headingRuby, value);
    assert.equal(h.state.dirty, true);
    assert.equal(h.elements.saveNoteButton.disabled, false);
  }
  assert.equal(h.scheduled(), 2);
  assert.equal(h.note.groups[0].items[0].heading, "主人公");
});

test("ノート・原稿横・関連リンクのプレビューで項目名と本文とメモのルビを揃える", () => {
  const h = harness();
  const roots = [h.elements.notePreviewContent, new Node(), h.elements.relatedPreviewContent];
  h.context.openNotePreview();
  h.context.renderReaderNoteReference({ data: h.note }, roots[1]);
  h.context.renderRelatedTarget({ data: h.note }, { itemId: "i" });
  for (const root of roots) {
    const readings = all(root).filter(node => node.tag === "rt").map(node => node.textContent);
    assert.deepEqual(readings, ["しゅじんこう", "とうきょう", "かんじ"]);
    assert.ok(all(root).some(node => node.className === "note-inline-emphasis" && node.textContent === "出発"));
  }
});
