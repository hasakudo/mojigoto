const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWorkSwitchCommandHarness({ source, switchService, options = {} } = {}) {
  const trace = [], hooks = {}, commands = new Map();
  const model = { switchResult: true, picked: { label: '次の作品', workName: 'next' } };
  const context = { subscriptions: [] }, previewState = { enabled: true };
  let statusText = '元の作品';
  const itemWork = { get text() { return statusText; }, set text(value) { statusText = value; trace.push(['statusbar', value]); } };
  const effect = name => async (...args) => { trace.push([name, ...args.map(value => value === context ? 'context' : value)]); await hooks[name]?.(); };
  const vscode = { commands: {
    registerCommand(name, fn) { commands.set(name, fn); return { dispose() { commands.delete(name); } }; },
    async executeCommand(name) { trace.push(['command', name]); await hooks.command?.(name); },
  }, window: { showInformationMessage: value => trace.push(['info', value]) } };
  const service = {
    async switchWorkImpl(ctx, config) {
      trace.push(['switch.start', ctx === context, config.itemWork === itemWork]); await hooks.switch?.();
      if (switchService) return switchService.switchWorkImpl(ctx, config);
      if (!model.switchResult) return false;
      trace.push(['reference.changed']); await config.onAfterSwitch({ picked: model.picked }); return true;
    }, closeEditorsUnderManuscriptRoot: effect('close'),
  };
  const module = { exports: {} };
  vm.runInNewContext(source || fs.readFileSync(path.join(__dirname, '../../src/work/work-commands.js'), 'utf8'), {
    module,
    require: name => name === 'vscode' ? vscode : name === './work-switch-command' ? require('../../src/work/work-switch-command')
      : name === './work-switch-service' ? service : name === '../stats/stats-service' ? { resetDiffForCurrentWork: effect('reset') } : {},
  });
  module.exports.registerWorkCommands(context, {
    itemWork, previewState, ensureProjectNameFilled: effect('ensure'), importSharedWritingRecords: effect('import'),
    scheduleRecalc: value => { trace.push(['recalc', value]); hooks.recalc?.(); },
    refreshStatsPanel: () => { trace.push(['stats']); hooks.stats?.(); }, ...options,
  });
  return { trace, hooks, model, context, commands, itemWork, previewState, run: () => commands.get('mojigoto.switchWorkAndRestart')() };
}
module.exports = { createWorkSwitchCommandHarness };
