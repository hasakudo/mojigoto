(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = { ...factory(), createConceptNoteOrder: factory };
  else root.MojigotoConceptNoteOrder = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createConceptNoteOrder() {
  const text = (value) => String(value || "");
  const fileName = (value) => text(value).split(/[\\/]/).pop();
  const compare = (a, b) => text(a).localeCompare(text(b), "ja", { numeric: true });
  const array = (value) => Array.isArray(value) ? value : [];
  const lookups = new WeakMap();
  function buildConceptNoteIndex(entries) {
    return array(entries).map((entry) => {
      const data = entry.data || {};
      const type = data.type === "reference" ? "reference" : "plot";
      const name = entry.item?.name || fileName(entry.filePath);
      return {
        key: type + ":" + name, type, fileName: name,
        title: text(data.title || name),
        order: data.order !== null && data.order !== "" && Number.isFinite(Number(data.order)) ? Number(data.order) : null,
        items: array(data.groups).flatMap((group) => array(group?.items)
          .filter((item) => item && item.kind !== "divider")
          .map((item) => ({ id: text(item.id), groupId: text(group.id),
            memoIds: array(item.memo?.linkedConceptMemoIds).map(text) }))),
      };
    }).sort((a, b) => compare(a.type === "plot" ? "0" : "1", b.type === "plot" ? "0" : "1")
      || (a.order ?? Infinity) - (b.order ?? Infinity) || compare(a.title, b.title) || compare(a.key, b.key));
  }
  function lookupNotes(notes) {
    if (lookups.has(notes)) return lookups.get(notes);
    const items = new Map(), memos = new Map();
    for (const [noteIndex, note] of notes.entries()) {
      for (const [itemIndex, item] of note.items.entries()) {
        const position = { ...item, key: note.key, type: note.type, fileName: note.fileName, noteIndex, itemIndex };
        if (!items.has(item.id)) items.set(item.id, []);
        items.get(item.id).push(position);
        for (const id of item.memoIds) {
          if (!memos.has(id)) memos.set(id, []);
          memos.get(id).push(position);
        }
      }
    }
    const lookup = { items, memos };
    lookups.set(notes, lookup);
    return lookup;
  }
  function conceptMemoNotePositions(memo, notes) {
    const lookup = lookupNotes(notes || []);
    const positions = [...(lookup.memos.get(text(memo.id)) || [])];
    const source = memo.source;
    if (source?.kind !== "noteItem" || !source.itemId) return positions;
    let candidates = (lookup.items.get(text(source.itemId)) || [])
      .filter((item) => !source.noteType || item.type === source.noteType);
    const named = candidates.filter((item) => item.fileName === fileName(source.notePath));
    if (named.length) candidates = named;
    const grouped = candidates.filter((item) => item.groupId === text(source.groupId));
    if (grouped.length) candidates = grouped;
    // Copies can retain item IDs. Never guess between multiple source notes.
    if (candidates.length === 1) positions.push(candidates[0]);
    return positions;
  }
  function matchesConceptNote(memo, notes, key = "") {
    if (!key) return true;
    const positions = conceptMemoNotePositions(memo, notes);
    return key === "__unlinked__" ? !positions.length : positions.some((position) => position.key === key);
  }
  function sortConceptMemosByNote(memos, notes, key = "", direction = "asc") {
    const sign = direction === "desc" ? -1 : 1;
    const ranks = new Map(memos.map((memo) => [memo, conceptMemoNotePositions(memo, notes)
      .filter((position) => !key || key === "__unlinked__" || position.key === key)
      .sort((a, b) => a.noteIndex - b.noteIndex || a.itemIndex - b.itemIndex)[0]]));
    return [...memos].sort((a, b) => {
      const left = ranks.get(a), right = ranks.get(b);
      if (Boolean(left) !== Boolean(right)) return left ? -1 : 1;
      return (left && right ? sign * (left.noteIndex - right.noteIndex || left.itemIndex - right.itemIndex) : 0)
        || compare(b.updatedAt, a.updatedAt) || compare(a.id, b.id);
    });
  }
  return { buildConceptNoteIndex, conceptMemoNotePositions, matchesConceptNote, sortConceptMemosByNote };
});
