import { conceptSourceFileName } from "./concept-memos.mjs";

export function locateConceptSource(entries, source) {
  if (source?.kind !== "noteItem" || !source.itemId) return null;
  const matches = [];
  for (const entry of entries || []) {
    for (const [groupIndex, group] of (entry.data?.groups || []).entries()) {
      const itemIndex = (group.items || []).findIndex((item) => item.id === source.itemId && item.kind !== "divider");
      if (itemIndex >= 0) matches.push({ entry, group, item: group.items[itemIndex], groupIndex, itemIndex });
    }
  }
  const fileName = conceptSourceFileName(source);
  return matches.find(({ entry, group }) => entry.item?.name === fileName && group.id === source.groupId)
    || matches.find(({ entry }) => entry.item?.name === fileName)
    || matches.find(({ group }) => group.id === source.groupId)
    || matches[0] || null;
}
