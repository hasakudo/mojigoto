const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const format = require('../../src/backup/backup-format');

function createBackupStorageHarness({ manuscriptSource, structuredSource, writerSource, directory = path.resolve('work'), realFiles = false } = {}) {
  const files = new Map(), directories = new Set(), hooks = {}, trace = [], commands = new Map();
  const model = { intervalMinutes: 0, maxPerFile: 50, realPaths: new Map() };
  const manuscriptRoot = path.join(directory, 'manuscript'), mojigoto = path.join(directory, '.mojigoto');
  const indexPath = path.join(mojigoto, 'backups/index.json'); let id = 0;
  const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
  const missing = () => Object.assign(Error('missing'), { code: 'ENOENT' });
  const memory = {
    async readFile(file) { const raw = files.get(key(file)); if (raw === undefined) throw missing(); await hooks.read?.(file); return raw; },
    async mkdir(dir) { let cursor = path.resolve(dir); while (!directories.has(key(cursor))) { directories.add(key(cursor)); const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent; } },
    async writeFile(file, content, options) { await hooks.write?.(file); if (options?.flag === 'wx' && files.has(key(file))) throw Object.assign(Error('exists'), { code: 'EEXIST' }); files.set(key(file), String(content)); },
    async open(file, flags) {
      await hooks.open?.(file);
      if (flags === 'wx' && files.has(key(file))) throw Object.assign(Error('exists'), { code: 'EEXIST' });
      files.set(key(file), ''); trace.push(['open', file]);
      return { writeFile: (content, options) => memory.writeFile(file, content, options), async close() { trace.push(['close', file]); } };
    },
    async copyFile(from, to, flags) {
      await hooks.copy?.(from, to);
      if (!files.has(key(from))) throw missing();
      if (flags === fs.constants.COPYFILE_EXCL && files.has(key(to))) throw Object.assign(Error('exists'), { code: 'EEXIST' });
      files.set(key(to), files.get(key(from)));
    },
    async rename(from, to) { await hooks.rename?.(from, to); if (!files.has(key(from))) throw missing(); files.set(key(to), files.get(key(from))); files.delete(key(from)); },
    async unlink(file) { if (!files.delete(key(file))) throw missing(); },
    async readdir(dir) { return [...files.keys()].filter(file => path.dirname(file) === key(dir)).map(file => path.basename(file)); },
  };
  const io = realFiles ? fs.promises : memory;
  const fileSystem = realFiles ? fs : { promises: io, constants: fs.constants,
    existsSync: file => files.has(key(file)) || directories.has(key(file)), realpathSync: file => model.realPaths.get(path.resolve(file)) || path.resolve(file) };
  for (const dir of [directory, manuscriptRoot, mojigoto]) directories.add(key(dir));
  const vscode = { Uri: { file: fsPath => ({ fsPath }) }, window: {
    async showQuickPick(choices) { return hooks.pick?.(choices); }, async showWarningMessage() { return '復元する'; },
    showInformationMessage: message => trace.push(['info', message]), showErrorMessage: message => trace.push(['error', message]),
  }, workspace: { onDidSaveTextDocument: () => ({ dispose() {} }) },
    commands: { registerCommand(name, fn) { commands.set(name, fn); return { dispose() {} }; } },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const source = name === 'backup/manuscript-backup' && manuscriptSource ? manuscriptSource : name === 'backup/structured-data-backup' && structuredSource ? structuredSource : name === 'data/structured-file-write' && writerSource ? writerSource : fs.readFileSync(path.join(__dirname, '../../src', name + '.js'), 'utf8');
    class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-25T05:00:00Z'])); } static now() { return Date.parse('2026-10-25T05:00:00Z'); } }
    vm.runInNewContext(source, { module, process, Date: FixedDate, console,
      require(request) {
        if (request === 'fs') return fileSystem;
        if (request === 'fs/promises') return io;
        if (request === 'path') return path;
        if (request === 'crypto') return { ...crypto, randomUUID: () => hooks.uuid?.() || crypto.randomUUID() };
        if (request === 'vscode') return vscode;
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), request));
        if (target === 'backup/backup-format') return { ...format, createBackupId: () => 'snapshot-' + (++id) };
        if (target === 'backup/backup-settings') return { readBackupSettings: () => ({ ...model }) };
        if (target === 'backup/backup-content-provider') return { registerBackupContentProvider() {} };
        if (target === 'core/mojigoto-context') return { getManuscriptCandidates: () => ['manuscript'], getResolvedManuscriptRoot: () => manuscriptRoot, getWorkspaceRoot: () => directory };
        return load(target);
      },
    });
    cache.set(name, module.exports); return module.exports;
  }
  const manuscript = load('backup/manuscript-backup'), structured = load('backup/structured-data-backup');
  return { files, hooks, trace, commands, model, indexPath, manuscriptRoot, mojigoto, manuscript, structured,
    storage: () => load('backup/backup-storage'),
    writer: () => load('data/structured-file-write'),
    addDirectory(dir) { directories.add(key(dir)); },
    seed(file, content) { files.set(key(file), content); },
    async readIndex() { return JSON.parse(await io.readFile(indexPath, 'utf8')); },
    document(name = 'chapter.txt', text = '原稿本文') {
      const document = { version: 1, uri: { scheme: 'file', fsPath: path.join(manuscriptRoot, name), toString() { return this.fsPath; } },
        getText: () => text, setText(value) { text = value; document.version++; } };
      vscode.window.activeTextEditor = { document }; return document;
    },
    async drain() { await new Promise(resolve => setImmediate(resolve)); },
  };
}
module.exports = { createBackupStorageHarness };
