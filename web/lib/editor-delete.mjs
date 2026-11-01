import { normalizeConceptDocument } from "./concept-memos.mjs";
import { writeTextWithBaseline } from "./editor-sync.mjs";

export async function deleteEditorItem(provider, { kind, item, raw, memoId }) {
  if (kind === "concept") {
    const document = normalizeConceptDocument(JSON.parse(raw));
    const memos = document.memos.filter((memo) => memo.id !== memoId);
    // A newly added memo may not have been saved yet.
    if (memos.length === document.memos.length) return null;
    document.memos = memos;
    document.updatedAt = new Date().toISOString();
    const content = `${JSON.stringify(document, null, 2)}\n`;
    const saved = await writeTextWithBaseline(provider, item, content, raw, "concept");
    return { item: { ...item, ...saved }, document, raw: content };
  }
  if (!["manuscript", "note"].includes(kind) || !item?.id) {
    throw new Error("削除するファイルを確認できませんでした。");
  }
  await provider.deleteItem(item);
  return null;
}
