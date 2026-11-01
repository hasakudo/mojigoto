// Same precedence as VS Code's src/data/memo-auto-sync.js.
export function isNoteMemoAutoSyncEnabled(memo, globalDefault = false) {
  if (typeof memo?.autoSyncToConceptMemoOverride === "boolean") return memo.autoSyncToConceptMemoOverride;
  return memo?.autoSyncToConceptMemo === true || Boolean(globalDefault);
}
export function isConceptMemoAutoSyncEnabled(source, globalDefault = false) {
  if (typeof source?.autoSyncToNoteItemOverride === "boolean") return source.autoSyncToNoteItemOverride;
  return source?.autoSyncToNoteItem === true || Boolean(globalDefault);
}
export function noteAutoReflectEnabled(state, memo) {
  return state.memoAutoReflectDefaults && state.memoAutoReflectDefaults.confirmed_note !== false
    ? isNoteMemoAutoSyncEnabled(memo, state.memoAutoReflectDefaults.note)
    : state.noteToConceptAutoReflect !== false && isNoteMemoAutoSyncEnabled(memo);
}
export function conceptAutoReflectEnabled(state, source) {
  return state.memoAutoReflectDefaults && state.memoAutoReflectDefaults.confirmed_concept !== false
    ? isConceptMemoAutoSyncEnabled(source, state.memoAutoReflectDefaults.concept)
    : state.conceptToNoteAutoReflect !== false && isConceptMemoAutoSyncEnabled(source);
}
export function shouldReflectNoteItem(state, item) {
  if (item?.kind !== "entry" || !noteAutoReflectEnabled(state, item.memo)) return false;
  if (Array.isArray(item.memo?.linkedConceptMemoIds) && item.memo.linkedConceptMemoIds.some(Boolean)) return true;
  return Boolean(state.memoAutoReflectDefaults && state.memoAutoReflectDefaults.confirmed_note !== false && (String(item.memo?.body || "").trim() || item.memo?.tags?.length));
}
export function autoReflectSelection(value, field, override) {
  return typeof value?.[override] === "boolean" ? (value[override] ? "on" : "off")
    : value?.[field] === true ? "on" : "inherit";
}
export function setAutoReflectSelection(value, field, override, selection) {
  value[override] = selection === "inherit" ? null : selection === "on";
  value[field] = selection === "on";
}
