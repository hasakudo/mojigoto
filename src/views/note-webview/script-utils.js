function getUtilsScript() {
  return `
    function renderNoteSearchMatches(record, group = false) {
      if (!searchQuery) return "";
      const fields = group ? [["大分類", record?.title]] : record?.kind === "divider"
        ? [["区分", record.label], ["補足", record.value]]
        : [["項目名", record?.heading], ["ふりがな", record?.headingRuby], ["詳細", record?.body],
          ["項目メモ", record?.memo?.body], ["タグ", (record?.memo?.tags || []).join(" / ")]];
      const matches = [];
      const query = normalizeSearchText(searchQuery);
      for (const [label, value] of fields) {
        String(value || "").split(/\\r?\\n/).forEach((line, index) => {
          const position = normalizeSearchText(line).indexOf(query);
          if (position < 0) return;
          const start = Math.max(0, position - 35);
          const end = Math.min(line.length, Math.max(position + searchQuery.length + 35, start + 90));
          const excerpt = (start ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : "");
          matches.push('<div><span class="noteSearchLocation">' + esc(label) + '・' + (index + 1) + '行目</span> ' + noteDisplayRenderer.text(excerpt, searchQuery) + '</div>');
        });
      }
      return matches.slice(0, 5).join("") + (matches.length > 5 ? '<div class="muted">ほか ' + (matches.length - 5) + ' 行に一致</div>' : "");
    }

    function refreshNoteSearchMatches() {
      groupsRoot.querySelectorAll("[data-search-group]").forEach(root => {
        const group = state.groups.find(group => group.id === root.dataset.searchGroup);
        const record = root.dataset.searchItem ? group?.items?.find(item => item.id === root.dataset.searchItem) : group;
        root.innerHTML = renderNoteSearchMatches(record, !root.dataset.searchItem);
      });
    }

    function getVisibleGroupsForSearch() {
      return state.groups.filter((group) =>
        groupMatchesQuery(group, searchQuery),
      );
    }

    function getVisibleItemsForGroup(group) {
      return (Array.isArray(group.items) ? group.items : []).filter((item) =>
        itemMatchesQuery(item, searchQuery) ||
        normalizeSearchText(group.title).includes(normalizeSearchText(searchQuery)),
      );
    }

    function itemMatchesQuery(item, query) {
      const q = normalizeSearchText(query);
      if (!q) return true;

      if (item?.kind === "divider") {
        return (
          normalizeSearchText(item?.label).includes(q) ||
          normalizeSearchText(item?.value).includes(q)
        );
      }

      return (
        normalizeSearchText(item?.heading).includes(q) ||
        normalizeSearchText(item?.headingRuby).includes(q) ||
        normalizeSearchText(item?.body).includes(q) ||
        normalizeSearchText(item?.memo?.body).includes(q) ||
        (Array.isArray(item?.memo?.tags) && item.memo.tags.some(tag => normalizeSearchText(tag).includes(q)))
      );
    }

    function groupMatchesQuery(group, query) {
      const q = normalizeSearchText(query);
      if (!q) return true;

      if (normalizeSearchText(group?.title).includes(q)) {
        return true;
      }

      const items = Array.isArray(group?.items) ? group.items : [];
      return items.some((item) => itemMatchesQuery(item, q));
    }

    function getCountsFromGroups(groups, options = {}) {
      const { visibleOnly = false } = options;

      let groupCount = 0;
      let dividerCount = 0;
      let itemCount = 0;

      (Array.isArray(groups) ? groups : []).forEach((group) => {
        groupCount += 1;

        const items = visibleOnly
          ? getVisibleItemsForGroup(group)
          : (Array.isArray(group.items) ? group.items : []);

        items.forEach((item) => {
          if (item?.kind === "divider") {
            dividerCount += 1;
          } else {
            itemCount += 1;
          }
        });
      });

      return {
        groupCount,
        dividerCount,
        itemCount,
      };
    }

    function countVisibleCards(groups) {
      let count = 0;

      (Array.isArray(groups) ? groups : []).forEach((group) => {
        const items = getVisibleItemsForGroup(group);
        items.forEach((item) => {
          if (item && item.kind !== "divider") {
            count += 1;
          }
        });
      });

      return count;
    }

    function hasActiveSearchQuery() {
      return !!String(searchQuery || "").trim();
    }

    function buildSearchNoticeText(options = {}) {
      const { includeCardHint = false } = options;

      if (!hasActiveSearchQuery()) return "";

      const keyword = String(searchQuery || "").trim();
      if (!keyword) return "";

      const parts = [
        \`「\${keyword}」で絞り込まれています。\`,
        \`検索パネルを閉じても絞り込みは解除されません。\`,
      ];

      return parts.join(" ");
    }

    function buildCountsText(groups, options = {}) {
      const {
        cardCount = null,
      } = options;

      const isSearch = hasActiveSearchQuery();
      const counts = getCountsFromGroups(groups, { visibleOnly: isSearch });

      const parts = [
        \`大分類 \${counts.groupCount}\`,
        \`区分 \${counts.dividerCount}\`,
        \`項目 \${counts.itemCount}\`,
      ];
      
      const prefix = isSearch ? "検索結果: " : "";
      return prefix + parts.join(" / ");
    }

    function makeId(prefix = "id") {
      return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
    }

    function normalizeSearchText(value) {
      return String(value || "").toLowerCase();
    }

    function esc(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function createEntry() {
      return {
        id: makeId("item"),
        kind: "entry",
        heading: "",
        headingRuby: "",
        body: "",
        relatedReferences: [],
      };
    }

    function createGroup() {
      return {
        id: makeId("grp"),
        title: "",
        items: [],
        images: [],
      };
    }

    function createDivider() {
      return {
        id: makeId("div"),
        kind: "divider",
        label: "",
        value: "",
        relatedReferences: [],
      };
    }

    function cloneImportedItem(item) {
      const kind = item && item.kind === "divider" ? "divider" : "entry";

      if (kind === "divider") {
        return {
          id: makeId("div"),
          kind: "divider",
          label: String(item?.label || ""),
          value: String(item?.value || ""),
        };
      }

      return {
        id: makeId("item"),
        kind: "entry",
        heading: String(item?.heading || ""),
        headingRuby: String(item?.headingRuby || ""),
        body: String(item?.body || ""),
      };
    }

    function cloneImportedGroup(group) {
      return {
        id: makeId("grp"),
        title: String(group?.title || ""),
        items: Array.isArray(group?.items)
          ? group.items.map((item) => cloneImportedItem(item)).filter(Boolean)
          : [],
      };
    }

    function cloneTemplateGroup(group) {
      const newGroupId = makeId("group");

      return {
        ...group,
        id: newGroupId,
        navId: \`group:\${newGroupId}\`,
        items: (Array.isArray(group?.items) ? group.items : []).map((item) =>
          cloneTemplateItem(item, newGroupId),
        ),
      };
    }

    function cloneTemplateItem(item, groupId) {
      const newItemId = makeId("item");

      return {
        ...item,
        id: newItemId,
        navId: \`item:\${groupId}:\${newItemId}\`,
      };
    }

    function cloneTemplateItemForEditor(item) {
      const kind = item && item.kind === "divider" ? "divider" : "entry";

      if (kind === "divider") {
        return {
          id: makeId("div"),
          kind: "divider",
          label: String(item?.label || ""),
          value: String(item?.value || ""),
        };
      }

      return {
        id: makeId("item"),
        kind: "entry",
        heading: String(item?.heading || ""),
        headingRuby: String(item?.headingRuby || ""),
        body: String(item?.body || ""),
      };
    }

    function cloneTemplateGroupsForEditor(groups) {
      if (!Array.isArray(groups)) return [];

      return groups.map((group) => ({
        id: makeId("grp"),
        title: String(group?.title || ""),
        items: Array.isArray(group?.items)
          ? group.items.map((item) => cloneTemplateItemForEditor(item)).filter(Boolean)
          : [],
      }));
    }

    function formatDateTime(value) {
      if (!value) return "";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");

      return \`\${y}/\${m}/\${d} \${hh}:\${mm}\`;
    }

    function normalizeItemMemo(memo) {
      return {
        type: String(memo?.type || "text") === "list" ? "list" : "text",
        body: String(memo?.body || ""),
        updatedAt: String(memo?.updatedAt || ""),
        tags: Array.isArray(memo?.tags)
          ? memo.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : [],
        linkedConceptMemoIds: Array.isArray(memo?.linkedConceptMemoIds)
          ? memo.linkedConceptMemoIds
              .map((id) => String(id || "").trim())
              .filter(Boolean)
          : [],
        autoSyncToConceptMemo: Boolean(memo?.autoSyncToConceptMemo),
        autoSyncToConceptMemoOverride:
          typeof memo?.autoSyncToConceptMemoOverride === "boolean"
            ? memo.autoSyncToConceptMemoOverride
            : null,
        conceptMemoSyncedAt: String(memo?.conceptMemoSyncedAt || ""),
        conceptMemoSyncFingerprint: String(memo?.conceptMemoSyncFingerprint || ""),
      };
    }

    function normalizeItem(item) {
      if (!item || typeof item !== "object") return null;

      const kind = item.kind === "divider" ? "divider" : "entry";

      if (kind === "divider") {
        return {
          id: String(item.id || makeId("div")),
          kind: "divider",
          label: String(item.label || ""),
          value: String(item.value || ""),
          relatedReferences: normalizeRelatedReferenceLinks(item.relatedReferences),
        };
      }

      return {
        id: String(item.id || makeId("item")),
        kind: "entry",
        heading: String(item.heading || ""),
        headingRuby: String(item.headingRuby || ""),
        body: String(item.body || ""),
        memo: normalizeItemMemo(item.memo),
        relatedReferences: normalizeRelatedReferenceLinks(item.relatedReferences),
      };
    }

    function normalizeRelatedReferenceLinks(value) {
      if (!Array.isArray(value)) return [];
      return value
        .map((link) => ({
          noteType: link?.noteType === "plot" ? "plot" : "reference",
          noteId: String(link?.noteId || ""),
          noteFileName: String(link?.noteFileName || ""),
          noteTitle: String(link?.noteTitle || ""),
          groupId: String(link?.groupId || ""),
          groupTitle: String(link?.groupTitle || ""),
          itemId: String(link?.itemId || ""),
          itemKind: link?.itemKind === "divider" ? "divider" : "entry",
          itemLabel: String(link?.itemLabel || ""),
          ...(link?.importTarget ? { importTarget: structuredClone(link.importTarget) } : {}),
        }))
        .filter((link) => (link.noteId || link.importTarget) && link.itemId);
    }

    function normalizeGroup(group) {
      const items = Array.isArray(group?.items)
        ? group.items.map(normalizeItem).filter(Boolean)
        : [];

      return {
        id: String(group?.id || makeId("grp")),
        title: String(group?.title || ""),
        items,
        images: Array.isArray(group?.images)
          ? group.images.map((image) => ({
              id: String(image?.id || ""),
              name: String(image?.name || image?.fileName || "画像"),
              fileName: String(image?.fileName || ""),
              relativePath: String(image?.relativePath || ""),
              webviewUri: String(image?.webviewUri || ""),
              createdAt: String(image?.createdAt || ""),
            }))
          : [],
      };
    }
  `;
}

module.exports = {
  getUtilsScript,
};
