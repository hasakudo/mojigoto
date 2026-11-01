const test = require("node:test");
const assert = require("node:assert/strict");
const { registerRestorableWebview, withRestoredWebviews, webviewFileKey } = require("../src/views/shared/restored-webviews");

function fixture(type, names = ["同名ノート", "同名ノート"]) {
  const panels = new Map(), calls = [], handlers = new Map();
  const groups = names.map((label, index) => ({viewColumn:index + 1, tabs:[{label, input:{viewType:`mainThreadWebview-${type}`}, isActive:true}]}));
  const tabs = groups.flatMap(group => group.tabs);
  const vscode = {window:{tabGroups:{all:groups, activeTabGroup:groups[0]},
    registerWebviewPanelSerializer(viewType, handler) { handlers.set(viewType, handler); return {dispose(){}}; }},
    commands:{async executeCommand(command, index) {
      calls.push(command);
      const tabGroups = vscode.window.tabGroups;
      if (command === "workbench.action.focusNextGroup") {
        tabGroups.activeTabGroup = groups[(groups.indexOf(tabGroups.activeTabGroup) + 1) % groups.length];
      } else {
        assert.equal(command, "workbench.action.openEditorAtIndex");
        const group = tabGroups.activeTabGroup, tab = group.tabs[index];
        // Opening the editor returns before deserialization finishes.
        Promise.resolve().then(() => handlers.get(type).deserializeWebviewPanel(
          {title:tab.label, viewColumn:group.viewColumn - 1}, {id:tabs.indexOf(tab)}));
      }
    }},
  };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  registerRestorableWebview(vscode, type, {async deserializeWebviewPanel(panel, saved) {
    await gate;
    panels.set(saved.id, {...panel, draft:`下書き ${saved.id}`});
  }});
  return {vscode, panels, calls, release, handlers, groups};
}

for (const type of ["mojigoto.noteEditor", "mojigoto.noteDisplay", "mojigotoConceptMemos", "mojigoto.stats", "mojigoto.preview", "mojigoto.addressBook", "mojigoto.settingsEditor"]) {
  test(`${type}: 背景の復元を待ち、同名の別作品を区別して既存タブを再利用する`, async () => {
    const h = fixture(type);
    let created = 0;
    const opened = withRestoredWebviews(h.vscode, type, () => h.panels.get(1) || ++created);
    h.release();
    const result = await opened;
    assert.equal(result.draft, "下書き 1");
    assert.equal(created, 0);
    assert.equal(h.panels.size, 2);
    const calls = h.calls.length;
    assert.equal(await withRestoredWebviews(h.vscode, type, () => h.panels.get(1)), result);
    assert.equal(h.calls.length, calls);
  });
}

test("ディスク読込中の連打も直列化し、一つだけ新規作成する", async () => {
  const h = fixture("notes", []);
  let panel, count = 0;
  const open = () => withRestoredWebviews(h.vscode, "notes", async () => {
    if (panel) return panel;
    await Promise.resolve();
    return panel = {number:++count};
  });
  const results = await Promise.all([open(), open(), open()]);
  assert.equal(count, 1);
  assert.ok(results.every(result => result === panel));
});

test("自動復元がすでに進行中なら、ディスク読込と登録の完了を待つ", async () => {
  const h = fixture("notes", ["ノート"]);
  const restoring = h.handlers.get("notes").deserializeWebviewPanel({title:"ノート", viewColumn:0}, {id:0});
  const opening = withRestoredWebviews(h.vscode, "notes", () => h.panels.get(0));
  h.release();
  await restoring;
  assert.equal((await opening).draft, "下書き 0");
  assert.equal(h.calls.length, 0);
});

test("閉じられた復元タブを再作成せず、新しい対象だけ開く", async () => {
  const h = fixture("notes", ["閉じたノート"]);
  h.groups[0].tabs.length = 0;
  assert.equal(await withRestoredWebviews(h.vscode, "notes", () => "新規対象"), "新規対象");
  assert.equal(h.calls.length, 0);
});

test("復元の操作が失敗した場合、新規作成へ進まず次の操作で再試行できる", async () => {
  const h = fixture("notes", ["ノート"]);
  const command = h.vscode.commands.executeCommand;
  h.vscode.commands.executeCommand = async () => { throw Error("activation failed"); };
  let created = 0;
  await assert.rejects(withRestoredWebviews(h.vscode, "notes", () => ++created), /activation failed/);
  assert.equal(created, 0);
  h.vscode.commands.executeCommand = command;
  h.release();
  assert.equal((await withRestoredWebviews(h.vscode, "notes", () => h.panels.get(0))).draft, "下書き 0");
});

test("ファイルパスの相対表記とWindowsの大文字小文字を揃える", () => {
  assert.equal(webviewFileKey("./test/../README.md"), webviewFileKey("README.md"));
  if (process.platform === "win32") assert.equal(webviewFileKey("README.md"), webviewFileKey("readme.MD"));
});

test("全タブの自動復元後は、復元済みの構想メモを再シリアライズせず再利用する", async () => {
  const h = fixture("mojigotoConceptMemos", ["作品Aの構想", "作品Bの構想"]);
  h.release();
  for (let index = 0; index < h.groups.length; index++) {
    const group = h.groups[index];
    await h.handlers.get("mojigotoConceptMemos").deserializeWebviewPanel(
      {title:group.tabs[0].label, viewColumn:group.viewColumn - 1}, {id:index});
  }
  h.vscode.commands.executeCommand = async () => { assert.fail("復元済みのタブを再度選択して待ってはいけない"); };
  const original = h.panels.get(1);
  assert.equal(await withRestoredWebviews(h.vscode, "mojigotoConceptMemos", () => h.panels.get(1)), original);
});

test("全タブの自動復元後は、復元タブにない別のノートを新規に開ける", async () => {
  const h = fixture("mojigoto.noteEditor", ["既存のノート"]);
  h.release();
  await h.handlers.get("mojigoto.noteEditor").deserializeWebviewPanel({title:"既存のノート", viewColumn:0}, {id:0});
  h.vscode.commands.executeCommand = async () => { assert.fail("復元済みのタブに対して復元コールバックを待ってはいけない"); };
  let created = 0;
  assert.equal(await withRestoredWebviews(h.vscode, "mojigoto.noteEditor", () => ({number:++created})).then(panel => panel.number), 1);
  assert.equal(h.panels.get(0).draft, "下書き 0");
});

test("同じグループに同名タブがある場合、すべての復元完了をまとめて判定する", async () => {
  const h = fixture("notes", []);
  const group = {viewColumn:1, tabs:[0, 1].map(() => ({label:"同名ノート", input:{viewType:"notes"}, isActive:false}))};
  h.vscode.window.tabGroups.all = [group];
  h.vscode.window.tabGroups.activeTabGroup = group;
  const restored = new Map();
  registerRestorableWebview(h.vscode, "notes", {async deserializeWebviewPanel(_panel, saved) { restored.set(saved.id, saved); }});
  for (const id of [1, 0]) await h.handlers.get("notes").deserializeWebviewPanel({title:"同名ノート", viewColumn:0, active:false}, {id});
  h.vscode.commands.executeCommand = async () => { assert.fail("同名でも復元済みなら再選択は不要"); };
  assert.equal(await withRestoredWebviews(h.vscode, "notes", () => restored.get(0).id), 0);
});

test("位置不明の背景タブは、一意のタイトルなら復元済みとして扱う", async () => {
  const h = fixture("notes", ["資料ノート"]);
  h.release();
  await h.handlers.get("notes").deserializeWebviewPanel({title:"資料ノート", active:false}, {id:0});
  h.vscode.commands.executeCommand = async () => { assert.fail("位置だけを理由に復元待ちへ残してはいけない"); };
  assert.equal((await withRestoredWebviews(h.vscode, "notes", () => h.panels.get(0))).draft, "下書き 0");
});

test("同名タブの一部だけ復元済みでも、既存タブを選択した状態通知で待ちを解消する", async () => {
  const h = fixture("notes", []);
  const group = {viewColumn:1, tabs:[0, 1].map(() => ({label:"同名ノート", input:{viewType:"notes"}, isActive:false}))};
  h.vscode.window.tabGroups.all = [group];
  h.vscode.window.tabGroups.activeTabGroup = group;
  const restored = new Map(), panels = new Map(), changes = new Map();
  let calls = 0, disposedListeners = 0;
  registerRestorableWebview(h.vscode, "notes", {async deserializeWebviewPanel(_panel, saved) { restored.set(saved.id, saved); }});
  const restore = async id => {
    const panel = {title:"同名ノート", viewColumn:0, active:false,
      onDidChangeViewState(fn) { changes.set(id, fn); return {dispose() { disposedListeners++; changes.delete(id); }}; }};
    panels.set(id, panel);
    await h.handlers.get("notes").deserializeWebviewPanel(panel, {id});
  };
  await restore(0);
  h.vscode.commands.executeCommand = async (_command, index) => {
    calls++;
    group.tabs.forEach((tab, id) => { tab.isActive = id === index; });
    if (!panels.has(index)) await restore(index);
    const panel = panels.get(index);
    panel.active = true;
    panel.viewColumn = 1; // View-state events already use the public column.
    changes.get(index)?.({webviewPanel:panel});
  };
  assert.equal(await withRestoredWebviews(h.vscode, "notes", () => restored.get(1).id), 1);
  assert.equal(calls, 2);
  assert.equal(disposedListeners, 2);
  assert.equal(changes.size, 0);
});

test("復元中に未保存印などのタブ名が変わっても、開始時の名前で完了を照合する", async () => {
  const h = fixture("notes", []);
  const group = {viewColumn:1, tabs:[0, 1].map(() => ({label:"● 同名ノート", input:{viewType:"notes"}, isActive:false}))};
  h.vscode.window.tabGroups.all = [group];
  h.vscode.window.tabGroups.activeTabGroup = group;
  registerRestorableWebview(h.vscode, "notes", {async deserializeWebviewPanel(panel, saved) {
    panel.title = "同名ノート";
    group.tabs[saved.id].label = panel.title;
  }});
  for (const id of [0, 1]) await h.handlers.get("notes").deserializeWebviewPanel({title:"● 同名ノート", viewColumn:0, active:false}, {id});
  h.vscode.commands.executeCommand = async () => { assert.fail("復元時の名前変更で待ちを残してはいけない"); };
  assert.equal(await withRestoredWebviews(h.vscode, "notes", () => "完了"), "完了");
});
