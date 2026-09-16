const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const Module = require("module");
const vm = require("node:vm");

let testWorkRoot = "";
let testWorkspaceRoot = "";
let testExportWorkFolderMode = "folderName";
const originalLoad = Module._load;
Module._load = function mockVscode(request, parent, isMain) {
  if (request === "vscode") {
    return {
      workspace: {
        get workspaceFolders() {
          return testWorkspaceRoot
            ? [{ uri: { fsPath: testWorkspaceRoot }, name: path.basename(testWorkspaceRoot) }]
            : [];
        },
        getConfiguration: () => ({
          get: (key, fallback) => {
            if (key === "mode") return "multi";
            if (key === "workRoot") return testWorkRoot;
            if (key === "exportWorkFolderNameMode") return testExportWorkFolderMode;
            return fallback;
          },
        }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { copyWorkData } = require("../src/work/work-copy");
const {
  ensureWorkIdentity,
  syncRelatedWorks,
} = require("../src/work/related-works");
const { getSettingsWebviewHtml } = require("../src/views/settings-webview");
const { getNoteWebviewHtml } = require("../src/views/note-webview");
const { getConceptMemoWebviewHtml } = require("../src/views/concept-memo/concept-memo-html");
const { makeStatsHtml } = require("../src/stats/stats-html");
const {
  saveUserTemplate,
  listUserTemplates,
  getUserTemplateById,
  deleteUserTemplateById,
} = require("../src/data/user-note-templates");
const {
  loadWorkAddressBook,
  saveWorkAddressBook,
  buildAddressBookExport,
} = require("../src/data/address-book-store");
const {
  searchNotesByType,
  readNoteFile,
  setItemMemoAutoSync,
  applyConceptMemoToNoteItem,
} = require("../src/data/note-store");
const {
  readConceptMemos,
  writeConceptMemos,
  createConceptMemoFromNoteItem,
  updateConceptMemoSourceAutoSync,
} = require("../src/data/concept-memo-store");
const { getWorkNameForExportFromValue } = require("../src/export/export-utils");
const {
  supportsWebviewPanelThemeIcon,
} = require("../src/views/shared/webview-panel-icon");
Module._load = originalLoad;

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

test("作品設定HTMLに関連作品と2列入力欄を描画する", () => {
  const html = getSettingsWebviewHtml(
    {},
    {
      title: "第一作",
      folderName: "first",
      genres: [],
      relatedWorkIds: ["work-second"],
      exportOptions: {},
    },
    {
      mode: "multi",
      genreOptions: [],
      penNameOptions: [],
      relatedWorkOptions: [
        { id: "work-second", title: "第二作", folderName: "second" },
      ],
    },
  );
  assert.match(html, /class="compactPairs"/);
  assert.match(html, /class="compactSectionLabel">作品備考/);
  assert.match(html, /関連作品名/);
  assert.ok(html.indexOf('id="summary"') < html.indexOf("関連作品名"));
  assert.ok(html.indexOf("関連作品名") < html.indexOf('id="memo"'));
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("ノート画面に呼び名一覧を描画し、生成スクリプトが有効", () => {
  const html = getNoteWebviewHtml(
    {
      id: "note-1",
      type: "reference",
      title: "人物",
      groups: [],
      addressBook: { characters: [], firstPerson: {}, calls: {} },
    },
    { cspSource: "vscode-webview:" },
  );
  assert.match(html, /data-menu-action="toggleAddressBook"/);
  assert.match(html, /id="addressMatrixRoot"/);
  assert.match(html, /id="addressCandidateSearch"/);
  assert.match(html, /id="addressSourcePlot"/);
  assert.match(html, /id="addressKindDivider"/);
  assert.match(html, /id="addressDividerNameSource"/);
  assert.match(html, /id="addressTermManagerList"/);
  assert.match(html, /id="addressTermPicker"/);
  assert.match(html, /id="noteTocShowDividerValues"/);
  assert.match(html, /呼ぶ人/);
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.ok(script.includes(".split(/\\s+/)"));
  assert.ok(script.includes('dividerLabel + "：" + dividerValue'));
  assert.ok(script.includes('showDividerValues: true'));
  assert.ok(script.includes("syncActiveEditingItemStyles"));
  assert.ok(script.includes("captureEditorPosition"));
  assert.ok(script.includes("restoreEditorPosition"));
  assert.ok(script.includes("findVerticalScrollContainer"));
  assert.ok(script.includes("scrollEditorElementIntoView"));
  assert.match(html, /data-preview-item-id=/);
  assert.match(html, /\.itemCard\.isActiveEditingItem/);
  assert.match(html, /\.noteBoardCard\.isActiveEditingItem/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("書き出し作品フォルダ名を設定に応じて選択する", () => {
  testExportWorkFolderMode = "folderName";
  assert.equal(getWorkNameForExportFromValue("変更後の作品名", "stable-folder"), "stable-folder");
  testExportWorkFolderMode = "title";
  assert.equal(getWorkNameForExportFromValue("変更後の作品名", "stable-folder"), "変更後の作品名");
  testExportWorkFolderMode = "folderName";
});

test("主なWebViewパネルへテーマ追従アイコンを割り当てる", async () => {
  assert.equal(supportsWebviewPanelThemeIcon("1.109.9"), false);
  assert.equal(supportsWebviewPanelThemeIcon("1.110.0"), true);
  const expectations = [
    ["src/views/note-webview.js", '"list-tree"', '"references"'],
    ["src/views/settings-webview.js", 'setWebviewPanelThemeIcon(panel, "settings-gear")'],
    ["src/views/concept-memo-webview.js", 'setWebviewPanelThemeIcon(panel, "lightbulb")'],
    ["src/stats/stats-panel.js", 'setWebviewPanelThemeIcon(panelInstance, "dashboard")'],
    ["src/preview/preview-webview.js", 'setWebviewPanelThemeIcon(state.panel, "preview")'],
    ["src/reorder/reorder-commands.js", 'setWebviewPanelThemeIcon(webviewPanel, "list-ordered")'],
    ["src/views/setup-webview.js", 'setWebviewPanelThemeIcon(panel, "tools")'],
    ["src/views/guide-webview.js", 'setWebviewPanelThemeIcon(guidePanel, "book")'],
    ["src/views/first-run-board-webview.js", 'setWebviewPanelThemeIcon(panel, "info")'],
    ["src/export/merged-manuscript-browser-panel.js", 'setWebviewPanelThemeIcon(panel, "export")'],
  ];

  for (const [relativePath, ...tokens] of expectations) {
    const source = await fs.readFile(path.join(__dirname, "..", relativePath), "utf8");
    for (const token of tokens) assert.ok(source.includes(token), `${relativePath}: ${token}`);
  }
});

test("Dashboardから執筆記録の補正を開ける", async () => {
  const layoutSource = await fs.readFile(
    path.join(__dirname, "..", "src/stats/stats-html/stats-html-layout.js"),
    "utf8",
  );
  const scriptSource = await fs.readFile(
    path.join(__dirname, "..", "src/stats/stats-html/stats-html-script.js"),
    "utf8",
  );
  assert.match(layoutSource, /id="btnCorrectStats"/);
  assert.match(scriptSource, /type: "correctStats"/);

  const html = makeStatsHtml({
    today: {},
    last7: [],
    todayFiles: [],
    todayChapters: [],
    dashboardNotes: { normal: [], list: [], todo: [], commonTodo: [] },
    highlight: { groups: [], details: [] },
    writingMemosActive: [],
    writingMemosDone: [],
    writingMemosArchived: [],
    retention: {},
    dashboardVisibility: {},
  });
  const generatedScript = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(generatedScript);
  assert.doesNotThrow(() => new vm.Script(generatedScript));
});

test("構想メモに出典操作と自動反映をメタデータ下へ描画する", () => {
  const html = getConceptMemoWebviewHtml({}, {
    filePath: "C:/work/.mojigoto/concept-memos.json",
    workDir: "C:/work",
    workTitle: "作品",
    data: { memos: [], folders: [], commonTodoItems: [] },
    uiSettings: { fontScale: 1 },
  });
  assert.ok(html.indexOf('id="metaText"') < html.indexOf('id="sourceAutoSyncControl"'));
  assert.ok(html.indexOf('id="sourceAutoSyncControl"') < html.indexOf('id="openSourceNoteButton"'));
  assert.match(html, /class="memoMetaLabel">種別:/);
  assert.match(html, /class="memoMetaLabel">更新:/);
  assert.match(html, /\.sourceSummaryRow\s*\{[\s\S]*?font-weight:\s*600/);
  assert.match(html, /構想メモを出典元の項目メモへ自動反映/);
  assert.match(html, /autoSyncToNoteItemDefault/);
  assert.match(html, /firstOptIn/);
  assert.match(html, /id="copyMemoButton"/);
  assert.match(html, /commonTodoCollapsedStorageKey/);
  assert.match(html, /memoTypeLabel-todo/);
  assert.match(html, /memoTypeLabel-todo[\s\S]*vscode-charts-purple/);
  assert.doesNotMatch(html, /memoTypeLabel-todo[\s\S]{0,240}vscode-charts-orange/);
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const renderEditorScript = script.slice(
    script.indexOf("function renderEditor()"),
    script.indexOf("function renderCommonTodo()"),
  );
  const bindButtonsScript = script.slice(
    script.indexOf("function bindButtons()"),
    script.indexOf("function bindShortcuts()"),
  );
  assert.match(renderEditorScript, /sourceAutoSyncControl\.style\.display/);
  assert.doesNotMatch(bindButtonsScript, /sourceAutoSyncControl\.style\.display/);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("構想メモから項目メモへ本文とタグを同期し、初回ON後の新規リンクをONにする", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-concept-to-note-"));
  const notePath = path.join(root, "plot.json");
  const conceptPath = path.join(root, "concept-memos.json");
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await writeJson(notePath, {
    id: "plot-a",
    type: "plot",
    title: "本編",
    groups: [{
      id: "group-a",
      title: "人物",
      images: [],
      items: [{ id: "item-a", kind: "entry", heading: "葉月", body: "", memo: {} }],
    }],
  });
  await writeConceptMemos(conceptPath, {
    version: 1,
    memos: [],
    folders: [],
    commonTodoItems: [],
    autoSyncToNoteItemDefault: true,
  });

  const created = await createConceptMemoFromNoteItem(conceptPath, {
    notePath,
    noteType: "plot",
    groupId: "group-a",
    itemId: "item-a",
    heading: "葉月",
    memoBody: "初期本文",
    memoTags: ["人物"],
  });
  assert.equal(created.memo.source.autoSyncToNoteItem, true);

  const first = await applyConceptMemoToNoteItem({
    memoId: created.memo.id,
    notePath,
    noteType: "plot",
    groupId: "group-a",
    itemId: "item-a",
    memoBody: "構想メモから更新",
    memoType: "text",
    memoTags: ["人物", "重要"],
  });
  assert.equal(first.updated, true);
  const saved = await readNoteFile(notePath, "plot");
  assert.equal(saved.groups[0].items[0].memo.body, "構想メモから更新");
  assert.deepEqual(saved.groups[0].items[0].memo.tags, ["人物", "重要"]);

  const second = await applyConceptMemoToNoteItem({
    memoId: created.memo.id,
    notePath,
    noteType: "plot",
    groupId: "group-a",
    itemId: "item-a",
    memoBody: "構想メモから更新",
    memoType: "text",
    memoTags: ["人物", "重要"],
  });
  assert.equal(second.updated, false);
});

test("項目メモの自動反映状態を既存の構想メモへ同期する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-concept-sync-"));
  const filePath = path.join(root, "concept-memos.json");
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await writeJson(filePath, {
    version: 1,
    memos: [{
      id: "memo-a",
      title: "人物メモ",
      source: {
        kind: "noteItem",
        notePath: "references/characters.json",
        groupId: "group-a",
        itemId: "item-a",
        autoSyncToConceptMemo: false,
      },
    }],
    folders: [],
    commonTodoItems: [],
  });

  const result = await updateConceptMemoSourceAutoSync(filePath, {
    notePath: "references/characters.json",
    groupId: "group-a",
    itemId: "item-a",
    autoSyncToConceptMemo: true,
  });
  assert.equal(result.updated, 1);
  const saved = await readConceptMemos(filePath);
  assert.equal(saved.memos[0].source.autoSyncToConceptMemo, true);
});

test("自作テンプレートを作品用と全体用に分けて保存する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-template-scope-"));
  const workDir = path.join(root, "work-a");
  testWorkspaceRoot = root;
  t.after(async () => {
    testWorkspaceRoot = "";
    await fs.rm(root, { recursive: true, force: true });
  });
  const note = { type: "plot", groups: [{ title: "構成", items: [] }] };
  await saveUserTemplate(note, "作品用", "full", { scope: "work", workDir });
  await saveUserTemplate(note, "全体用", "full", { scope: "global", workDir });

  const templates = await listUserTemplates("plot", { workDir });
  assert.equal(templates.length, 2);
  assert.ok(templates.some((item) => item.templateId.startsWith("user:work:")));
  assert.ok(templates.some((item) => item.templateId.startsWith("user:global:")));
  const workTemplate = templates.find((item) => item.scope === "work");
  assert.equal((await getUserTemplateById("plot", workTemplate.templateId, { workDir })).templateName, "作品用");
  assert.equal(await deleteUserTemplateById("plot", workTemplate.templateId, { workDir }), true);
  assert.equal((await listUserTemplates("plot", { workDir })).length, 1);
});

test("作品内の複数ノートから呼び名候補を集め、区分の補足を名前として使う", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-work-address-"));
  const workDir = path.join(root, "work-a");
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  await writeJson(path.join(workDir, ".mojigoto", "references", "characters.json"), {
    id: "reference-characters",
    type: "reference",
    title: "人物資料",
    groups: [{
      id: "group-a",
      title: "登場人物",
      images: [],
      items: [{ id: "divider-haduki", kind: "divider", label: "名前", value: "葉月", relatedReferences: [] }],
    }],
    addressBook: {
      characters: [{ id: "legacy-person", sourceKind: "divider", sourceId: "divider-haduki", label: "名前" }],
      firstPerson: { "legacy-person": "私" },
      calls: {},
    },
  });
  await writeJson(path.join(workDir, ".mojigoto", "plots", "plot.json"), {
    id: "plot-main",
    type: "plot",
    title: "本編",
    groups: [{
      id: "group-p",
      title: "人物",
      images: [],
      items: [{ id: "item-other", kind: "entry", heading: "相棒", body: "", relatedReferences: [] }],
    }],
  });

  await setItemMemoAutoSync({
    notePath: path.join(workDir, ".mojigoto", "plots", "plot.json"),
    noteType: "plot",
    groupId: "group-p",
    itemId: "item-other",
    enabled: true,
  });
  const autoSyncNote = await readNoteFile(
    path.join(workDir, ".mojigoto", "plots", "plot.json"),
    "plot",
  );
  assert.equal(autoSyncNote.groups[0].items[0].memo.autoSyncToConceptMemo, true);

  const loaded = await loadWorkAddressBook(workDir);
  assert.ok(loaded.candidates.some((entry) => entry.noteType === "reference" && entry.label === "葉月"));
  assert.ok(loaded.candidates.some((entry) => entry.noteType === "plot" && entry.label === "相棒"));
  assert.equal(loaded.book.characters[0].label, "葉月");
  assert.equal(loaded.book.firstPerson[loaded.book.characters[0].id], "私");

  const labelModeBook = await saveWorkAddressBook(workDir, {
    ...loaded.book,
    hiddenTerms: ["あなた"],
    characters: loaded.book.characters.map((character) => ({
      ...character,
      dividerNameSource: "label",
    })),
  });
  const reloadedLabelMode = await loadWorkAddressBook(workDir);
  assert.equal(reloadedLabelMode.book.characters[0].label, "名前");
  assert.equal(reloadedLabelMode.book.characters[0].dividerNameSource, "label");
  assert.deepEqual(reloadedLabelMode.book.hiddenTerms, ["あなた"]);

  const relatedResults = await searchNotesByType(
    { fsPath: workDir },
    "reference",
    "名前 葉月",
  );
  assert.equal(relatedResults[0].itemLabel, "葉月");
  assert.match(relatedResults[0].preview, /名前: 葉月/);

  const saved = await saveWorkAddressBook(workDir, labelModeBook);
  const html = buildAddressBookExport(saved, "html", "テスト作品");
  const csv = buildAddressBookExport(saved, "csv", "テスト作品");
  assert.match(html, /葉月/);
  assert.match(html, /テスト作品 - 呼び名一覧/);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /呼ぶ人＼呼ばれる人/);
});

test("作品設定・ノート・画像を複製し、関連付けIDを付け替える", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-work-copy-"));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  const source = { fsPath: path.join(root, "source"), name: "source", title: "コピー元" };
  const destination = { fsPath: path.join(root, "destination"), name: "destination", title: "コピー先" };
  const sourceRoot = path.join(source.fsPath, ".mojigoto");
  const destinationRoot = path.join(destination.fsPath, ".mojigoto");
  const imageRelative = "note-images/reference/grp-reference/source.png";

  await writeJson(path.join(sourceRoot, "work.json"), {
    folderName: "source",
    title: "コピー元タイトル",
    penName: "葉月",
    genres: ["ファンタジー"],
    summary: "コピー元あらすじ",
  });
  await writeJson(path.join(destinationRoot, "work.json"), {
    folderName: "destination",
    title: "コピー先タイトル",
    penName: "",
    genres: [],
  });

  const reference = {
    schemaVersion: 4,
    id: "reference-old",
    type: "reference",
    title: "人物資料",
    order: 0,
    groups: [{
      id: "grp-reference",
      title: "人物",
      items: [{ id: "item-reference", kind: "entry", heading: "主人公", body: "資料本文", relatedReferences: [] }],
      images: [{ id: "img-old", name: "立ち絵", fileName: "source.png", relativePath: imageRelative }],
    }],
  };
  const plot = {
    schemaVersion: 4,
    id: "plot-old",
    type: "plot",
    title: "第一幕",
    order: 0,
    groups: [{
      id: "grp-plot",
      title: "序盤",
      items: [{
        id: "item-plot",
        kind: "entry",
        heading: "出会い",
        body: "本文",
        memo: { body: "メモ", linkedConceptMemoIds: ["memo-old"], autoSyncToConceptMemo: true },
        relatedReferences: [{
          noteType: "reference",
          noteId: "reference-old",
          noteFileName: "characters.json",
          noteTitle: "人物資料",
          groupId: "grp-reference",
          groupTitle: "人物",
          itemId: "item-reference",
          itemKind: "entry",
          itemLabel: "主人公",
        }],
      }],
      images: [],
    }],
    addressBook: {
      characters: [{ id: "person-old", sourceKind: "item", sourceId: "item-plot", label: "主人公" }],
      firstPerson: { "person-old": "私" },
      calls: {},
    },
  };
  const plotPath = path.join(sourceRoot, "plots", "act-one.json");
  const referencePath = path.join(sourceRoot, "references", "characters.json");
  await writeJson(plotPath, plot);
  await writeJson(referencePath, reference);
  await fs.mkdir(path.dirname(path.join(sourceRoot, imageRelative)), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, imageRelative), Buffer.from([1, 2, 3, 4]));

  const result = await copyWorkData({
    sourceWork: source,
    destinationWork: destination,
    settingFields: ["penName", "genres", "summary"],
    notes: [
      { fsPath: plotPath, name: "act-one.json", type: "plot", title: "第一幕" },
      { fsPath: referencePath, name: "characters.json", type: "reference", title: "人物資料" },
    ],
  });

  assert.equal(result.copiedPlots, 1);
  assert.equal(result.copiedReferences, 1);
  assert.deepEqual(result.warnings, []);

  const settings = JSON.parse(await fs.readFile(path.join(destinationRoot, "work.json"), "utf8"));
  assert.equal(settings.folderName, "destination");
  assert.equal(settings.title, "コピー先タイトル");
  assert.equal(settings.penName, "葉月");
  assert.deepEqual(settings.genres, ["ファンタジー"]);
  const sourceSettings = JSON.parse(await fs.readFile(path.join(sourceRoot, "work.json"), "utf8"));
  assert.ok(settings.relatedWorkIds.includes(sourceSettings.workId));
  assert.ok(sourceSettings.relatedWorkIds.includes(settings.workId));

  const copiedPlot = JSON.parse(await fs.readFile(path.join(destinationRoot, "plots", "act-one.json"), "utf8"));
  const copiedReference = JSON.parse(await fs.readFile(path.join(destinationRoot, "references", "characters.json"), "utf8"));
  assert.notEqual(copiedPlot.id, plot.id);
  assert.notEqual(copiedReference.id, reference.id);
  assert.notEqual(copiedPlot.groups[0].items[0].id, "item-plot");
  assert.deepEqual(copiedPlot.groups[0].items[0].memo.linkedConceptMemoIds, []);
  assert.equal(copiedPlot.groups[0].items[0].memo.autoSyncToConceptMemo, false);
  assert.equal(copiedPlot.groups[0].items[0].relatedReferences[0].noteId, copiedReference.id);
  assert.equal(copiedPlot.groups[0].items[0].relatedReferences[0].itemId, copiedReference.groups[0].items[0].id);
  assert.notEqual(copiedPlot.addressBook.characters[0].id, "person-old");
  assert.equal(copiedPlot.addressBook.characters[0].sourceId, copiedPlot.groups[0].items[0].id);
  assert.equal(
    copiedPlot.addressBook.firstPerson[copiedPlot.addressBook.characters[0].id],
    "私",
  );

  const copiedImage = copiedReference.groups[0].images[0];
  assert.notEqual(copiedImage.id, "img-old");
  assert.deepEqual(
    await fs.readFile(path.join(destinationRoot, copiedImage.relativePath)),
    Buffer.from([1, 2, 3, 4]),
  );
});

test("手動の関連作品変更を相手側にも追加・解除する", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-related-works-"));
  testWorkRoot = root;
  t.after(async () => {
    testWorkRoot = "";
    await fs.rm(root, { recursive: true, force: true });
  });

  const first = { fsPath: path.join(root, "first"), name: "first", title: "第一作" };
  const second = { fsPath: path.join(root, "second"), name: "second", title: "第二作" };
  await writeJson(path.join(first.fsPath, ".mojigoto", "work.json"), { folderName: "first", title: "第一作" });
  await writeJson(path.join(second.fsPath, ".mojigoto", "work.json"), { folderName: "second", title: "第二作" });

  const firstIdentity = await ensureWorkIdentity(first);
  const secondIdentity = await ensureWorkIdentity(second);
  await syncRelatedWorks(first, [secondIdentity.settings.workId]);

  let firstSettings = JSON.parse(await fs.readFile(firstIdentity.settingsPath, "utf8"));
  let secondSettings = JSON.parse(await fs.readFile(secondIdentity.settingsPath, "utf8"));
  assert.deepEqual(firstSettings.relatedWorkIds, [secondIdentity.settings.workId]);
  assert.deepEqual(secondSettings.relatedWorkIds, [firstIdentity.settings.workId]);

  await syncRelatedWorks(first, []);
  firstSettings = JSON.parse(await fs.readFile(firstIdentity.settingsPath, "utf8"));
  secondSettings = JSON.parse(await fs.readFile(secondIdentity.settingsPath, "utf8"));
  assert.deepEqual(firstSettings.relatedWorkIds, []);
  assert.deepEqual(secondSettings.relatedWorkIds, []);
});

test("コピー対象外のノートへの関連付けを残さない", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mojigoto-work-copy-"));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const source = { fsPath: path.join(root, "source"), name: "source" };
  const destination = { fsPath: path.join(root, "destination"), name: "destination" };
  const plotPath = path.join(source.fsPath, ".mojigoto", "plots", "plot.json");
  await writeJson(plotPath, {
    id: "plot-old",
    type: "plot",
    title: "プロット",
    groups: [{
      id: "group-old",
      title: "区分",
      images: [],
      items: [{
        id: "item-old",
        kind: "entry",
        heading: "項目",
        relatedReferences: [{ noteType: "reference", noteId: "not-copied", groupId: "g", itemId: "i" }],
      }],
    }],
  });

  await copyWorkData({
    sourceWork: source,
    destinationWork: destination,
    notes: [{ fsPath: plotPath, name: "plot.json", type: "plot" }],
  });
  const copied = JSON.parse(await fs.readFile(path.join(destination.fsPath, ".mojigoto", "plots", "plot.json"), "utf8"));
  assert.deepEqual(copied.groups[0].items[0].relatedReferences, []);
});
