const { normalizeImportedItemMemo } = require("../../import/note-markdown-import");
const { mergeImportedItemMemo, assertImportTargetUnchanged } = require("../../import/note-memo-options");

function insertEntriesAfterItem(noteData, groupId, itemId, entries) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(groupId || ""),
  );
  if (!group) {
    throw new Error("挿入先の大分類を取得できませんでした。");
  }

  const items = Array.isArray(group.items) ? group.items : [];
  const targetIndex = items.findIndex(
    (item) => String(item?.id || "") === String(itemId || ""),
  );
  if (targetIndex < 0) {
    throw new Error("挿入先の項目を取得できませんでした。");
  }

  const nextEntries = Array.isArray(entries)
    ? entries.filter((item) => item && item.kind === "entry")
    : [];

  if (!nextEntries.length) {
    throw new Error("追加できる項目がありませんでした。");
  }

  items.splice(targetIndex + 1, 0, ...nextEntries);
  group.items = items;

  return noteData;
}

function replaceItemBody(noteData, groupId, itemId, body, options = {}) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(groupId || ""),
  );
  if (!group) {
    throw new Error("対象の大分類を取得できませんでした。");
  }

  const item = (Array.isArray(group.items) ? group.items : []).find(
    (entry) => String(entry?.id || "") === String(itemId || ""),
  );

  if (!item || item.kind !== "entry") {
    throw new Error("対象の項目を取得できませんでした。");
  }

  if (options.expectedTarget) assertImportTargetUnchanged(item, options.expectedTarget, options.replaceItemMemo === true && !!options.memo);
  item.body = String(body || "");
  if (options.replaceItemMemo === true && options.memo) {
    item.memo = mergeImportedItemMemo(item.memo, options.memo);
  }
  return noteData;
}

function insertItemAtPosition(noteData, targetGroupId, insertIndex, item) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const group = groups.find(
    (g) => String(g?.id || "") === String(targetGroupId || ""),
  );
  if (!group) {
    throw new Error("挿入先の大分類を取得できませんでした。");
  }

  const items = Array.isArray(group.items) ? group.items : [];
  const normalizedIndex = Math.max(
    0,
    Math.min(Number(insertIndex), items.length),
  );

  const nextItem =
    item?.kind === "divider"
      ? {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "divider",
          label: String(item?.label || "").trim() || "無題区分",
          value: String(item?.value || ""),
        }
      : {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "entry",
          heading: String(item?.heading || "").trim() || "無題項目",
          headingRuby: String(item?.headingRuby || ""),
          body: String(item?.body || ""),
          ...(item?.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
        };

  items.splice(normalizedIndex, 0, nextItem);
  group.items = items;
  return noteData;
}

function insertGroupAtPosition(noteData, insertIndex, groupData) {
  const groups = Array.isArray(noteData?.groups) ? noteData.groups : [];
  const normalizedIndex = Math.max(
    0,
    Math.min(Number(insertIndex), groups.length),
  );

  const rawItems = Array.isArray(groupData?.items) ? groupData.items : [];

  const nextGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(groupData?.title || "").trim() || "無題大分類",
    items: rawItems.map((item) => {
      if (item?.kind === "divider") {
        return {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: "divider",
          label: String(item?.label || "").trim() || "無題区分",
          value: String(item?.value || ""),
        };
      }

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "entry",
        heading: String(item?.heading || "").trim() || "無題項目",
        headingRuby: String(item?.headingRuby || ""),
        body: String(item?.body || ""),
        ...(item?.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
      };
    }),
  };

  groups.splice(normalizedIndex, 0, nextGroup);
  noteData.groups = groups;
  return noteData;
}

module.exports = { insertEntriesAfterItem, replaceItemBody, insertItemAtPosition, insertGroupAtPosition };
