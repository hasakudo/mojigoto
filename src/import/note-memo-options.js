const { normalizeImportedItemMemo } = require("./note-markdown-import");

function prepareImportedItem(item, includeItemMemos = true) {
  const next = { ...item };
  delete next.memo;
  if (includeItemMemos && item?.kind !== "divider" && item?.memo) {
    next.memo = normalizeImportedItemMemo(item.memo);
  }
  return next;
}

function prepareImportedGroups(groups, includeItemMemos = true) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    items: (Array.isArray(group?.items) ? group.items : [])
      .map((item) => prepareImportedItem(item, includeItemMemos)),
  }));
}

function prepareImportedSource(source, includeItemMemos = true) {
  const next = prepareImportedItem(source, includeItemMemos);
  if (Array.isArray(source?.items)) {
    next.items = source.items.map((item) => prepareImportedItem(item, includeItemMemos));
  }
  return next;
}

function mergeImportedItemMemo(existing, imported) {
  if (!imported || typeof imported !== "object") return existing;
  const content = normalizeImportedItemMemo(imported);
  // Content changes belong to the existing item. Never import another item's
  // concept links or replace the target's own sync preferences/baseline.
  return {
    ...(existing || content),
    type: content.type,
    body: content.body,
    tags: content.tags,
    updatedAt: new Date().toISOString(),
  };
}

function assertImportTargetUnchanged(item, expected, replaceItemMemo = false) {
  if (!expected || !Object.hasOwn(expected, "body")) return;
  const memoContent = (memo) => {
    const normalized = normalizeImportedItemMemo(memo || {});
    return JSON.stringify({ type: normalized.type, body: normalized.body, tags: normalized.tags });
  };
  if (String(item.body || "") !== String(expected.body || "")
    || (replaceItemMemo && memoContent(item.memo) !== memoContent(expected.memo))) {
    throw new Error("上書き先の詳細本文または項目メモが変更されています。再読み込みして、比較内容を確認してから実行してください。");
  }
}

module.exports = { prepareImportedItem, prepareImportedGroups, prepareImportedSource, mergeImportedItemMemo, assertImportTargetUnchanged };
