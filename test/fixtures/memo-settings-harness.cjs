const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { storageRevision } = require('../../src/data/structured-file-write');

function createMemoSettingsHarness({ source } = {}) {
  const trace = [], hooks = {}, listeners = [], files = new Map(), flags = new Map();
  const model = { decision: 'すべてONにする', multi: false,
    values: { noteMemoAutoSyncEnabled: false, conceptMemoAutoSyncEnabled: false } };
  const directory = path.resolve('work/.mojigoto');
  const context = { subscriptions: [], workspaceState: {
    get: (key, fallback) => flags.has(key) ? flags.get(key) : fallback,
    async update(key, value) { trace.push(['flag', key, value]); await hooks.flag?.(key); flags.set(key, value); },
  } };
  const change = (key, value) => {
    model.values[key] = value;
    for (const listener of listeners) listener({ affectsConfiguration: name => name === 'mojigoto.' + key });
  };
  const vscode = { ConfigurationTarget: { Workspace: 2 }, workspace: {
    getConfiguration: () => ({ get: (key, fallback) => model.values[key] ?? fallback,
      async update(key, value, target) {
        trace.push(['config.start', key, value, target]); await hooks.configUpdate?.(key, value);
        change(key, value); trace.push(['config.end', key, value]);
      },
    }),
    onDidChangeConfiguration(fn) { listeners.push(fn); return { dispose() {} }; },
  }, window: {
    async showInformationMessage(message, options) {
      trace.push([options?.modal ? 'prompt' : 'info', message]);
      if (options?.modal) return hooks.prompt ? hooks.prompt(message) : model.decision;
    },
    showErrorMessage: message => trace.push(['error', message]),
  } };
  const fileSystem = {
    async readFile(file) {
      trace.push(['read', file]); await hooks.read?.(file);
      if (!files.has(file)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return files.get(file);
    },
    async readdir(dir) {
      trace.push(['list', dir]); await hooks.list?.(dir);
      return [...files.keys()].filter(file => path.dirname(file) === dir).map(file => ({ name: path.basename(file), isFile: () => true }));
    },
  };
  const migration = { exports: {} }, module = { exports: {} };
  const resolveDependency = name => {
    if (name === 'vscode') return vscode;
    if (name === 'fs/promises') return fileSystem;
    if (name === 'path') return path;
    if (name === './memo-auto-sync-migration') return migration.exports;
    if (name === './structured-file-write') return { storageRevision,
      async writeStructuredFile(file, value, revision) {
        trace.push(['write', file]); await hooks.write?.(file);
        if (revision !== storageRevision(files.get(file) ?? null)) throw Object.assign(Error('conflict'), { code: 'conflict' });
        const { storageRevision: ignored, ...data } = value; files.set(file, JSON.stringify(data, null, 2));
      },
    };
    if (name === '../core/mojigoto-context') return { isSingleMode: () => !model.multi, getWorkRoot: () => path.dirname(path.dirname(directory)) };
    if (name === '../core/mojigoto-paths') return {
      getMojigotoDirForSingle: () => directory, listWorkDirectories: () => [{ fsPath: path.dirname(directory) }],
      getMojigotoDirForWork: work => path.join(work, '.mojigoto'),
    };
    if (name === '../views/note-webview') return { notifyNoteUpdated: file => trace.push(['notify.note', file]) };
    if (name === '../views/concept-memo-webview') return { notifyConceptMemoUpdated: file => trace.push(['notify.concept', file]) };
    throw Error('unexpected require: ' + name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/data/memo-auto-sync-migration.js'), 'utf8'), { module: migration, require: resolveDependency });
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/data/memo-auto-sync-settings.js'), 'utf8'), { module, require: resolveDependency });
  return { trace, hooks, model, context, files, flags, directory, change, api: module.exports,
    register: () => module.exports.registerMemoAutoSyncSettings(context),
    set: (key, enabled) => module.exports.setMemoAutoSyncDefault(context, key, enabled),
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); },
    async drain() { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); },
  };
}
module.exports = { createMemoSettingsHarness };
