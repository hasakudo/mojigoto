const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWorkDirtyHarness({ source, fileSystem } = {}) {
  const trace = [], hooks = {}, files = new Map(), documents = [];
  const root = path.resolve('/view/manuscript');
  const model = { realRoot: path.resolve('/source/manuscript'), choices: ['execute', 'normal'], saveResult: true, keepDirty: false };
  let activeDoc;
  const fsp = {
    async realpath(file) { trace.push(['realpath', file]); await hooks.realpath?.(); return model.realRoot; },
    async mkdir(file, options) { trace.push(['mkdir', file, options]); await hooks.mkdir?.(); if (fileSystem) await fileSystem.mkdir(file, options); },
    async writeFile(file, text, encoding) { trace.push(['write', file, text, encoding]); await hooks.write?.();
      if (fileSystem) await fileSystem.writeFile(file, text, encoding); files.set(file, text); },
    async readdir() { return [{ name: '次作品', isDirectory: () => true }]; },
    async stat() { return { isDirectory: () => true }; },
  };
  const cfg = { get: (key, fallback) => ({ mode: 'multi', workRoot: path.resolve('/works'), manuscriptRoot: root })[key] ?? fallback };
  const vscode = { QuickPickItemKind: { Separator: -1 }, ConfigurationTarget: { Workspace: 2 }, ProgressLocation: { Notification: 1 },
    workspace: { textDocuments: documents, getConfiguration: () => cfg },
    window: { async withProgress(_, callback) { return callback(); },
      async showQuickPick(items, options) {
        if (items[0]?.workName) return items[0];
        trace.push(['pick', items.map(item => ({ ...item, __doc: item.__doc?.uri.fsPath })), options]); await hooks.pick?.();
        const choice = model.choices.shift();
        if (typeof choice === 'number') return items[choice];
        const labels = { execute: '✅ この内容で切替（実行）', save: '💾 すべて保存して切替', discard: '🗑️ すべて破棄して切替', cancel: '↩ キャンセル', normal: '通常保存（VS Codeの保存）', real: 'リンク元に保存（安全）' };
        if (labels[choice]) return items.find(item => item.label === labels[choice]);
        if (choice?.startsWith('doc:')) return items.find(item => item.__doc && path.basename(item.__doc.uri.fsPath) === choice.slice(4));
        return undefined;
      },
      async showTextDocument(doc, options) { trace.push(['show', doc.uri.fsPath, options]); await hooks.show?.(); activeDoc = doc; },
      showErrorMessage: message => trace.push(['error', message]), showWarningMessage: message => trace.push(['warning', message]), showInformationMessage: message => trace.push(['info', message]),
    },
    commands: { async executeCommand(name) { trace.push(['command', name]); await hooks.command?.();
      if (name === 'workbench.action.revertAndCloseActiveEditor' && activeDoc) { activeDoc.isDirty = false; activeDoc.isClosed = true; } } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/work/work-switch-service.js'), 'utf8'), {
    module, process, console, setTimeout: fn => { fn(); return 0; },
    require: name => name === 'vscode' ? vscode : name === 'fs' ? { promises: fsp, existsSync: () => true }
      : name === 'fs/promises' ? fsp : name === 'path' ? path
      : name === './work-folder-rename' ? require('../../src/work/work-folder-rename')
      : name === './work-switch-dirty-guard' ? require('../../src/work/work-switch-dirty-guard')
      : name === './work-switch-candidates' ? require('../../src/work/work-switch-candidates')
      : name === './manuscript-switch' ? { async switchManuscriptRoot() { trace.push(['switch']); return { fallback: false }; } }
      : name === './work-meta-service' ? { async setCurrentWorkName() { trace.push(['currentWork']); } } : {},
  });
  function doc(name = 'a.txt', options = {}) {
    const d = { isDirty: true, uri: { scheme: 'file', fsPath: path.join(root, name) }, getText: () => options.text ?? '未保存の本文',
      async save() { trace.push(['save', d.uri.fsPath]); await hooks.save?.(); if (model.saveResult && !model.keepDirty) d.isDirty = false; return model.saveResult; }, ...options };
    documents.push(d); return d;
  }
  return { trace, hooks, files, documents, model, root, doc, service: module.exports,
    run: manuscriptRoot => module.exports.guardDirtyDocsBeforeSwitch(manuscriptRoot === undefined ? root : manuscriptRoot),
    switch: () => module.exports.switchWorkImpl({}),
  };
}
module.exports = { createWorkDirtyHarness };
