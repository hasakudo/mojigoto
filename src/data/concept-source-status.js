// Refresh display metadata without changing note contents or writing files.
async function refreshConceptSourceStatuses(data, { readNoteFile, resolveNotePath }) {
  const notes = new Map();
  const memos = [];
  for (const memo of Array.isArray(data?.memos) ? data.memos : []) {
    const source = memo?.source;
    if (source?.kind !== "noteItem" || !source.notePath || !source.groupId || !source.itemId) {
      memos.push(memo);
      continue;
    }
    let status = String(source.status || "active");
    let names = {};
    try {
      const type = String(source.noteType || "plot");
      const filePath = resolveNotePath(source.notePath, type);
      const key = JSON.stringify([filePath, type]);
      if (!notes.has(key)) notes.set(key, readNoteFile(filePath, type));
      const note = await notes.get(key);
      const group = note.groups?.find((group) => String(group?.id || "") === String(source.groupId));
      const item = group?.items?.find((item) => String(item?.id || "") === String(source.itemId) && item?.kind === "entry");
      if (!item) status = "missing";
      else {
        const linked = Array.isArray(item.memo?.linkedConceptMemoIds) ? item.memo.linkedConceptMemoIds : [];
        const hasContent = Boolean(String(item.memo?.body || "").trim()) || Boolean(item.memo?.tags?.length);
        if (linked.includes(memo.id)) {
          if (status !== "cleared") status = "active";
        }
        else if (!hasContent) status = "cleared";
        else if (linked.length && !linked.includes(memo.id) && status !== "cleared") status = "missing";
        if (status === "active" && (!linked.length || linked.includes(memo.id))) {
          names = { noteTitle: String(note.title || ""), groupTitle: String(group.title || ""), itemHeading: String(item.heading || "") };
        }
        // With no reverse links, keep legacy source metadata until explicitly
        // linked again. Do not infer a binding from matching text or titles.
      }
    } catch (error) {
      if (error?.code === "ENOENT") status = "missing";
      // Permission/parse errors are not evidence that a link was removed.
    }
    const changed = status !== String(source.status || "active") || Object.entries(names).some(([key, value]) => source[key] !== value);
    memos.push(changed ? { ...memo, source: { ...source, ...names, status } } : memo);
  }
  return { ...data, memos };
}

module.exports = { refreshConceptSourceStatuses };
