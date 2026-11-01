const vm = require('node:vm');
const { getGroupsScript } = require('../../src/views/note-webview/script-groups');
const { getEventsScript } = require('../../src/views/note-webview/script-events');

function createNoteNamesClientHarness(html, note, { defaultSync = true, groupsScript = getGroupsScript(), eventsScript = getEventsScript() } = {}) {
  const messages = [], inputs = new Map(); let receive;
  const input = (field, itemId) => {
    const listeners = {};
    const el = { dataset: { field, groupId: 'g', itemId }, value: '', addEventListener(name, fn) { listeners[name] = fn; } };
    el.emit = value => { el.value = value; listeners.input({ target: el }); };
    return el;
  };
  for (const [field, id] of [['groupTitle'], ['itemHeading', 'i'], ['dividerLabel', 'd'], ['dividerValue', 'd'], ['itemBody', 'i'], ['itemHeadingRuby', 'i']]) inputs.set(field, input(field, id));
  const titleInput = input('noteTitle'); titleInput.value = note.title;
  const dirtyBadgeEl = { hidden: true }, dirtyMarkEl = { hidden: true }, boardDirtyBadgeEl = { hidden: true };
  const context = vm.createContext({ state: JSON.parse(JSON.stringify(note)), initial: { noteMemoAutoSyncDefault: defaultSync },
    titleInput, dirtyBadgeEl, dirtyMarkEl, boardDirtyBadgeEl, dirty: false, changeRevision: 0, suppressNextNoteSavedMessage: false,
    vscode: { postMessage: message => messages.push(JSON.parse(JSON.stringify(message))) },
    groupsRoot: { querySelectorAll: () => [...inputs.values()] },
    window: { addEventListener(name, fn) { if (name === 'message') receive = fn; } },
    renderPreview() {}, renderNoteToc() {}, queueNoteDisplaySnapshot() {}, setStatus() {}, updateItemMemoMeta() {},
  });
  function functionText(name) {
    const start = html.indexOf('    function ' + name + '(');
    const end = html.indexOf('\n    }', start);
    if (start < 0 || end < 0) throw Error('missing generated function: ' + name);
    return html.slice(start, end + 6);
  }
  vm.runInContext(groupsScript, context);
  vm.runInContext(eventsScript, context);
  for (const name of ['updateDirtyUi', 'markDirty', 'clearDirty', 'collectPayload']) vm.runInContext(functionText(name), context);
  context.registerTitleEvents(); context.registerMessageEvents();
  const start = groupsScript.indexOf('      groupsRoot.querySelectorAll("[data-field]")');
  const end = groupsScript.indexOf('      groupsRoot.querySelectorAll("[data-action=', start);
  if (start < 0 || end < 0) throw Error('missing generated input binding');
  vm.runInContext(groupsScript.slice(start, end), context);
  return { context, messages, dirtyBadgeEl, dirtyMarkEl, boardDirtyBadgeEl,
    edit(field, value) { (field === 'noteTitle' ? titleInput : inputs.get(field)).emit(value); },
    receive: message => receive({ data: message }),
  };
}
module.exports = { createNoteNamesClientHarness };
