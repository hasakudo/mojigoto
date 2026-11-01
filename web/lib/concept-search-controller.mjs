import { createNoteSearchController } from './note-search-controller.mjs';
import { memoEditableText, applyMemoEditableText } from './concept-memos.mjs';

// Search uses a transient group per memo; only title/body changes return to the live document.
export function createConceptSearchController({ state, elements, document, scopeKey, commit, jumpToMemo, ...runtime }) {
  let draft = null, owner = null;
  function getNote() {
    const memos = state.conceptDocument?.memos;
    if (!memos) return null;
    const scope = scopeKey();
    const id = JSON.stringify([state.conceptFile?.id, memos.map(memo => [memo.id, memo.type,
      (memo.type === 'list' ? memo.listItems : memo.type === 'todo' ? memo.todoItems : [])?.map(row => row.id)])]);
    if (!owner || owner.provider !== state.provider || owner.work !== state.selectedWork || owner.scope !== scope || owner.id !== id) {
      owner = { provider: state.provider, work: state.selectedWork, scope, id };
      draft = { id, title: 'この作品の全構想メモ', groups: [] };
    }
    draft.groups = memos.map(memo => ({ id: memo.id, title: memo.title,
      items: [{ id: JSON.stringify(['body', memo.id]), kind: 'entry', body: memoEditableText(memo) }] }));
    return draft;
  }
  function validate(changes) {
    for (const change of changes) {
      const memo = state.conceptDocument.memos.find(memo => memo.id === change.groupId);
      if (!memo) return '対象メモを確認できません。検索し直してください。';
      if (change.field === 'title' && /[\r\n]/.test(change.after)) return 'タイトルに改行を含む置換はできません。';
      if (change.field !== 'body' || !['list', 'todo'].includes(memo.type)) continue;
      const before = change.before.split(/\r?\n/), after = change.after.split(/\r?\n/);
      if (before.length !== after.length || before.some((line, i) => Boolean(line.trim()) !== Boolean(after[i].trim()))) return 'リスト・TODOの行を追加・削除する置換はできません。本文を直接編集してください。';
      if (memo.type === 'todo' && before.some((line, i) => (line.trim().match(/^\[[ xX]\]\s*/)?.[0] || '') !== (after[i].trim().match(/^\[[ xX]\]\s*/)?.[0] || ''))) return 'TODOのチェック記号を変える置換はできません。';
    }
    return '';
  }
  const aliases = {};
  for (const key of ['openNoteSearchButton','closeNoteSearchButton','noteSearchDialog','noteSearchTitle','noteSearchQuery','noteSearchNames','noteSearchDetails','noteSearchMemos','noteSearchCase','noteSearchResults','noteSearchStatus','noteSearchPrev','noteSearchNext','noteSearchPage','noteSearchFilter','noteSearchFilterSummary','noteReplaceMode','noteReplaceFields','noteReplaceText','noteReplaceActions','noteReplaceSelectAll','noteReplaceClear','noteReplaceApply','noteReplaceUndo']) aliases[key] = elements[key.replace('NoteSearch','ConceptSearch').replace(/^note/,'concept')];
  return createNoteSearchController({ state, elements: aliases, document, scopeKey, ...runtime, getNote, getItem: () => state.conceptFile,
    isVisible: () => !elements.conceptMemosSection.hidden,
    extraBusy: () => Boolean(state.conceptSyncPending || state.conceptSwitchPending || state.conceptSyncBlocked || state.conceptBatchSaving),
    validateChanges: validate, defaultFields: { names: true, details: true, memos: false }, fieldLabels: { names: 'タイトル', details: '本文' },
    formatLocation: (field, row) => `${field.groupTitle || '名称未設定'} / ${field.field === 'title' ? 'タイトル' : '本文'}・${row.line}行 ${row.column}文字目`,
    jumpToField: (field, row) => jumpToMemo(field.groupId, field.field, field.before, row.start, row.end),
    onChange: () => {
      const changed = [];
      for (const group of draft.groups) {
        const memo = state.conceptDocument.memos.find(memo => memo.id === group.id);
        if (memo.title === group.title && memoEditableText(memo) === group.items[0].body) continue;
        if (memoEditableText(memo) !== group.items[0].body) applyMemoEditableText(memo, group.items[0].body);
        memo.title = group.title;
        memo.updatedAt = new Date().toISOString();
        changed.push(memo.id);
      }
      commit(changed);
    },
  });
}
