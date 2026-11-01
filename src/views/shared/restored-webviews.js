const path = require("path");

// A background tab can exist before VS Code calls its serializer. Keep those
// tabs separate from newly created panels; titles cannot identify a work/note.
const registries = new WeakMap();
function registry(vscode) {
  let value = registries.get(vscode);
  if (!value) {
    value = { types: new Map(), queue: Promise.resolve() };
    registries.set(vscode, value);
  }
  return value;
}
function isType(tab, type) {
  return tab.input?.viewType === type || tab.input?.viewType === `mainThreadWebview-${type}`;
}

function restorationCancelled() {
  const error = new Error("タブの復元処理は終了しました。");
  error.code = "cancelled";
  return error;
}

function requireRegistered(state) {
  if (state.disposed) throw restorationCancelled();
}

function whileRegistered(state, task) {
  let cancel;
  const waiting = new Promise((resolve, reject) => {
    cancel = () => reject(restorationCancelled());
    if (state.disposed) cancel();
    else state.waiters.add(cancel);
    Promise.resolve(task).then(resolve, reject);
  });
  return waiting.then(result => {
    requireRegistered(state);
    return result;
  }).finally(() => state.waiters.delete(cancel));
}

function reconcileRestoredTabs(vscode, state) {
  if (state.disposed) return;
  const groups = vscode.window.tabGroups?.all || [];
  const candidatesFor = record => {
    const named = groups.flatMap(group => group.tabs.map(tab => ({group, tab})))
      .filter(({tab}) => state.pending.has(tab) && (record.titles.has(state.labels.get(tab)) || record.titles.has(tab.label)));
    const positioned = named.filter(({group}) => group.viewColumn === record.column);
    return positioned.length ? positioned : named;
  };
  const claim = (records, tabs) => {
    records.forEach(record => { record.claimed = true; });
    tabs.forEach(tab => { state.pending.delete(tab); state.labels.delete(tab); });
    if (tabs.includes(state.started?.tab)) state.started.resolve(Promise.all(records.map(record => record.task)));
  };
  for (const record of state.records) {
    if (record.claimed) continue;
    const candidates = candidatesFor(record);
    const active = candidates.find(({group, tab}) => group === vscode.window.tabGroups.activeTabGroup && tab.isActive);
    if (record.panel.active && active) claim([record], [active.tab]);
    else if (candidates.length === 1) claim([record], [candidates[0].tab]);
  }
  // Identical titles in the same group cannot identify individual background
  // tabs. Once every candidate has deserialized, the whole set is restored.
  for (const record of state.records) {
    if (record.claimed) continue;
    const tabs = candidatesFor(record).map(({tab}) => tab);
    const records = [...state.records].filter(other => !other.claimed && (() => {
      const candidates = candidatesFor(other).map(({tab}) => tab);
      return candidates.length === tabs.length && candidates.every(tab => tabs.includes(tab));
    })());
    if (tabs.length && records.length === tabs.length) claim(records, tabs);
  }
  if (!state.pending.size) {
    for (const record of state.records) { record.changed?.dispose(); record.closed?.dispose(); }
    state.records.clear();
    state.labels.clear();
  }
}

function registerRestorableWebview(vscode, type, serializer) {
  const state = { pending: new Set(), labels: new Map(), running: new Set(), records: new Set(), started: null, disposed: false, waiters: new Set() };
  for (const group of vscode.window.tabGroups?.all || []) {
    for (const tab of group.tabs) if (isType(tab, type)) { state.pending.add(tab); state.labels.set(tab, tab.label); }
  }
  const registration = vscode.window.registerWebviewPanelSerializer(type, {
    deserializeWebviewPanel(panel, saved) {
      if (state.disposed) return Promise.reject(restorationCancelled());
      let complete, fail;
      const task = whileRegistered(state, new Promise((resolve, reject) => { complete = resolve; fail = reject; }));
      state.running.add(task);
      // VS Code passes its zero-based EditorGroupColumn directly to the revived
      // panel. TabGroup.viewColumn is one-based. Later view-state events already
      // contain the public, one-based ViewColumn and must not be converted again.
      const record = { panel, titles:new Set([panel.title]), task, claimed:false,
        column:Number.isInteger(panel.viewColumn) ? panel.viewColumn + 1 : undefined };
      if (state.pending.size) {
        state.records.add(record);
        record.changed = panel.onDidChangeViewState?.(() => {
          record.column = panel.viewColumn;
          record.titles.add(panel.title);
          reconcileRestoredTabs(vscode, state);
        });
        record.closed = panel.onDidDispose?.(() => { record.changed?.dispose(); record.closed?.dispose(); state.records.delete(record); });
        reconcileRestoredTabs(vscode, state);
      }
      task.finally(() => state.running.delete(task)).catch(() => {});
      try { Promise.resolve(serializer.deserializeWebviewPanel(panel, saved)).then(complete, fail); }
      catch (error) { fail(error); }
      return task;
    },
  });
  const all = registry(vscode);
  all.types.set(type, state);
  return { dispose() {
    if (state.disposed) return;
    state.disposed = true;
    for (const cancel of state.waiters) cancel();
    state.waiters.clear();
    clearTimeout(state.started?.timer);
    for (const record of state.records) { record.changed?.dispose(); record.closed?.dispose(); }
    state.records.clear();
    state.pending.clear();
    state.labels.clear();
    state.running.clear();
    if (all.types.get(type) === state) all.types.delete(type);
    registration.dispose();
  } };
}

async function restorePending(vscode, state) {
  await whileRegistered(state, Promise.all([...state.running]));
  reconcileRestoredTabs(vscode, state);
  for (const tab of [...state.pending]) {
    if (!state.pending.has(tab)) continue;
    let group = vscode.window.tabGroups.all.find(group => group.tabs.includes(tab));
    if (!group) { state.pending.delete(tab); state.labels.delete(tab); continue; }
    // These commands activate an existing editor; they never close a tab or
    // replace a webview's saved state. Group order is checked after each step.
    for (let count = 0; vscode.window.tabGroups.activeTabGroup !== group; count++) {
      if (count >= vscode.window.tabGroups.all.length) throw new Error("復元タブのあるエディターグループへ移動できませんでした。");
      await whileRegistered(state, vscode.commands.executeCommand("workbench.action.focusNextGroup"));
    }
    if (!state.pending.has(tab)) { await whileRegistered(state, Promise.all([...state.running])); continue; }
    let timer;
    const started = new Promise((resolve, reject) => {
      state.started = { tab, resolve };
      timer = setTimeout(() => reject(new Error("タブの復元を待っています。対象のタブを一度選択してから開き直してください。")), 10000);
      state.started.timer = timer;
    });
    // Observe a timeout even if activating the editor is still pending.
    started.catch(() => {});
    try {
      const index = group.tabs.indexOf(tab);
      if (index < 0) { state.pending.delete(tab); continue; }
      await whileRegistered(state, vscode.commands.executeCommand("workbench.action.openEditorAtIndex", index));
      // The serializer can start asynchronously after the activation command.
      await whileRegistered(state, started);
      state.pending.delete(tab);
    } finally { clearTimeout(timer); state.started = null; }
  }
  await whileRegistered(state, Promise.all([...state.running]));
}

function withRestoredWebviews(vscode, type, open) {
  const all = registry(vscode), state = all.types.get(type);
  if (!state) return open();
  const task = all.queue.then(async () => {
    requireRegistered(state);
    await restorePending(vscode, state);
    requireRegistered(state);
    return open();
  });
  all.queue = task.catch(() => {});
  return task;
}

function webviewFileKey(file) {
  const value = path.resolve(file);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

module.exports = { registerRestorableWebview, withRestoredWebviews, webviewFileKey };
