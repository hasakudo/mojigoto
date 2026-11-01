// Strictly enumerate readable works before any writes. Do not create cloud folders/files here.
export async function keepExistingMemoDefaultsOff(provider, root, direction, { assertCurrent = () => {}, onSaved = () => {} } = {}) {
  const list = async (folder) => { assertCurrent(); const items = await provider.listChildren(folder.id); assertCurrent(); return items; };
  const children = await list(root);
  const metadata = (items) => items.find((item) => item.folder && item.name === ".mojigoto");
  const works = [];
  for (const folder of children.filter((item) => item.folder && !item.name.startsWith(".")
    && !["_WORK", "MANUSCRIPT", "原稿"].includes(item.name.toUpperCase()))) {
    const found = metadata(await list(folder));
    if (found) works.push({ id: folder.id, metadata: found });
  }
  if (!works.length && metadata(children)) works.push({ id: root.id, metadata: metadata(children) });
  const plan = [];
  async function inspect(item, workId, kind) {
    assertCurrent();
    const raw = await provider.readText(item); assertCurrent();
    const data = JSON.parse(raw);
    if (!item.eTag) throw new Error("既存メモの版を確認できないため、全体設定の変更を停止しました。");
    let changed = false;
    if (kind === "note") {
      if (!Array.isArray(data.groups)) throw new Error("既存ノートの形式を確認できません。ノートを保存し直してください。");
      for (const group of data.groups) for (const entry of group.items || []) {
        const memo = entry.memo;
        if (entry.kind !== "entry" || !memo || memo.autoSyncToConceptMemo === true
          || typeof memo.autoSyncToConceptMemoOverride === "boolean") continue;
        memo.autoSyncToConceptMemoOverride = false; changed = true;
      }
    } else {
      if (!Array.isArray(data.memos)) throw new Error("既存の構想メモの形式を確認できません。");
      for (const memo of data.memos) {
        const source = memo.source;
        if (source?.kind !== "noteItem" || source.autoSyncToNoteItem === true
          || typeof source.autoSyncToNoteItemOverride === "boolean") continue;
        source.autoSyncToNoteItemOverride = false; changed = true;
      }
    }
    if (changed) plan.push({ item, data, workId, kind });
  }
  for (const work of works) {
    const entries = await list(work.metadata);
    if (direction === "note") {
      for (const folder of entries.filter((item) => item.folder && ["plots", "references"].includes(item.name))) {
        for (const file of (await list(folder)).filter((item) => item.file && /\.json$/i.test(item.name))) await inspect(file, work.id, "note");
      }
    } else {
      const file = entries.find((item) => item.file && item.name === "concept-memos.json");
      if (file) await inspect(file, work.id, "concept");
    }
  }
  let written = 0;
  try {
    for (const entry of plan) {
      assertCurrent();
      const content = JSON.stringify(entry.data, null, 2) + "\n";
      const saved = await provider.writeText(entry.item, content, entry.item.eTag);
      written++; assertCurrent(); onSaved({ ...entry, item: { ...entry.item, ...saved }, raw: content });
    }
  } catch (error) {
    if (written) throw new Error("既存メモ" + written + "ファイルをOFFにした後に停止しました。全体設定はONにしていません。" + error.message, { cause: error });
    throw error;
  }
  return plan.length;
}
