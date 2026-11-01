import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
import { createNote, slugifyNoteTitle, NOTE_TYPES } from "../web/lib/notes.mjs";
import { normalizeManuscriptFileName } from "../web/lib/file-names.mjs";
import { NewDocumentDraft, templatePreviewText } from "../web/lib/template-import.mjs";
import { normalizeNoteIndex, makeNoteIndexEntry } from "../web/lib/note-index.mjs";
import { inspectNoteTemplate, templateDestinations, prepareTemplateDestination, applyTemplateDestination, attachImportSource, textHash } from "../web/lib/note-template-sync.mjs";
import { templateDestinationPresentation, createTemplateComparison, templateComparisonPage } from "../web/lib/note-template-presentation.mjs";

const app = await readFile(new URL("../web/app.mjs", import.meta.url), "utf8");
const generatedFormat = createRequire(import.meta.url)("../web/lib/generated-note-markdown.js");
const fn = (name) => {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(app).index;
  const end = /\r?\n}\r?\n/.exec(app.slice(start));
  return app.slice(start, start + end.index + end[0].length);
};
class Element {
  constructor() { this.value = ""; this.listeners = {}; this.controls = []; this.children = []; this.hidden = false;
    this.classes = new Set(); this.classList = { remove: (key) => this.classes.delete(key), toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key) }; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  async emit(event, args = {}) { return this.listeners[event]?.({ preventDefault() {}, stopPropagation() {}, ...args }); }
  querySelectorAll() { return this.controls; }
  focus() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.emit("close"); }
  replaceChildren() { this.children = []; this.value = ""; }
  append(...nodes) { this.children.push(...nodes); if (this.children.length === nodes.length) this.value = nodes[0].value; }
}
function harness(kind = "note") {
  const elements = Object.fromEntries(["newNoteDialog", "newNoteForm", "newNoteTitleInput", "createNoteButton", "newNoteError", "newNoteButton", "newFileDialog", "newFileForm", "newFileNameInput", "createFileButton", "newFileError", "newFileExtension", "newFileButton"].map((id) => [id, new Element()]));
  const nodes = {};
  for (const prefix of ["newNote", "newFile"]) {
    for (const suffix of ["DialogTitle", "TitleField", "ImportResult", "ImportReplacePanel", "ImportReplaceTarget", "ImportReplaceConfirmed", "ImportInput", "ImportDropZone", "ImportClear", "ImportStatus", "ImportPreview", "ImportText", "ImportWarnings", "ImportDestinationField", "ImportDestination", "ImportChoices", "ImportComparison", "ImportComparisonSummary", "ImportComparisonRows", "ImportComparisonPage", "ImportComparisonPrevious", "ImportComparisonNext"]) nodes[prefix + suffix] = new Element();
  }
  elements.newFileExtension.value = ".txt";
  const state = { provider: {}, selectedWork: { id: "work", mojigoto: { id: "meta" }, mojigotoChildren: [] }, noteType: "plot", notes: [], noteFolders: {}, noteEntriesCache: new Map(), manuscriptFolder: { id: "manuscripts", name: "原稿" } };
  state.noteFolders.plot = { id: "plots", name: "plots" };
  const calls = { creates: [], opens: [], metrics: 0, indexes: 0, notices: [], lists: [] };
  let siblings = [];
  state.provider = { listChildren: async (id) => { calls.lists.push(id); return siblings; }, createTextFile: async (folder, name, content) => {
    const item = { id: `created-${calls.creates.length}`, name, file: {} };
    calls.creates.push({ folder, item, content }); return item;
  } };
  const documentEvents = new Element();
  const context = vm.createContext({ state, elements, NewDocumentDraft, templatePreviewText, structuredClone, createNote, NOTE_TYPES, slugifyNoteTitle, normalizeManuscriptFileName,
    inspectNoteTemplate, templateDestinations, prepareTemplateDestination, applyTemplateDestination, attachImportSource, textHash, setNoteNavState() {},
    templateDestinationPresentation, createTemplateComparison, templateComparisonPage,
    createWebManuscriptBackup: async (reason, raw, target) => { calls.backups ||= []; calls.backups.push({ reason, raw, target }); return { entry: { id: "backup" } }; },
    document: { getElementById: (id) => nodes[id], createElement: () => new Element(), addEventListener: (...args) => documentEvents.addEventListener(...args) }, OneDriveConflictError: Error,
    invalidateFolderListing() {}, sortNoteEntries: (entries) => entries, updateNoteIndex: async () => { calls.indexes++; }, updateSharedWorkMetrics: () => { calls.metrics++; },
    openNote: async (entry) => { calls.opens.push(entry); }, openFile: async (item, { content }) => { calls.opens.push({ item, content }); return true; }, notify: (message) => calls.notices.push(message),
  });
  vm.runInContext(fn("ensureNoteFolder"), context);
  vm.runInContext(fn("setupNewDocumentDialog"), context);
  context.setupNewDocumentDialog(kind);
  const prefix = kind === "note" ? "newNote" : "newFile";
  const input = nodes[`${prefix}ImportInput`];
  const title = elements[kind === "note" ? "newNoteTitleInput" : "newFileNameInput"];
  const submit = elements[kind === "note" ? "createNoteButton" : "createFileButton"];
  elements[`${prefix}Form`].controls = [title, input, submit];
  return { state, calls, context, elements, nodes, title, submit, input, prefix, documentEvents,
    setSiblings(value) { siblings = value; },
    open: () => elements[`${prefix}Button`].emit("click"),
    read: async (name, text) => { input.files = [{ name, size: Buffer.byteLength(text), arrayBuffer: async () => new TextEncoder().encode(text) }]; await input.emit("change"); },
    create: () => elements[`${prefix}Form`].emit("submit", { submitter: { value: "create" } }),
  };
}

const dropFile = (name, text = "本文") => ({ name, size: Buffer.byteLength(text), arrayBuffer: async () => new TextEncoder().encode(text) });
const fileTransfer = (files, items = files.map(() => ({ kind: "file", webkitGetAsEntry: () => ({ isDirectory: false }) }))) => ({ types: ["Files"], files, items });
async function generatedMarkdown(body = "本文") {
  const text = `# 分類\n\n### 項目\n${body}\n`;
  const metadata = { format: "mojigoto-web-note", version: 2, escapedHeadings: true, workId: "origin-work", noteId: "origin-note", type: "plot",
    title: "生成元", generatedAt: "now", sourceFileName: "origin.json", sourceHash: await textHash(body), bodyHash: await textHash(text),
    sourceIds: [{ id: "origin-group", items: [{ id: "origin-item", kind: "entry" }] }] };
  metadata.exportHash = await textHash(generatedFormat.canonical(metadata, text));
  return generatedFormat.encode(metadata, text);
}
function generatedCloud(h) {
  const files = new Map();
  h.state.provider.listChildren = async (id) => id === "meta" ? [{ id: "plots", name: "plots", folder: {} }] : [...files.values()].map((entry) => entry.item);
  h.state.provider.createTextFile = async (folder, name, content) => {
    const item = { id: `created-${h.calls.creates.length}`, name, file: {}, eTag: "1" };
    h.calls.creates.push({ folder, item, content }); files.set(item.id, { item, content }); return item;
  };
  h.state.provider.readText = async (item) => files.get(item.id).content;
  h.state.provider.writeText = async (item, content) => { const next = { ...item, eTag: String(Number(item.eTag) + 1) }; files.set(item.id, { item: next, content }); return next; };
  return files;
}
test("生成物は初回だけ作り、同じ版の再読込は保存せず開き、次の版を同じIDへ反映する", async () => {
  const h = harness(), files = generatedCloud(h);
  await h.open(); await h.read("generated.md", await generatedMarkdown());
  assert.equal(h.nodes.newNoteImportDestination.value, "new");
  await h.create(); assert.equal(h.calls.creates.length, 1); assert.equal(h.calls.metrics, 1);
  const target = JSON.parse(files.get("created-0").content);
  assert.equal(target.importSource.noteId, "origin-note");
  await h.open(); await h.read("generated.md", await generatedMarkdown());
  assert.equal(h.nodes.newNoteImportDestination.value, "copy:created-0"); assert.equal(h.submit.textContent, "読込済みを開く");
  assert.equal(h.title.disabled, true);
  await h.create(); assert.equal(h.calls.creates.length, 1); assert.equal(h.calls.indexes, 1); assert.equal(h.calls.metrics, 1);
  await h.open(); await h.read("generated.md", await generatedMarkdown("新しい本文"));
  assert.equal(h.submit.textContent, "既存ノートへ反映して開く"); await h.create();
  assert.equal(h.calls.creates.length, 1); assert.equal(h.calls.indexes, 2); assert.equal(h.calls.metrics, 1);
  const changed = JSON.parse(files.get("created-0").content);
  assert.equal(changed.groups[0].items[0].id, target.groups[0].items[0].id);
  assert.equal(changed.groups[0].items[0].body.trimEnd(), "新しい本文");
});
test("生成物の確認後に読込先が編集された場合は停止し、ダイアログ内にエラーを保持する", async () => {
  const h = harness(), files = generatedCloud(h);
  await h.open(); await h.read("generated.md", await generatedMarkdown()); await h.create();
  await h.open(); await h.read("generated.md", await generatedMarkdown("新しい版"));
  const record = files.get("created-0"), target = JSON.parse(record.content); target.groups[0].items[0].memo.body = "ローカル変更"; record.content = JSON.stringify(target);
  await h.create(); assert.match(h.elements.newNoteError.textContent, /ノートも編集/);
  assert.equal(h.elements.newNoteDialog.open, true); assert.equal(h.calls.creates.length, 1); assert.equal(h.calls.indexes, 1);
});
test("原本とコピーを説明付きカードで選び、比較を開くだけでは保存しない", async () => {
  const h = harness(), files = generatedCloud(h);
  const original = createNote("plot", "原本の名前"); original.id = "origin-note";
  original.groups[0].title = "分類"; original.groups[0].items = [{ id: "original-item", kind: "entry", heading: "項目", body: "Webにある本文" }];
  files.set("original", { item: { id: "original", name: "origin.json", file: {}, eTag: "1" }, content: JSON.stringify(original) });
  await h.open(); await h.read("generated.md", await generatedMarkdown("Markdownにある本文"));
  const cards = h.nodes.newNoteImportChoices.children;
  assert.equal(cards.length, 3);
  assert.match(cards[0].children[1].children[1].textContent, /上書きしません/);
  assert.match(cards[1].children[1].children[1].textContent, /別のノート/);
  assert.equal(h.nodes.newNoteTitleField.hidden, true);
  h.nodes.newNoteImportComparison.open = true; await h.nodes.newNoteImportComparison.emit("toggle");
  assert.match(h.nodes.newNoteImportComparisonSummary.textContent, /変更 1/);
  assert.ok(h.nodes.newNoteImportComparisonRows.children.length > 0); assert.equal(h.calls.creates.length, 0);
  const radio = cards[1].children[0]; radio.checked = true; await radio.emit("change");
  assert.equal(h.nodes.newNoteTitleField.hidden, false); assert.equal(h.submit.textContent, "コピーを作成して開く");
  assert.equal(h.calls.creates.length, 0);
});
test("上書きカードで既存ノートを選び確認してから、バックアップと置換を行う", async () => {
  const h = harness(), files = generatedCloud(h);
  const old = createNote("plot", "既存のノート"); old.id = "existing-id";
  files.set("existing", { item: { id: "existing", name: "existing.json", file: {}, eTag: "1" }, content: JSON.stringify(old) });
  await h.open(); await h.read("generated.md", await generatedMarkdown("作り直した内容"));
  const card = h.nodes.newNoteImportChoices.children.find((label) => label.children[0].value === "replace");
  card.children[0].checked = true; await card.children[0].emit("change");
  assert.equal(h.submit.disabled, true); assert.equal(h.nodes.newNoteImportReplacePanel.hidden, false);
  h.nodes.newNoteImportReplaceTarget.value = "replace:existing"; await h.nodes.newNoteImportReplaceTarget.emit("change");
  assert.equal(h.submit.disabled, true); await h.create(); assert.equal(h.calls.backups, undefined);
  h.nodes.newNoteImportReplaceConfirmed.checked = true; await h.nodes.newNoteImportReplaceConfirmed.emit("change");
  assert.equal(h.submit.disabled, false); await h.create();
  assert.equal(h.calls.backups[0].reason, "before-import"); assert.equal(h.calls.creates.length, 0);
  assert.equal(JSON.parse(files.get("existing").content).id, "existing-id");
  assert.match(JSON.parse(files.get("existing").content).groups[0].items[0].body, /作り直した内容/);
});
test("生成物の反映後に開く処理だけ失敗しても、再試行で保存やコピーを繰り返さない", async () => {
  const h = harness(), files = generatedCloud(h);
  await h.open(); await h.read("generated.md", await generatedMarkdown()); await h.create();
  let writes = 0; const write = h.state.provider.writeText; h.state.provider.writeText = (...args) => { writes++; return write(...args); };
  await h.open(); await h.read("generated.md", await generatedMarkdown("更新"));
  const open = h.context.openNote; h.context.openNote = async () => { throw Error("表示失敗"); };
  await h.create(); assert.equal(writes, 1); assert.equal(h.submit.textContent, "処理済みを開く");
  h.context.openNote = open; await h.create(); assert.equal(writes, 1); assert.equal(files.size, 1);
});
for (const kind of ["note", "manuscript"]) {
  test(`${kind}のドロップは選択と同じプレビューを出し、確認前に作成しない`, async () => {
    const h = harness(kind); await h.open();
    const content = kind === "note" ? "# 分類\n### 項目\n本文" : "原稿の本文";
    const name = kind === "note" ? "ドロップ.md" : "ドロップ.txt";
    let prevented = false;
    await h.elements[`${h.prefix}Dialog`].emit("drop", { dataTransfer: fileTransfer([dropFile(name, content)]), preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(h.title.value, "ドロップ");
    assert.equal(h.nodes[`${h.prefix}ImportPreview`].open, true);
    assert.equal(h.calls.creates.length, 0);
    await h.create();
    assert.equal(h.calls.creates.length, 1);
    if (kind === "note") assert.equal(JSON.parse(h.calls.creates[0].content).groups[0].items[0].body, "本文");
    else assert.equal(h.calls.creates[0].content, content);
  });
}
test("複数ファイル・フォルダ・非対応形式のドロップでも前のプレビューと入力名を失わない", async () => {
  const h = harness(); await h.open(); await h.read("元.md", "### 元の項目\n残す本文");
  const dialog = h.elements.newNoteDialog;
  const previous = h.nodes.newNoteImportText.textContent;
  await dialog.emit("drop", { dataTransfer: fileTransfer([dropFile("1.md"), dropFile("2.md")]) });
  assert.match(h.elements.newNoteError.textContent, /1つずつ/);
  await dialog.emit("drop", { dataTransfer: fileTransfer([], [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }]) });
  assert.match(h.elements.newNoteError.textContent, /フォルダ/);
  await dialog.emit("drop", { dataTransfer: fileTransfer([dropFile("wrong.json", "{}")]) });
  assert.match(h.elements.newNoteError.textContent, /Markdown/);
  assert.equal(h.title.value, "元");
  assert.equal(h.nodes.newNoteImportText.textContent, previous);
  assert.equal(h.calls.creates.length, 0);
});
test("読込中・作成中・作成済みの再試行待ちではドロップで内容を差し替えない", async () => {
  const h = harness(); await h.open();
  let finishRead;
  h.input.files = [{ name: "最初.md", size: 1, arrayBuffer: () => new Promise((r) => { finishRead = r; }) }];
  const reading = h.input.emit("change");
  const transfer = fileTransfer([dropFile("差し替え.md", "別の本文")]);
  await h.elements.newNoteDialog.emit("drop", { dataTransfer: transfer });
  finishRead(new TextEncoder().encode("### 最初\n本文")); await reading;
  assert.equal(h.title.value, "最初");
  let finishCreate;
  let startCreate;
  const started = new Promise((r) => { startCreate = r; });
  const create = h.state.provider.createTextFile;
  h.state.provider.createTextFile = async (...args) => { await new Promise((r) => { finishCreate = r; startCreate(); }); return create(...args); };
  h.context.openNote = async () => { throw Error("表示失敗"); };
  const creating = h.create();
  await Promise.race([started, creating.then(() => { throw Error("作成処理に進みませんでした"); })]);
  await h.elements.newNoteDialog.emit("drop", { dataTransfer: transfer });
  finishCreate(); await creating;
  await h.elements.newNoteDialog.emit("drop", { dataTransfer: transfer });
  assert.equal(h.title.value, "最初");
  assert.equal(h.submit.textContent, "作成済みを開く");
  assert.equal(h.calls.creates.length, 1);
});
test("ファイルがダイアログを外れて落ちてもページを移動させず、通常テキストのドロップには介入しない", async () => {
  const h = harness(); let prevented = 0;
  const event = { dataTransfer: fileTransfer([dropFile("file.md")]), preventDefault: () => { prevented++; } };
  await h.documentEvents.emit("drop", event);
  assert.equal(prevented, 0);
  await h.open(); await h.documentEvents.emit("drop", event);
  assert.equal(prevented, 1);
  await h.documentEvents.emit("drop", { ...event, dataTransfer: { types: ["text/plain"] } });
  assert.equal(prevented, 1);
  assert.equal(h.calls.creates.length, 0);
});
test("子要素をまたぐドラッグでも強調を維持し、離脱・閉じる操作で解除する", async () => {
  const h = harness(); await h.open();
  const dialog = h.elements.newNoteDialog, zone = h.nodes.newNoteImportDropZone;
  const event = { dataTransfer: fileTransfer([]) };
  await dialog.emit("dragenter", event); await dialog.emit("dragenter", event);
  await dialog.emit("dragleave");
  assert.equal(zone.classes.has("is-dragover"), true);
  await dialog.emit("dragover", event); assert.equal(event.dataTransfer.dropEffect, "copy");
  await dialog.emit("dragleave"); assert.equal(zone.classes.has("is-dragover"), false);
  await dialog.emit("dragenter", event); dialog.close();
  assert.equal(zone.classes.has("is-dragover"), false);
});

test("通常の新規ノートで選択・確認・取消にはクラウド書込みをせず、作成時に内容を1回だけ保存する", async () => {
  const h = harness();
  await h.open();
  await h.read("基本.md", "# 登場人物\n## 主人公\n> 補足: 青年\n### 名前\n本文");
  assert.equal(h.title.value, "基本");
  assert.equal(h.calls.creates.length, 0);
  assert.match(h.nodes.newNoteImportStatus.textContent, /大分類 1／区分 1／項目 1/);
  assert.equal(h.nodes.newNoteImportPreview.open, true);
  assert.match(h.nodes.newNoteImportText.textContent, /大分類：登場人物\n区分：主人公\n補足：青年\n項目：名前\n本文/);
  await h.create();
  assert.equal(h.calls.creates.length, 1);
  const data = JSON.parse(h.calls.creates[0].content);
  assert.equal(data.groups[0].items[1].body, "本文");
  assert.equal(h.calls.opens[0].data.id, data.id);
  assert.equal(h.calls.indexes, 1);
  assert.equal(h.calls.metrics, 1);
  assert.equal(h.elements.newNoteDialog.open, false);
});

test("先に入力したノート名を保持し、選択失敗でも前の読込を維持し、読込取消後は空ノートを作る", async () => {
  const h = harness();
  await h.open(); h.title.value = "自分で決めた名前";
  await h.read("template.md", "### 項目\n本文");
  await h.read("invalid.json", "{}");
  assert.equal(h.title.value, "自分で決めた名前");
  assert.match(h.elements.newNoteError.textContent, /Markdown/);
  assert.match(h.nodes.newNoteImportStatus.textContent, /template.md/);
  await h.nodes.newNoteImportClear.emit("click");
  await h.create();
  const data = JSON.parse(h.calls.creates[0].content);
  assert.equal(data.title, "自分で決めた名前");
  assert.equal(data.groups[0].items.length, 0);
});

test("ダイアログを閉じると破棄し、開き直した新規作成へ前の読込を残さない", async () => {
  const h = harness(); await h.open(); await h.read("template.md", "本文");
  h.elements.newNoteDialog.close(); await h.open();
  assert.equal(h.title.value, "");
  assert.equal(h.nodes.newNoteImportPreview.hidden, true);
  assert.equal(h.calls.creates.length, 0);
});

test("未許可のGoogle Drive保存先は作らず追加許可を案内し、原稿の同名も上書きしない", async () => {
  const h = harness(); h.state.cloudKind = "googleDrive"; h.state.noteFolders = {};
  await h.open(); await h.read("note.md", "本文"); await h.create();
  assert.match(h.elements.newNoteError.textContent, /追加許可/);
  assert.equal(h.calls.creates.length, 0);
  const m = harness("manuscript"); await m.open();
  await m.read("冒頭.txt", "本文"); m.setSiblings([{ name: "冒頭.txt" }]); await m.create();
  assert.match(m.elements.newFileError.textContent, /同じ名前/);
  assert.equal(m.calls.creates.length, 0);
});

test("原稿のプレビューは冒頭だけにしてHTMLを実行せず、保存は章フォルダへ本文全体を渡す", async () => {
  const h = harness("manuscript"); await h.open();
  const text = "# 本文\r\n<script>alert(1)</script>\r\n｜漢字《かんじ》\r\n" + "長い原稿の続き。".repeat(200);
  await h.read("原稿.md", text);
  assert.match(h.nodes.newFileImportText.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(h.nodes.newFileImportText.textContent, /…（以下省略）$/);
  assert.ok(h.nodes.newFileImportText.textContent.length < text.length);
  assert.equal(h.nodes.newFileImportPreview.open, true);
  assert.equal(h.elements.newFileExtension.value, ".md");
  await h.create();
  assert.equal(h.calls.creates[0].folder.id, "manuscripts");
  assert.equal(h.calls.creates[0].item.name, "原稿.md");
  assert.equal(h.calls.creates[0].content, text);
  assert.equal(h.calls.opens[0].content, text);
});

test("作成成功後に編集を開けなくても、再試行は作成済みIDを開き複製しない", async () => {
  const h = harness(); await h.open(); await h.read("note.md", "### 項目\n本文");
  h.context.openNote = async () => { throw Error("表示に失敗"); };
  await h.create();
  assert.equal(h.submit.textContent, "作成済みを開く");
  assert.equal(h.title.disabled, true);
  assert.match(h.elements.newNoteError.textContent, /作成済み/);
  h.context.openNote = async (entry) => { h.calls.opens.push(entry); };
  await h.create();
  assert.equal(h.calls.creates.length, 1);
  assert.equal(h.calls.opens[0].item.id, h.calls.creates[0].item.id);
  assert.deepEqual([h.calls.metrics, h.calls.indexes], [1, 1]);
});

test("作品を変更してから作成しても元の作品・別の作品へ書き込まない", async () => {
  const h = harness(); await h.open(); await h.read("note.md", "本文");
  h.state.selectedWork = { id: "other" }; await h.create();
  assert.match(h.elements.newNoteError.textContent, /作品・保存先が変わりました/);
  assert.equal(h.calls.creates.length, 0);
});

test("ノートの同名は既存を置換せず新規の末尾番号へ作成する", async () => {
  const h = harness(); await h.open(); await h.read("note.md", "本文");
  h.setSiblings([{ name: "note.json" }, { name: "note-2.json" }]); await h.create();
  assert.equal(h.calls.creates[0].item.name, "note-3.json");
});

test("索引の読込中に作品を切り替えたら遅れた結果を次の作品へ入れない", async () => {
  const h = harness();
  h.state.selectedWork.mojigotoChildren = [{ id: "old-index", name: "notes-index.json", file: {} }];
  let resolve;
  h.state.provider.readText = () => new Promise((r) => { resolve = r; });
  h.context.normalizeNoteIndex = normalizeNoteIndex;
  vm.runInContext(fn("loadSelectedNoteIndex"), h.context);
  const pending = h.context.loadSelectedNoteIndex();
  h.state.selectedWork = { id: "next" };
  const nextIndex = { plots: [], references: [] };
  h.state.noteIndex = nextIndex;
  resolve('{"plots":[{"id":"old-note"}]}');
  assert.equal(await pending, null);
  assert.equal(h.state.noteIndex, nextIndex);
});

test("索引の保存中に作品を切り替えても次の作品の索引・ファイルIDを置換しない", async () => {
  const h = harness();
  h.context.makeNoteIndexEntry = makeNoteIndexEntry;
  h.context.loadSelectedNoteIndex = async () => ({ plots: [], references: [] });
  h.state.noteIndexFile = { id: "old-index" };
  let resolve;
  let startWrite;
  const writing = new Promise((r) => { startWrite = r; });
  h.state.provider.writeText = () => new Promise((r) => { resolve = r; startWrite(); });
  vm.runInContext(fn("updateNoteIndex"), h.context);
  const pending = h.context.updateNoteIndex({ id: "old-note", name: "old.json" }, createNote("plot", "前の作品"));
  await Promise.race([writing, pending.then(() => { throw Error("索引の保存が呼ばれませんでした"); })]);
  h.state.selectedWork = { id: "next" };
  const nextFile = { id: "next-index" };
  h.state.noteIndexFile = nextFile;
  resolve({ id: "old-index", eTag: "saved" });
  await pending;
  assert.equal(h.state.noteIndexFile, nextFile);
});

for (const kind of ["note", "manuscript"]) {
  test(kind + "は送信ボタン情報なしのEnter送信でも通常の新規作成へ進む", async () => {
    const h = harness(kind);
    await h.open(); h.title.value = "Enter新規作成";
    await h.elements[h.prefix + "Form"].emit("submit");
    assert.equal(h.calls.creates.length, 1);
    assert.equal(h.calls.opens.length, 1);
    assert.equal(h.elements[h.prefix + "Dialog"].open, false);
  });
}
