import { readVerifiedFile } from "./verified-file-read.mjs";
import { NOTE_TYPES } from "./notes.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";
import { ensureNoteItemConcept } from "./note-concept-link.mjs";
import { analyzeConceptNoteSync, applyNotePayloadToConcept } from "./concept-sync.mjs";
import { shouldReflectNoteItem } from "./memo-auto-reflect.mjs";

const verifiedConceptFiles = new WeakMap();

// Link metadata is written using the already-saved note, never input added during reflection.
export async function syncNoteWithGlobalDefaults({ state, noteEntry, itemIds = null, writeTextWithBaseline, measure = (_label, operation) => operation() }) {
  const provider = state.provider, work = state.selectedWork, liveEntry = state.currentNote, root = state.workRoot;
  const snapshot = structuredClone(noteEntry);
  const items = snapshot.data.groups.flatMap((group) => (group.items || []).map((item) => ({ group, item })))
    .filter(({ item }) => (!itemIds || itemIds.includes(item.id)) && shouldReflectNoteItem(state, item));
  if (!items.length || !work?.mojigoto) return { updated: 0, conflicts: 0, created: 0 };
  const ids = snapshot.data.groups.flatMap((group) => group.items || []).filter((item) => item.kind === "entry").map((item) => item.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("項目IDが重複しているため、自動反映を停止しました。ノートを確認してください。");
  const current = () => {
    if (state.provider !== provider || state.selectedWork !== work || state.currentNote !== liveEntry || state.workRoot !== root) {
      throw new Error("編集対象が切り替わったため、自動反映を停止しました。");
    }
  };
  let known = verifiedConceptFiles.get(provider);
  if (!known) { known = new WeakMap(); verifiedConceptFiles.set(provider, known); }
  const cached = known.get(work);
  let verified = cached?.root === root ? await measure("ノート反映・構想版確認", () => readVerifiedFile(provider, cached, work.mojigoto.id, "concept-memos.json")) : null; current();
  let file = verified?.item;
  if (!file) {
    const children = await measure("ノート反映・構想ファイル探索", () => provider.listChildren(work.mojigoto.id)); current();
    file = children.find((item) => item.file && item.name === "concept-memos.json");
  }
  if (!file && state.cloudKind === "googleDrive") {
    throw new Error("構想メモのファイルを確認できません。Google Driveの設定ページでconcept-memos.jsonを追加許可してください。重複を防ぐため新規作成していません。");
  }
  if (file && !file.eTag) throw new Error("構想メモの版を確認できないため、自動反映を停止しました。再読み込みしてください。");
  let raw = verified ? verified.raw : file ? await measure("ノート反映・構想本文取得", () => provider.readText(file)) : "{}"; current();
  const document = normalizeConceptDocument(JSON.parse(raw));
  let created = 0, updated = 0, conflicts = 0;
  const links = [];
  for (const { group, item } of items) {
    if (!shouldReflectNoteItem(state, item)) continue;
    let ids = item.memo.linkedConceptMemoIds?.filter(Boolean) || [];
    if (!ids.length) {
      const result = ensureNoteItemConcept(document, snapshot.data, snapshot.data.groups.indexOf(group),
        group.items.indexOf(item), `.mojigoto/${NOTE_TYPES[snapshot.data.type].folder}/${snapshot.item.name}`);
      ids = [result.memo.id];
      item.memo.linkedConceptMemoIds = ids;
      item.memo.conceptMemoSyncFingerprint = result.memo.source.syncFingerprint || "";
      item.memo.conceptMemoSyncedAt = result.memo.source.syncedAt || "";
      links.push({ id: item.id, memo: structuredClone(item.memo) });
      if (result.created) created++;
    }
    for (const id of ids) {
      const memo = document.memos.find((candidate) => candidate.id === id);
      if (!memo) { conflicts++; continue; }
      const analysis = analyzeConceptNoteSync(memo, item.memo);
      if (analysis.status === "synced") continue;
      if (analysis.status !== "note-changed") { conflicts++; continue; }
      applyNotePayloadToConcept(memo, item.memo);
      memo.updatedAt = new Date().toISOString();
      memo.source = { ...memo.source, syncFingerprint: analysis.noteFingerprint, syncedAt: memo.updatedAt, status: "active" };
      updated++;
    }
  }
  // Recheck settings after cloud reads and before the first write.
  if (items.some(({ item }) => !shouldReflectNoteItem(state, item))) return { updated: 0, conflicts: 0, created: 0 };
  if (created || updated) {
    current(); document.updatedAt = new Date().toISOString();
    const content = `${JSON.stringify(document, null, 2)}\n`;
    const saved = await measure("ノート反映・構想書込", () => file ? provider.writeText(file, content, file.eTag)
      : provider.createTextFile(work.mojigoto, "concept-memos.json", content));
    current(); raw = content; file = { ...file, ...saved }; work.conceptFile = file; state.conceptLoadedAt = 0;
  }
  if (provider.supportsVersionedContentCache && file?.eTag) known.set(work, { root, item: structuredClone(file), raw });
  if (links.length) {
    current();
    const attach = (note) => {
      for (const link of links) {
        const item = note.groups.flatMap((group) => group.items || []).find((item) => item.id === link.id);
        if (!item) continue;
        item.memo.linkedConceptMemoIds = link.memo.linkedConceptMemoIds;
        item.memo.conceptMemoSyncFingerprint = link.memo.conceptMemoSyncFingerprint;
        item.memo.conceptMemoSyncedAt = link.memo.conceptMemoSyncedAt;
      }
    };
    attach(liveEntry.data); state.dirty = true;
    // A retry finds concepts by source item/path, including when this second write fails.
    const content = `${JSON.stringify(snapshot.data, null, 2)}\n`;
    const saved = await measure("ノート反映・リンク情報保存", () => writeTextWithBaseline(provider, snapshot.item, content, snapshot.raw, "note")); current();
    attach(liveEntry.data);
    state.currentNote = { ...liveEntry, item: { ...liveEntry.item, ...saved }, data: liveEntry.data, raw: content };
    state.dirty = JSON.stringify(liveEntry.data) !== JSON.stringify(snapshot.data);
    state.noteEntriesCache?.delete(`${work.id}:${state.noteType}`);
  }
  return { updated, conflicts, created };
}
