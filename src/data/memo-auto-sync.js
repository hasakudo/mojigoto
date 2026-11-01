function hasBooleanOverride(value) {
  return typeof value === "boolean";
}

function isNoteMemoAutoSyncEnabled(memo, globalDefault = false) {
  if (hasBooleanOverride(memo?.autoSyncToConceptMemoOverride)) {
    return memo.autoSyncToConceptMemoOverride;
  }
  // 既存データで明示的にONだった状態は、設定移行後も維持する。
  if (memo?.autoSyncToConceptMemo === true) return true;
  return Boolean(globalDefault);
}

function isConceptMemoAutoSyncEnabled(source, globalDefault = false) {
  if (hasBooleanOverride(source?.autoSyncToNoteItemOverride)) {
    return source.autoSyncToNoteItemOverride;
  }
  // 既存データで明示的にONだった状態は、設定移行後も維持する。
  if (source?.autoSyncToNoteItem === true) return true;
  return Boolean(globalDefault);
}

module.exports = {
  hasBooleanOverride,
  isNoteMemoAutoSyncEnabled,
  isConceptMemoAutoSyncEnabled,
};
