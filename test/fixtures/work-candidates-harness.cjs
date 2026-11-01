const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-23T05:00:00Z'])); } }

function createWorkCandidatesHarness({ source, fileSystem } = {}) {
  const trace = [], hooks = {}, files = new Map(), directories = new Set(), values = new Map();
  const context = { globalState: { get: (key, fallback) => values.get(key) ?? fallback, async update(key, value) { trace.push(['state.update', key, value]); values.set(key, value); } } };
  const root = path.resolve('/works');
  const config = { mode: 'multi', workRoot: root, manuscriptRoot: path.join(root, '_WORK', 'manuscript') };
  const model = { entries: ['作品10', '作品2'], cancel: false };
  for (const name of model.entries) directories.add(path.join(root, name, 'manuscript'));
  const fsp = {
    async readdir(dir, options) { trace.push(['readdir', dir, options]); await hooks.readdir?.();
      return fileSystem ? fileSystem.readdir(dir, options) : model.entries.map(name => ({ name, isDirectory: () => !name.endsWith('.txt') })); },
    async stat(file) { trace.push(['stat', file]); await hooks.stat?.(file);
      if (fileSystem) return fileSystem.stat(file);
      if (!directories.has(file)) throw new Error('missing'); return { isDirectory: () => true }; },
    async readFile(file, encoding) { trace.push(['read', file, encoding]); await hooks.read?.();
      return fileSystem ? fileSystem.readFile(file, encoding) : files.get(file); },
    async mkdir(...args) { trace.push(['mkdir', ...args]); await hooks.mkdir?.(); if (fileSystem) await fileSystem.mkdir(...args); },
    async writeFile(file, text, encoding) { trace.push(['write', file, text, encoding]); await hooks.write?.(); if (fileSystem) await fileSystem.writeFile(file, text, encoding); files.set(file, text); },
  };
  const sync = { readFileSync(file, encoding) { trace.push(['sync.read', file, encoding]); hooks.syncRead?.(); return fileSystem ? fs.readFileSync(file, encoding) : files.get(file); }, existsSync(file) { trace.push(['exists', file]); return fileSystem ? fs.existsSync(file) : file === config.workRoot || files.has(file); } };
  const cfg = { get(key, fallback) { trace.push(['config.get', key, fallback]); return config[key] ?? fallback; },
    async update(key, value, target) { trace.push(['config.update', key, value, target]); config[key] = value; } };
  const vscode = { ConfigurationTarget: { Workspace: 2 }, ProgressLocation: { Notification: 1 },
    workspace: { getConfiguration: () => cfg, textDocuments: [] },
    window: { async withProgress(options, callback) { trace.push(['progress', options]); return callback(); },
      async showQuickPick(items, options) { trace.push(['pick', items, options]); await hooks.pick?.(); return model.cancel ? undefined : items[0]; },
      showWarningMessage: value => trace.push(['warning', value]), showErrorMessage: value => trace.push(['error', value]), showInformationMessage: value => trace.push(['info', value]) },
    commands: { async executeCommand(...args) { trace.push(['command', ...args]); await hooks.command?.(...args); } },
  };
  const renameModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/work/work-folder-rename.js'), 'utf8'), { module: renameModule, Date: FixedDate, require });
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/work/work-switch-service.js'), 'utf8'), {
    module, console, process, Date: FixedDate, setTimeout: fn => { fn(); return 0; },
    require: name => name === 'vscode' ? vscode : name === 'fs/promises' ? fsp : name === 'fs' ? sync : name === 'path' ? path
      : name === './work-folder-rename' ? renameModule.exports
      : name === './work-switch-dirty-guard' ? require('../../src/work/work-switch-dirty-guard')
      : name === './work-switch-candidates' ? require('../../src/work/work-switch-candidates')
      : name === './work-meta-service' ? { setCurrentWorkName: async (ctx, value) => { trace.push(['currentWork', value]); await hooks.currentWork?.(); await ctx.globalState?.update('mojigoto.currentWorkName', value); } }
      : name === './manuscript-switch' ? { async switchManuscriptRoot(options) { trace.push(['switch', options.linkPath, options.targetPath, options.configuredRoot]); await hooks.switch?.(); return { fallback: false }; } } : {},
  });
  return { service: module.exports, trace, hooks, files, directories, root, config, model, context, values, vscode,
    collect: () => module.exports.collectWorkCandidates(config.workRoot, module.exports.getExcludeList(), module.exports.getManuscriptCandidates()),
    rename: event => module.exports.handleRenamedWorkFolders(context, event, { onAfterRename: async () => { trace.push(['afterRename']); await hooks.afterRename?.(); } }),
    switch: () => module.exports.switchWorkImpl({}, { onAfterSwitch: async options => trace.push(['afterSwitch', options]) }),
  };
}
module.exports = { createWorkCandidatesHarness };
