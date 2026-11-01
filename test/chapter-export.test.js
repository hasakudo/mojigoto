const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const chapters = require("../src/export/merged-manuscript-chapters");
const bodyText = html => String(html).split(/<body[^>]*>/i)[1].split(/<\/body>/i)[0].replace(/<[^>]*>/g, "");

async function fixture(t, settings = {}) {
  const tempRoot = path.resolve(".review-baseline/test-temp");
  await fsp.mkdir(tempRoot, {recursive:true});
  const dir = await fsp.mkdtemp(path.join(tempRoot, "chapter-export-"));
  t.after(async () => { assert.ok(dir.startsWith(tempRoot + path.sep)); await fsp.rm(dir, {recursive:true, force:true}); });
  const root = path.join(dir, "manuscript"), out = path.join(dir, "out");
  await fsp.mkdir(out);
  const samples = {"第2章/002.txt":"# 第二章\n第二章本文B", "第1章/010.txt":"# 第一章\n第一章本文A｜人《レイ》",
    "第1章/子フォルダ/020.md":"続き本文C", "直下.txt":"直下本文Z", "空の章/ignore.json":"{}"};
  for (const [name, body] of Object.entries(samples)) { const file = path.join(root, name); await fsp.mkdir(path.dirname(file), {recursive:true}); await fsp.writeFile(file, body); }
  const state = {root, errors:[], infos:[], warnings:[], picks:[], progress:[], panel:null, saveCalls:0, ...settings};
  const uri = fsPath => ({fsPath});
  const vscode = {ProgressLocation:{Notification:15}, Uri:{file:uri, joinPath:(base, name) => uri(path.join(base.fsPath, name))},
    workspace:{getConfiguration:() => ({get:(key, fallback) => key === "manuscriptRoot" ? state.root : fallback})},
    window:{
      async showQuickPick(items, options) {
        state.picks.push({items, options});
        if ("unit" in items[0]) return state.scopeCancel ? undefined : items.find(item => item.unit === (state.scope || "chapters"));
        if ("chapterId" in items[0]) return state.chapterCancel ? undefined : items.filter(item => !state.ids || state.ids.includes(item.chapterId));
        return state.formatCancel ? undefined : items.find(item => item.label === (state.preset || "テキスト (.txt)"));
      },
      async showOpenDialog() { await state.onFolder?.(); return state.folderCancel ? undefined : [uri(state.destination || out)]; },
      async showSaveDialog(options) { state.saveCalls++; await state.onSave?.(); return state.saveCancel ? undefined : uri(path.join(out, path.basename(options.defaultUri.fsPath))); },
      async showWarningMessage(message, options) { state.warnings.push(message); if (options?.modal) { await state.onOverwrite?.(); return state.overwrite ? "上書きする" : undefined; } },
      async showInformationMessage(message) { state.infos.push(message); },
      showErrorMessage(message) { state.errors.push(message); },
      async withProgress(_options, action) { await state.onProgressStart?.(); return action({report:value => state.progress.push(value)}); },
    }, commands:{async executeCommand() {}},
  };
  const exportRoot = path.resolve(__dirname, "../src/export"), modules = new Map();
  const vmNames = new Set(["merged-manuscript-core", "merged-manuscript-export-ui", "merged-manuscript-browser-html", "merged-manuscript-browser-realprint-html", "merged-manuscript-word-html"]);
  function load(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const module = {exports:{}}, file = path.join(exportRoot, name + ".js"), localRequire = createRequire(file);
    modules.set(name, module);
    const nativeFs = {...fs, readFileSync(file, ...args) { if (state.failRead && String(file).endsWith(state.failRead)) throw Error("read failed"); return fs.readFileSync(file, ...args); }};
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {module, console, require(request) {
      if (request === "vscode") return vscode;
      if (request === "fs") return nativeFs;
      if (request === "./manuscript-export") return {getWorkNameForStats:() => "テスト作品"};
      if (request === "./export-utils") return {ensureNamedExportDir:async () => out};
      if (request === "./merged-manuscript-browser-panel") return {
        revealMergedManuscriptBrowserPanel:() => state.existingPanel || false,
        async openMergedManuscriptBrowserPanel(_context, options, handlers) { state.panel = {options, handlers}; },
      };
      const name = request.replace(/^\.\//, "");
      return vmNames.has(name) ? load(name) : localRequire(request);
    }}, {filename:file});
    return module.exports;
  }
  const ui = load("merged-manuscript-export-ui"), core = load("merged-manuscript-core");
  const context = {workspaceState:{get:() => state.savedPanelState || null, async update(key, value) {
    assert.equal(key,"mojigoto.mergedManuscriptBrowserPanelState");
    state.savedPanelState=value;
  }}};
  const run = () => ui.exportMergedManuscript(context);
  return {dir, root, out, state, ui, core, run, context};
}

test("章は直下フォルダで分類し、子フォルダ・元のファイル順・章なしを保持する", () => {
  const root = path.resolve("manuscript"), files = ["第2章/002.md", "直下.txt", "第1章/010.txt", "第1章/sub/020.txt"].map(file => path.join(root, file));
  const result = chapters.groupManuscriptFilesByChapter(root, files);
  assert.deepEqual(result.map(chapter => chapter.id), ["第1章", "第2章", ""]);
  assert.deepEqual(result[0].files, files.slice(2));
  assert.throws(() => chapters.groupManuscriptFilesByChapter(root, [path.join(root, "..", "other.txt")]), /外/);
});

for (const [preset, extension] of [["テキスト (.txt)", "txt"], ["Markdown (.md)", "md"], ["Word用 HTML", "html"], ["ブラウザ：横書き HTML", "html"]]) {
  test(`${preset}: 選択した章だけを別ファイルへ出力し、他章の本文を混ぜない`, async t => {
    const h = await fixture(t, {preset, ids:["第1章", "第2章"]});
    await h.run();
    assert.deepEqual(h.state.errors, []);
    const names = (await fsp.readdir(h.out)).filter(file => file.endsWith(`.${extension}`));
    assert.equal(names.length, 2);
    const first = await fsp.readFile(path.join(h.out, names.find(name => name.includes("第1章"))), "utf8");
    const second = await fsp.readFile(path.join(h.out, names.find(name => name.includes("第2章"))), "utf8");
    assert.match(first, /第一章本文A/); assert.match(first, /続き本文C/); assert.doesNotMatch(first, /第二章本文B|直下本文Z/);
    assert.match(second, /第二章本文B/); assert.doesNotMatch(second, /第一章本文A|続き本文C|直下本文Z/);
    if (extension === "html") assert.match(first, /<ruby>/);
    else assert.match(first, /｜人《レイ》/);
    assert.equal(h.state.progress.length, 2);
    assert.match(h.state.infos.at(-1), /2章/);
  });
}

test("全体を1ファイルにまとめる場合、従来のファイル順・結合ルール・保存ダイアログを使う", async t => {
  const h = await fixture(t, {scope:"all"});
  const files = h.core.collectMergedManuscriptFiles(h.root);
  const expected = h.core.renderMergedManuscriptTxt(h.core.buildMergedManuscriptData(h.context, h.root, files));
  await h.run();
  assert.deepEqual(h.state.errors, []);
  assert.equal(await fsp.readFile(path.join(h.out, "テスト作品.txt"), "utf8"), expected);
  assert.equal(h.state.saveCalls, 1);
  assert.equal(h.state.picks.length, 2);
});

test("直下の原稿だけも章なしとして出力でき、原稿本文を変更しない", async t => {
  const h = await fixture(t, {ids:[""]});
  await h.run();
  assert.deepEqual(h.state.errors, []);
  const names = (await fsp.readdir(h.out)).filter(file => file.endsWith(".txt"));
  assert.equal(names.length, 1);
  assert.equal(await fsp.readFile(path.join(h.out, names[0]), "utf8"), "直下本文Z");
  assert.equal(await fsp.readFile(path.join(h.root, "直下.txt"), "utf8"), "直下本文Z");
});

for (const options of [{exportMode:"simple", htmlPrintLayoutMode:"single"}, {exportMode:"simple", htmlPrintLayoutMode:"2up"}, {exportMode:"real", realPrintPageSize:"b6"}]) {
  test(`縦書きHTML ${options.exportMode}/${options.htmlPrintLayoutMode || "b6"}: 先頭章のプレビューと章ごとの出力を同じ設定で生成する`, async t => {
    const h = await fixture(t, {preset:"ブラウザ：縦書き HTML", ids:["第1章", "第2章"]});
    await h.run();
    assert.deepEqual(h.state.errors, []);
    assert.match(h.state.panel.options.exportScopeDescription, /2ファイル/);
    assert.deepEqual(Array.from(h.state.panel.options.previewChapters, chapter => chapter.id), ["第1章", "第2章"]);
    const preview = await h.state.panel.handlers.onPreview(options);
    assert.match(preview.message, /第1章/); assert.match(bodyText(preview.html), /第一章本文A/); assert.doesNotMatch(bodyText(preview.html), /第二章本文B/);
    const secondPreview = await h.state.panel.handlers.onPreview({...options, previewChapterId:"第2章"});
    assert.match(bodyText(secondPreview.html), /第二章本文B/);
    assert.doesNotMatch(bodyText(secondPreview.html), /第一章本文A/);
    assert.match(secondPreview.message, /第2章/);
    if (options.exportMode === "real") assert.match(secondPreview.html, /class="realPrintPage/);
    else {
      assert.match(secondPreview.html, /class="a4PreviewPaper"/);
      assert.match(secondPreview.html, options.htmlPrintLayoutMode === "2up" ? /width: 297mm;\s*height: 210mm/ : /width: 210mm;\s*height: 297mm/);
      assert.match(secondPreview.html, /@media all/);
    }
    const result = await h.state.panel.handlers.onSubmit(options);
    assert.match(result.message, /2章/);
    const names = (await fsp.readdir(h.out)).filter(file => file.endsWith(".html"));
    assert.equal(names.length, 2);
    const first = await fsp.readFile(path.join(h.out, names.find(name => name.includes("第1章"))), "utf8");
    assert.match(bodyText(first), /第一章本文A/); assert.doesNotMatch(bodyText(first), /第二章本文B/);
    assert.doesNotMatch(first, /a4PreviewPaper|@media all/);
    assert.ok(names.every(name => name.includes(options.exportMode === "real" ? "_vr_b6" : options.htmlPrintLayoutMode === "2up" ? "_v2up" : "_v")));
  });
}

test("プレビューは対象章だけを選べ、空IDの章なしにも切り替えられる", async t => {
  const h = await fixture(t, {preset:"ブラウザ：縦書き HTML", ids:["第1章", ""]});
  await h.run();
  const preview = await h.state.panel.handlers.onPreview({exportMode:"simple", previewChapterId:""});
  assert.match(bodyText(preview.html), /直下本文Z/);
  assert.doesNotMatch(bodyText(preview.html), /第一章本文A|第二章本文B/);
  await assert.rejects(h.state.panel.handlers.onPreview({previewChapterId:"第2章"}), /書き出し対象/);
  assert.deepEqual(await fsp.readdir(h.out), []);
});

test("A4横プレビューは印刷の文字サイズ・余白を使い、全体出力も保持する", async t => {
  const h = await fixture(t, {preset:"ブラウザ：縦書き HTML", scope:"all"});
  await h.run();
  const options = {exportMode:"simple", htmlPrintOrientation:"landscape", printMarginMm:8, printFontSizePx:19, printBodyPaddingPx:7};
  const preview = await h.state.panel.handlers.onPreview(options);
  assert.match(preview.message, /A4横/);
  assert.match(preview.html, /width: 297mm;\s*height: 210mm/);
  assert.match(preview.html, /padding: 8mm/);
  assert.match(preview.html, /@media all[\s\S]*font-size: 19px/);
  assert.match(bodyText(preview.html), /第一章本文A/);
  assert.match(bodyText(preview.html), /第二章本文B/);
  await h.state.panel.handlers.onSubmit({...options, printPreview:true});
  const name = (await fsp.readdir(h.out)).find(file => file.endsWith(".html"));
  const html = await fsp.readFile(path.join(h.out, name), "utf8");
  assert.doesNotMatch(html, /a4PreviewPaper|@media all/);
  assert.match(bodyText(html), /第一章本文A/); assert.match(bodyText(html), /第二章本文B/);
});

test("章書き出しの設定を保存して開き直すと、版組・判型ごとの値を復元する", async t => {
  const h=await fixture(t,{preset:"ブラウザ：縦書き HTML",ids:["第1章"],savedPanelState:{
    realPrintPageSize:"a5",realPrintColumnMode:"two",simple:{currentLayoutMode:"2up",byLayout:{
      single:{charsPerLine:32},"2up":{charsPerLine:40,printFontSizePt:12,htmlPrintLayoutMode:"2up"}}},
    realBySize:{"a5:two":{realPrintFontSizePt:10},"b6:single":{realPrintFontSizePt:9}},
  }});
  await h.run();
  assert.equal(h.state.panel.options.htmlPrintLayoutMode,"2up");
  assert.equal(h.state.panel.options.charsPerLine,40);
  assert.equal(h.state.panel.options.printFontSizePt,12);
  assert.equal(h.state.panel.options.realPrintFontSizePt,10);
  await h.state.panel.handlers.onSubmit({exportMode:"simple",htmlPrintLayoutMode:"2up",charsPerLine:41,
    printFontSizePt:13,realPrintPageSize:"a5",realPrintColumnMode:"two",realPrintFontSizePt:11});
  assert.equal(h.state.savedPanelState.simple.byLayout.single.charsPerLine,32);
  assert.equal(h.state.savedPanelState.realBySize["b6:single"].realPrintFontSizePt,9);
  await h.run();
  assert.equal(h.state.panel.options.charsPerLine,41);
  assert.equal(h.state.panel.options.printFontSizePt,13);
  assert.equal(h.state.panel.options.realPrintFontSizePt,11);
  assert.deepEqual(h.state.errors,[]);
});

test("章選択・形式選択・保存先・全体保存の取消では出力しない", async t => {
  for (const config of [{scopeCancel:true}, {chapterCancel:true}, {ids:[]}, {formatCancel:true}, {folderCancel:true}, {scope:"all", saveCancel:true}]) {
    const h = await fixture(t, config); await h.run();
    assert.deepEqual(h.state.errors, []);
    assert.deepEqual((await fsp.readdir(h.out)).filter(file => /\.(txt|md|html)$/.test(file)), []);
  }
});

test("同名出力は一括で確認し、取消なら保持、許可したときだけ更新する", async t => {
  const h = await fixture(t, {ids:["第1章"]}); await h.run();
  const file = path.join(h.out, (await fsp.readdir(h.out)).find(file => file.endsWith(".txt")));
  await fsp.writeFile(file, "以前の出力");
  await h.run(); assert.equal(await fsp.readFile(file, "utf8"), "以前の出力");
  h.state.overwrite = true; await h.run();
  assert.match(await fsp.readFile(file, "utf8"), /第一章本文A/);
  assert.match(h.state.warnings.at(-1), /1件/);
});

test("ファイル選択中にViewが切り替わった場合は別作品を出力しない", async t => {
  const h = await fixture(t, {ids:["第1章"]});
  const other = path.join(h.dir, "other"); await fsp.mkdir(other);
  h.state.onFolder = async () => { h.state.root = other; };
  await h.run();
  assert.match(h.state.errors[0], /Viewが切り替わり/);
  assert.deepEqual((await fsp.readdir(h.out)).filter(file => file.endsWith(".txt")), []);
});

test("選択章を読み取れなければ、他章も含めて書き出しを開始しない", async t => {
  const h = await fixture(t, {ids:["第1章", "第2章"], failRead:"020.md"});
  await h.run();
  assert.match(h.state.errors[0], /read failed/);
  assert.deepEqual(await fsp.readdir(h.out), []);
});

test("原稿フォルダ内の出力先は拒否し、ファイル名の衝突を回避する", async t => {
  const h = await fixture(t);
  assert.throws(() => chapters.assertChapterExportDirectory(h.root, h.root), /外を選んで/);
  const nested = path.join(h.root, "第1章");
  assert.throws(() => chapters.assertChapterExportDirectory(nested, h.root), /外を選んで/);
  const names = chapters.buildChapterOutputNames("作品", [{id:"a:b"}, {id:"a?b"}, {id:"章なし"}, {id:""}], "txt");
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, 4);
  assert.ok(names.every(name => !/[\\/:*?"<>|]/.test(name)));
});

test("確認後に出力ファイルが更新された場合は上書きせず、一時ファイルを片付ける", async t => {
  const h = await fixture(t);
  const outputs = [{fileName:"章.txt", content:"新しい出力"}], expected = chapters.inspectChapterOutputs(h.out, outputs);
  await fsp.writeFile(path.join(h.out, "章.txt"), "外部からの編集");
  await assert.rejects(chapters.writeChapterOutputs(h.out, outputs, expected), /確認後に/);
  assert.equal(await fsp.readFile(path.join(h.out, "章.txt"), "utf8"), "外部からの編集");
  assert.deepEqual(await fsp.readdir(h.out), ["章.txt"]);
});

test("縦書き設定画面が開いている間は同じ画面を再利用し、別の対象を混ぜない", async t => {
  const h = await fixture(t, {existingPanel:true}); await h.run();
  assert.equal(h.state.picks.length, 0); assert.equal(h.state.panel, null);
});

test("長い章名が省略後に衝突しても、選択する章を変えた際に別の章を上書きしない", async t => {
  const prefix = "長".repeat(81), a = `${prefix}A`, b = `${prefix}B`;
  const h = await fixture(t, {ids:[b]});
  for (const [id, body] of [[a, "章Aの本文"], [b, "章Bの本文"]]) {
    await fsp.mkdir(path.join(h.root, id)); await fsp.writeFile(path.join(h.root, id, "001.txt"), body);
  }
  await h.run();
  const firstName = (await fsp.readdir(h.out)).find(file => file.endsWith(".txt"));
  assert.equal(await fsp.readFile(path.join(h.out, firstName), "utf8"), "章Bの本文");
  h.state.ids = [a, b]; h.state.overwrite = true; await h.run();
  const names = (await fsp.readdir(h.out)).filter(file => file.endsWith(".txt"));
  assert.equal(names.length, 2); assert.ok(names.includes(firstName));
  assert.equal(await fsp.readFile(path.join(h.out, firstName), "utf8"), "章Bの本文");
  assert.deepEqual(h.state.errors, []);
});

test("MultiのViewリンクのパスが同じでも連携先が変われば出力を止める", async t => {
  const h = await fixture(t, {ids:["第1章"]});
  const view = path.join(h.dir, "view"), other = path.join(h.dir, "other");
  await fsp.mkdir(other);
  await fsp.symlink(h.root, view, "junction");
  h.state.root = view;
  h.state.onFolder = async () => {
    if (process.platform === "win32") await fsp.rmdir(view); else await fsp.unlink(view);
    await fsp.symlink(other, view, "junction");
  };
  await h.run();
  assert.match(h.state.errors[0], /Viewが切り替わり/);
  assert.deepEqual((await fsp.readdir(h.out)).filter(file => file.endsWith(".txt")), []);
});

test("書き出し処理中のView切り替えでも、出力と一時ファイルを残さない", async t => {
  const h = await fixture(t, {ids:["第1章", "第2章"]});
  const other = path.join(h.dir, "other"); await fsp.mkdir(other);
  h.state.onProgressStart = async () => { h.state.root = other; };
  await h.run();
  assert.match(h.state.errors[0], /Viewが切り替わり/);
  assert.deepEqual(await fsp.readdir(h.out), ["章ごと"]);
});

test("出力が原稿のハードリンクでも、原稿を書き換えず出力ファイルだけ置換する", async t => {
  const h = await fixture(t);
  const source = path.join(h.root, "直下.txt"), target = path.join(h.out, "章.txt");
  await fsp.link(source, target);
  const outputs = [{fileName:"章.txt", content:"書き出した内容"}], expected = chapters.inspectChapterOutputs(h.out, outputs);
  await chapters.writeChapterOutputs(h.out, outputs, expected);
  assert.equal(await fsp.readFile(source, "utf8"), "直下本文Z");
  assert.equal(await fsp.readFile(target, "utf8"), "書き出した内容");
  assert.deepEqual(await fsp.readdir(h.out), ["章.txt"]);
});
