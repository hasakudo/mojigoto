const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function createTreeMetadataHarness({ source, creation = false, fileSystem } = {}) {
  const trace = [], hooks = {}, commands = new Map(), registrations = [];
  const model = { statusFilters: ['draft'], genreFilters: ['幻想'], genres: { genres: ['幻想', '恋愛'], hasEmpty: true },
    settings: { title: '作品', status: 'draft', custom: { keep: true } },
    target: { readPath: '/original/work.json', path: '/target/work.json' }, selected: undefined,
    single: false, displayName: '現在作品', currentWork: { fsPath: '/current' },
    created: { filePath: '/created/note.json' }, conceptPath: '/single/concept.json',
    workRoot: '/works', manuscriptDir: 'manuscript', manuscriptRoot: '/view/manuscript', input: '新規作品', copyChoice: 'コピーせず続ける', extension: '.txt' };
  const context = { subscriptions: [] };
  let explicitSelection = false;
  const files = new Map(), directories = new Set();
  const recordedFs = {
    async access(file) { trace.push(['fs.access', file]); await hooks.access?.(file); if (!files.has(file) && !directories.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    async mkdir(file, options) { trace.push(['fs.mkdir', file, options]); await hooks.mkdir?.(file); directories.add(file); },
    async writeFile(file, text, encoding) { trace.push(['fs.write', file, text, encoding]); await hooks.fileWrite?.(file); files.set(file, text); },
  };
  const vscode = { Uri: { file: fsPath => ({ fsPath }) }, workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'defaultFileExtension' ? model.extension : fallback }) }, window: {
    async showInputBox(options) { trace.push(['input', options]); await hooks.input?.(); return model.input; },
    showWarningMessage: message => trace.push(['warning', message]),
    async showQuickPick(items, options) { trace.push(['pick', items, options]); await hooks.pick?.();
      return explicitSelection ? model.selected : options.canPickMany ? items.filter(x => x.picked) : items.find(x => x.value === 'complete'); },
    showErrorMessage: message => trace.push(['error', message]),
    showInformationMessage: (message, ...choices) => { trace.push(['info', message, ...choices]); return creation ? model.copyChoice : undefined; },
  }, commands: { async executeCommand(...args) { trace.push(['command', ...args]); await hooks.command?.(); }, registerCommand(name, handler) { commands.set(name, handler); registrations.push(name);
    let disposed = false; return { dispose() { if (disposed) return; disposed = true; commands.delete(name); } }; } } };
  // Read the real status choices/labels; file and target resolution remain test boundaries.
  const settingsModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/data/settings-store.js'), 'utf8'), {
    module: settingsModule, require: name => name === 'vscode' ? vscode : name === 'fs/promises' ? require(name) : {},
  });
  const store = { WORK_STATUS_OPTIONS: settingsModule.exports.WORK_STATUS_OPTIONS,
    getWorkStatusLabel: settingsModule.exports.getWorkStatusLabel,
    async resolveSettingsTarget(item) { trace.push(['resolve', item]); await hooks.resolve?.(); return model.target; },
    async readSettingsFile(file, item) { trace.push(['read', file, item]); await hooks.read?.(); return structuredClone(model.settings); },
    async writeSettingsFile(file, data) { trace.push(['write', file, structuredClone(data)]); await hooks.write?.(); model.settings = structuredClone(data); },
  };
  const provider = {
    getWorkStatusFilter() { trace.push(['status.get']); hooks.get?.(); return model.statusFilters; },
    getWorkGenreFilter() { trace.push(['genre.get']); hooks.get?.(); return model.genreFilters; },
    getAvailableWorkGenres() { trace.push(['genres']); hooks.genres?.(); return model.genres; },
    async setWorkStatusFilter(values) { trace.push(['status.set', values]); await hooks.set?.(); model.statusFilters = [...values]; },
    async setWorkGenreFilter(values) { trace.push(['genre.set', values]); await hooks.set?.(); model.genreFilters = [...values]; },
    resolveCurrentViewWork() { trace.push(['currentWork']); return model.currentWork; },
    refresh() { trace.push(['refresh']); hooks.refresh?.(); },
  };
  const editorViews = {
    async openNoteWebview(ctx, provider, options) { trace.push(['note.open', ctx === context, provider === treeProviderRef(), options]); await hooks.open?.(); },
    async openConceptMemoWebview(ctx, provider, options) { trace.push(['concept.open', ctx === context, provider === treeProviderRef(), options]); await hooks.open?.(); },
    async openSettingsWebview(ctx, provider, item) { trace.push(['settings.open', ctx === context, provider === treeProviderRef(), item]); await hooks.open?.(); },
  };
  const treeProviderRef = () => provider;
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/tree/work-tree-commands.js'), 'utf8'), {
    module, console,
    require: name => name === 'vscode' ? vscode : name === 'fs/promises' ? (fileSystem || (creation ? recordedFs : require(name))) : ['path', 'child_process'].includes(name) ? require(name)
      : name === './work-tree-work-delete-actions' ? require('../../src/tree/work-tree-work-delete-actions')
      : name === './work-tree-trash-actions' ? require('../../src/tree/work-tree-trash-actions')
      : name === './work-tree-move-actions' ? require('../../src/tree/work-tree-move-actions')
      : name === './work-tree-rename-actions' ? require('../../src/tree/work-tree-rename-actions')
      : name === './work-tree-creation-actions' ? require('../../src/tree/work-tree-creation-actions')
      : name === './work-tree-editor-actions' ? require('../../src/tree/work-tree-editor-actions')
      : name === './work-tree-metadata-actions' ? require('../../src/tree/work-tree-metadata-actions')
      : name === '../data/settings-store' ? store
      : name === '../core/mojigoto-context' ? { isSingleMode: () => model.single, getWorkRoot: () => model.workRoot }
      : name === '../writing-memo/writing-memo-tracker' ? { resolveManuscriptRootForTreeItem(item, target) { trace.push(['manuscript.resolve', item, target]); return model.manuscriptRoot; } }
      : name === '../work/work-settings' ? { getCurrentWorkDisplayName: () => model.displayName }
      : name === '../core/mojigoto-paths' ? { getPreferredManuscriptDirName: () => model.manuscriptDir, getConceptMemosPathForSingle: () => model.conceptPath,
        getConceptMemosPathForWork: dir => model.conceptPath === '' ? '' : dir + '/concept.json' }
      : name === '../data/note-store' ? { async createNewNote(...args) { trace.push(['note.create', ...args]); await hooks.create?.(); return model.created; } }
      : ['../views/note-webview', '../views/concept-memo-webview', '../views/settings-webview'].includes(name) ? editorViews
      : name === './work-tree-provider' ? { WORK_STATUS_EMPTY_FILTER: '__empty__' } : {},
  });
  await module.exports.registerMojigotoTreeCommands(context, provider, undefined);
  return { trace, hooks, model, provider, commands, registrations, context, files, directories,
    select(value) { explicitSelection = true; model.selected = value; },
    run(name, item) { return commands.get('mojigoto.' + name)(item); },
  };
}
module.exports = { createTreeMetadataHarness };
