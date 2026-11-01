const { normalizeImportedItemMemo } = require("./note-markdown-import");

function flattenTargetGroups(groups = [], scopeGroupId = "") {
  const scoped = scopeGroupId
    ? groups.filter((group) => String(group?.id || "") === String(scopeGroupId))
    : groups;

  return scoped.map((group, index) => ({
    groupId: String(group?.id || ""),
    groupTitle: String(group?.title || "").trim() || `大分類 ${index + 1}`,
    items: Array.isArray(group?.items) ? group.items : [],
  }));
}

function flattenTargetEntries(groups = [], scopeGroupId = "") {
  const scoped = scopeGroupId
    ? groups.filter((group) => String(group?.id || "") === String(scopeGroupId))
    : groups;

  const entries = [];

  scoped.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const items = Array.isArray(group?.items) ? group.items : [];
    let itemNumber = 0;

    items.forEach((item) => {
      if (item?.kind !== "entry") return;

      itemNumber += 1;
      entries.push({
        groupId: String(group?.id || ""),
        groupTitle,
        itemId: String(item?.id || ""),
        heading: String(item?.heading || "").trim() || `無題項目 ${itemNumber}`,
        body: String(item?.body || ""),
        ...(item?.memo ? { memo: item.memo } : {}),
        bodyPreview:
          String(item?.body || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)[0] || "",
      });
    });
  });

  return entries;
}

function flattenSourceEntries(parsedNote = {}) {
  const groups = Array.isArray(parsedNote?.groups) ? parsedNote.groups : [];
  const entries = [];

  groups.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const items = Array.isArray(group?.items) ? group.items : [];
    items.forEach((item, itemIndex) => {
      if (item?.kind !== "entry") return;

      entries.push({
        sourceGroupId: String(group?.id || ""),
        sourceGroupTitle: groupTitle,
        sourceItemId: String(item?.id || ""),
        importMeta: {
          supplemented: !!item?.importMeta?.supplemented,
        },
        heading:
          String(item?.heading || "").trim() || `無題項目 ${itemIndex + 1}`,
        body: String(item?.body || ""),
        ...(item?.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
        previewLine:
          String(item?.body || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)[0] || "",
      });
    });
  });

  return entries;
}

function flattenSourceInsertables(parsedNote = {}) {
  const groups = Array.isArray(parsedNote?.groups) ? parsedNote.groups : [];
  const items = [];

  groups.forEach((group, groupIndex) => {
    const groupTitle =
      String(group?.title || "").trim() || `大分類 ${groupIndex + 1}`;

    const groupItems = Array.isArray(group?.items) ? group.items : [];

    const dividerCount = groupItems.filter(
      (item) => item?.kind === "divider",
    ).length;
    const entryCount = groupItems.filter(
      (item) => item?.kind === "entry",
    ).length;

    items.push({
      sourceType: "group",
      sourceGroupId: String(group?.id || ""),
      sourceGroupTitle: groupTitle,
      sourceItemId: `group:${String(group?.id || groupIndex)}`,
      importMeta: {
        supplemented: !!group?.importMeta?.supplemented,
      },
      title: groupTitle,
      items: groupItems.map((item) => ({ ...item })),
      previewLine: `${groupItems.length}件`,
      counts: {
        dividers: dividerCount,
        entries: entryCount,
      },
    });

    groupItems.forEach((item, itemIndex) => {
      if (item?.kind === "divider") {
        items.push({
          sourceType: "divider",
          sourceGroupId: String(group?.id || ""),
          sourceGroupTitle: groupTitle,
          sourceItemId: String(item?.id || ""),
          importMeta: {
            supplemented: !!item?.importMeta?.supplemented,
          },
          label:
            String(item?.label || "").trim() || `無題区分 ${itemIndex + 1}`,
          value: String(item?.value || ""),
          previewLine: String(item?.value || "").trim(),
        });
        return;
      }

      if (item?.kind === "entry") {
        items.push({
          sourceType: "entry",
          sourceGroupId: String(group?.id || ""),
          sourceGroupTitle: groupTitle,
          sourceItemId: String(item?.id || ""),
          importMeta: {
            supplemented: !!item?.importMeta?.supplemented,
          },
          heading:
            String(item?.heading || "").trim() || `無題項目 ${itemIndex + 1}`,
          body: String(item?.body || ""),
          ...(item?.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
          previewLine:
            String(item?.body || "")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)[0] || "",
        });
      }
    });
  });

  return items;
}

function findSourceItemIdBySnapshot(snapshot, entries) {
  if (!snapshot || !Array.isArray(entries) || !entries.length) return "";

  const exact = entries.find((entry) => {
    return (
      String(entry.sourceType || "entry") ===
        String(snapshot.sourceType || "entry") &&
      String(entry.sourceGroupTitle || "") ===
        String(snapshot.sourceGroupTitle || "") &&
      String(entry.title || "") === String(snapshot.title || "") &&
      String(entry.label || "") === String(snapshot.label || "") &&
      String(entry.heading || "") === String(snapshot.heading || "") &&
      String(entry.body || "") === String(snapshot.body || "") &&
      String(entry.value || "") === String(snapshot.value || "")
    );
  });

  if (exact) {
    return String(exact.sourceItemId || "");
  }

  const loose = entries.find((entry) => {
    return (
      String(entry.sourceType || "entry") ===
        String(snapshot.sourceType || "entry") &&
      String(entry.sourceGroupTitle || "") ===
        String(snapshot.sourceGroupTitle || "") &&
      String(entry.title || "") === String(snapshot.title || "") &&
      String(entry.label || "") === String(snapshot.label || "") &&
      String(entry.heading || "") === String(snapshot.heading || "") &&
      String(entry.previewLine || "") === String(snapshot.previewLine || "")
    );
  });

  return loose ? String(loose.sourceItemId || "") : "";
}

module.exports = {
  flattenTargetGroups,
  flattenTargetEntries,
  flattenSourceEntries,
  flattenSourceInsertables,
  findSourceItemIdBySnapshot,
};
