import { createConceptMemo, conceptSourceFileName } from "./concept-memos.mjs";
import { applyNotePayloadToConcept, noteMemoPayload, syncFingerprint } from "./concept-sync.mjs";

export function ensureNoteItemConcept(document, note, groupIndex, itemIndex, notePath) {
  const group = note?.groups?.[groupIndex];
  const item = group?.items?.[itemIndex];
  if (!item?.id || item.kind !== "entry" || !group?.id) throw new Error("項目メモを確認できませんでした。");
  const fileName = conceptSourceFileName({ notePath });
  const linked = item.memo?.linkedConceptMemoIds || [];
  const existing = document.memos.find((memo) => memo.source?.kind === "noteItem"
    && memo.source.itemId === item.id && memo.source.noteType === note.type
    && (linked.includes(memo.id) || conceptSourceFileName(memo.source) === fileName));
  // A previous attempt may have saved the concept but failed to save the note.
  // Reconnect it without overwriting edits made on the concept side.
  if (existing) return { memo: existing, created: false };
  const payload = noteMemoPayload(item.memo);
  const memo = createConceptMemo({
    title: String(item.heading || "").trim() || "無題メモ",
    type: payload.type,
    folderIds: document.folders.some((folder) => folder.id === "note-item") ? ["note-item"] : [],
    order: Math.max(0, ...document.memos.map((entry) => Number(entry.order) || 0)) + 1,
    source: {
      kind: "noteItem", notePath, noteType: note.type, noteTitle: note.title,
      groupId: group.id, groupTitle: group.title, itemId: item.id, itemHeading: item.heading,
      autoSyncToConceptMemo: Boolean(item.memo?.autoSyncToConceptMemo),
      autoSyncToNoteItem: Boolean(document.autoSyncToNoteItemDefault),
      syncFingerprint: syncFingerprint(payload), status: "active",
    },
  });
  applyNotePayloadToConcept(memo, item.memo);
  document.memos.push(memo);
  document.updatedAt = memo.updatedAt;
  return { memo, created: true };
}
