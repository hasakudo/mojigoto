function buildConceptMemoDataFromMessage(message, currentData, ownConceptRevisions) {
  const incomingRevision = message?.payload?.storageRevision || currentData?.storageRevision;
  let memos = Array.isArray(message?.payload?.memos) ? message.payload.memos : [];
  if (ownConceptRevisions.has(incomingRevision)) {
    memos = memos.map((memo) => {
      const latest = currentData.memos.find((candidate) => candidate.id === memo.id);
      if (memo.source?.kind !== "noteItem" || latest?.source?.kind !== "noteItem"
        || memo.source.itemId !== latest.source.itemId || memo.source.notePath !== latest.source.notePath) return memo;
      return { ...memo, source: { ...memo.source,
        syncFingerprint: latest.source.syncFingerprint, syncedAt: latest.source.syncedAt,
      } };
    });
  }
  return {
    storageRevision: ownConceptRevisions.has(incomingRevision) ? currentData.storageRevision : incomingRevision,
    version: 1,
    updatedAt: new Date().toISOString(),
    memos,
    folders: Array.isArray(message?.payload?.folders)
      ? message.payload.folders
      : [],
    commonTodoItems: [],
    autoSyncToNoteItemDefault: Boolean(
      message?.payload?.autoSyncToNoteItemDefault,
    ),
  };
}

module.exports = { buildConceptMemoDataFromMessage };
