const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const { makeStatsScript } = require('../src/stats/stats-html/stats-html-script');
const script = makeStatsScript();
const initial = script.slice(0, script.indexOf('    let selectedHighlightGroup'));
const apply = script.match(/    function applyHideZeroGroups\(\) \{[^]*?\n    }/)[0];
const toggleStart = script.indexOf('      const hideZeroToggle =');
const toggle = script.slice(toggleStart, script.indexOf('\n    }', toggleStart));

test('ホストの保存済みON/OFFを優先し、未移行時は旧Webview状態へフォールバックする', () => {
  for (const [host, legacy, expected] of [['true', false, true], ['false', true, false], ['', true, true], ['', false, false]]) {
    const context = vm.createContext({ acquireVsCodeApi: () => ({ getState: () => ({ hideZeroGroups: legacy }) }),
      document: { body: { dataset: { hideZeroGroups: host } }, getElementById: () => null } });
    vm.runInContext(initial + '\nglobalThis.checked = hideZeroGroups;', context);
    assert.equal(context.checked, expected);
  }
});

test('チェック変更は0件行だけを隠し、保存メッセージにON/OFFと現在画面を付ける', () => {
  const messages = [], toggleNode = { checked: false, addEventListener: (_, fn) => { toggleNode.change = fn; } };
  const rows = ['0', '3', '-'].map(textContent => ({ style: {}, querySelector: () => ({ textContent }) }));
  const context = vm.createContext({ acquireVsCodeApi: () => ({ getState: () => ({}), postMessage: value => messages.push(value) }),
    saveUiState() {}, document: { body: { dataset: { hideZeroGroups: 'false', statsRenderId: 'current' } },
      getElementById: id => id === 'toggleHideZero' ? toggleNode : null, querySelectorAll: () => rows } });
  vm.runInContext(initial + '\n' + apply + '\n' + toggle, context);
  for (const checked of [true, false]) {
    toggleNode.checked = checked; toggleNode.change();
    assert.equal(rows[0].style.display, checked ? 'none' : '');
    assert.equal(rows[1].style.display, ''); assert.equal(rows[2].style.display, '');
    assert.equal(messages.at(-1).enabled, checked);
    assert.equal(messages.at(-1).renderId, 'current');
    assert.equal(messages.at(-1).source, 'change');
  }
});
