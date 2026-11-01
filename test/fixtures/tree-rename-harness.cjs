const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-22T13:00:00Z'])); } }

async function createTreeRenameHarness({ source, fileSystem, realTrash = false, platform = process.platform } = {}) {
  const trace = [], hooks = {}, files = new Map(), values = new Map(), commands = new Map();
  const model = { input: '新しい名前', currentWork: 'Current', root: '/works', tabs: [], manuscriptRoot: '/manuscript', fallbackRoot: '', pickPath: null, single: false, answer: null, singleTrash: '/single/.mojigoto/trash', resolvedWork: null, processOutcome: 'success' };
  const normalize = value => path.resolve(String(value || ''));
  const under = (file, dir) => { const relative = path.relative(normalize(dir), normalize(file)); return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
  const io = {};
  io.readdir = async (dir, options) => {
    trace.push(['fs.readdir', dir, options]); await hooks.readdir?.(dir);
    if (fileSystem) return fileSystem.readdir(dir, options);
    const parent = normalize(dir);
    return [...files].filter(([file]) => path.dirname(file) === parent).map(([file, content]) => ({ name: path.basename(file), isDirectory: () => content === null }));
  };
  for (const method of ['access', 'rename', 'readFile', 'writeFile']) io[method] = async (...args) => {
    trace.push(['fs.' + method, ...args]); await hooks[method]?.(...args);
    if (fileSystem) return fileSystem[method](...args);
    const target = normalize(args[0]);
    if (method === 'access') { if (!files.has(target)) throw new Error('missing'); return; }
    if (method === 'readFile') { if (!files.has(target)) throw new Error('missing'); return files.get(target); }
    if (method === 'writeFile') { files.set(target, args[1]); return; }
    if (!files.has(target)) throw new Error('missing');
    for (const [key, value] of [...files]) if (under(key, target)) {
      files.delete(key); files.set(path.join(normalize(args[1]), path.relative(target, key)), value);
    }
  };
  for (const method of ['mkdir', 'rm']) io[method] = async (target, options) => {
    trace.push(['fs.' + method, target, options]); await hooks[method]?.(target);
    if (fileSystem) return fileSystem[method](target, options);
    if (method === 'mkdir') files.set(normalize(target), null);
    else for (const file of [...files.keys()]) if (under(file, target)) files.delete(file);
  };
  const effect = name => async (...args) => { trace.push([name, ...args]); await hooks[name]?.(...args); };
  const context = { subscriptions: [], globalState: {
    get: key => values.get(key), async update(key, value) { trace.push(['state.update', key, value]); await hooks.state?.(key, value); values.set(key, value); },
  } };
  class TextInput { constructor(file) { this.uri = { fsPath: file }; } }
  class DiffInput { constructor(original, modified) { this.original = { fsPath: original }; this.modified = { fsPath: modified }; } }
  const vscode = { TabInputText: TextInput, TabInputTextDiff: DiffInput, Uri: { file: fsPath => ({ fsPath }) },
    commands: { registerCommand(name, fn) { commands.set(name, fn); return { dispose() { commands.delete(name); } }; }, executeCommand: effect('command') },
    window: { async showQuickPick(items, options) {
      trace.push(['pick', items, options]); await hooks.pick?.();
      return model.pickPath === undefined ? undefined : model.pickPath === null ? items[0] : items.find(x => normalize(x.targetPath) === normalize(model.pickPath));
    }, async showInputBox(options) { trace.push(['input', { ...options, validateInput: undefined }]); hooks.validation?.(options.validateInput); await hooks.input?.(); return model.input; },
      showWarningMessage: (message, ...args) => { trace.push(['warning', message, ...args]); hooks.warning?.(); return model.answer === null ? args.find(x => typeof x === 'string') : model.answer; }, showInformationMessage: message => trace.push(['info', message]),
      showErrorMessage: message => trace.push(['error', message]),
      tabGroups: { get all() { return [{ tabs: model.tabs }]; }, async close(tabs) { trace.push(['tabs.close', tabs.map(x => model.tabs.indexOf(x))]); await hooks.close?.(); } },
    },
  };
  const logger = { warn: (...args) => trace.push(['warn', ...args.map(x => x instanceof Error ? x.message : String(x))]) };
  const renameModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/tree/work-tree-rename-actions.js'), 'utf8'), {
    module: renameModule, Date: FixedDate, console: logger, require,
  });
  const childProcess = { spawn(...args) {
    trace.push(['spawn', ...args]); hooks.spawn?.();
    const listeners = new Map();
    if (args[0] === 'powershell.exe') queueMicrotask(() => {
      if (model.processOutcome === 'pending') { hooks.child = listeners; return; }
      if (model.processOutcome === 'error') { trace.push(['child.error']); listeners.get('error')?.(new Error('起動失敗')); }
      else { const code = model.processOutcome === 'exit' ? 1 : 0; trace.push(['child.exit', code]); listeners.get('exit')?.(code); }
    });
    return { on(event, fn) { listeners.set(event, fn); }, unref() { trace.push(['unref']); } };
  } };
  const deleteModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/tree/work-tree-work-delete-actions.js'), 'utf8'), {
    module: deleteModule, process: { platform }, require,
  });
  let trashStore = {
    getTrashDirForSingle: () => model.singleTrash,
    getTrashDirForWork: dir => dir ? path.join(dir, '.mojigoto', 'trash') : '',
    moveToTrash: effect('trash.move'), restoreTrashItem: effect('trash.restore'),
  };
  if (realTrash) {
    const trashModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/core/mojigoto-trash.js'), 'utf8'), {
      module: trashModule, Date: FixedDate,
      require: name => name === 'fs/promises' ? fileSystem : name === 'path' ? path
        : name === './mojigoto-context' ? { isSingleMode: () => model.single }
        : { getMojigotoDirForSingle: () => path.dirname(model.singleTrash), getMojigotoDirForWork: dir => path.join(dir, '.mojigoto') },
    });
    trashStore = trashModule.exports;
  }
  const keysModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/stats/stats-keys.js'), 'utf8'), { module: keysModule, require: () => ({}) });
  const provider = { refresh() { trace.push(['refresh']); hooks.refresh?.(); },
    async revealByFsPath(view, file, options) { trace.push(['reveal', file, options]); await hooks.reveal?.(); return true; } };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/tree/work-tree-commands.js'), 'utf8'), {
    module, process: { platform }, Date: FixedDate, console: logger, setTimeout: fn => { fn(); return 0; },
    require: name => name === 'vscode' ? vscode : name === 'fs/promises' ? io : name === 'child_process' ? childProcess : name === 'path' ? path
      : name === './work-tree-work-delete-actions' ? deleteModule.exports
      : name === './work-tree-rename-actions' ? renameModule.exports
      : name.startsWith('./work-tree-') && name.endsWith('-actions') ? require('../../src/tree/' + name.slice(2))
      : name === '../core/mojigoto-context' ? { isSingleMode: () => model.single, getCurrentWorkName: () => model.currentWork, getWorkRoot: () => model.root }
      : name === '../core/mojigoto-trash' ? trashStore
      : name === '../core/mojigoto-paths' ? { resolveActualWorkDir: dir => model.resolvedWork ?? dir }
      : name === '../writing-memo/writing-memo-resolver' ? { normalizeFsPath: normalize, isSameOrChildPath: under }
      : name === '../writing-memo/writing-memo-tracker' ? {
        resolveManuscriptRootForTreeItem: () => model.manuscriptRoot, findManuscriptRootFromPath: () => model.fallbackRoot,
        updateWritingMemoFilePathForRenameOrMove: effect('memo.file'), updateWritingMemoPathsForFolderRename: effect('memo.folder'),
      }
      : name === '../backup/manuscript-backup' ? { migrateManuscriptBackupsForMove: effect('backup') }
      : name === '../reorder/reorder-display-names' ? { saveDisplayNameChanges: effect('displayNames') }
      : name === '../work/work-switch-service' ? { handleRenamedWorkFolders: async (ctx, event) => { trace.push(['work.rename', ctx === context, event]); await hooks.work?.(); } }
      : name === '../views/note-webview' ? { closeNoteWebviewsUnderFolder: effect('note.close') }
      : name === '../views/concept-memo-webview' ? { closeConceptMemoWebviewsUnderFolder: effect('concept.close') }
      : name === '../views/settings-webview' ? { closeSettingsWebviewsUnderFolder: effect('settings.close') }
      : name === '../stats/stats-keys' ? keysModule.exports : {},
  });
  await module.exports.registerMojigotoTreeCommands(context, provider, undefined);
  return { trace, hooks, files, values, model, context, commands, keys: keysModule.exports, TextInput, DiffInput,
    run: item => commands.get('mojigoto.treeRenameEntry')(item),
    move: item => commands.get('mojigoto.moveManuscriptFile')(item),
    call: (name, item) => commands.get('mojigoto.' + name)(item), normalize,
  };
}
module.exports = { createTreeRenameHarness };
