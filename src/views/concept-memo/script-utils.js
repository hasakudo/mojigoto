function getConceptMemoUtilsScript() {
  return `
    function formatJstDateTime(value) {
      if (!value) return "";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    function formatJstDateTimeShort(value) {
      if (!value) return "";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      const now = new Date();
      const isSameYear = date.getFullYear() === now.getFullYear();

      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        ...(isSameYear ? {} : { year: "numeric" }),
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    function getSortModeStorageKey() {
      return "mojigoto.conceptMemo.sortMode:" + String(bootState?.filePath || "");
    }

    function getSortFieldStorageKey() {
      return "mojigoto.conceptMemo.sortField:" + String(bootState?.filePath || "");
    }

    function getSortDirectionStorageKey() {
      return "mojigoto.conceptMemo.sortDirection:" + String(bootState?.filePath || "");
    }

    function getNoteTypeLabel(noteType) {
      const value = String(noteType || "").trim();
      if (!value) return "ノート";

      const map = {
        plot: "プロット",
        plots: "プロット",
        reference: "資料",
        references: "資料",
        setting: "設定",
        settings: "設定",
        note: "ノート",
      };

      return map[value] || value;
    }

    function getSourceSummaryShort(memo) {
      const source = memo?.source;
      const kind = String(source?.kind || "").trim();

      if (!source || !kind) {
        return "";
      }

      if (kind === "writingMemo") {
        return "出典: 執筆メモ";
      }

      if (kind !== "noteItem") {
        return "";
      }

      const noteTypeLabel = getNoteTypeLabel(source.noteType);
      const noteTitle = String(source.noteTitle || "").trim();

      if (noteTitle) {
        return \`出典: \${noteTypeLabel}「\${noteTitle}」\`;
      }

      return \`出典: \${noteTypeLabel}\`;
    }

    function getSourceSummaryFull(memo) {
      const source = memo?.source;
      const kind = String(source?.kind || "").trim();

      if (!source || !kind) {
        return "";
      }

      if (kind === "writingMemo") {
        const filePath = String(source.filePath || "").trim();
        return filePath
          ? \`出典: 執筆メモ \${filePath}\`
          : "出典: 執筆メモ";
      }

      if (kind !== "noteItem") {
        return "";
      }

      const noteTypeLabel = getNoteTypeLabel(source.noteType);
      const noteTitle = String(source.noteTitle || "").trim();
      const groupTitle = String(source.groupTitle || "").trim();
      const itemHeading = String(source.itemHeading || "").trim();

      const parts = [];

      if (noteTitle) {
        parts.push(\`\${noteTypeLabel}「\${noteTitle}」\`);
      } else if (noteTypeLabel) {
        parts.push(noteTypeLabel);
      }

      if (groupTitle) {
        parts.push(groupTitle);
      }

      if (itemHeading) {
        parts.push(itemHeading);
      }

      return parts.length ? \`出典: \${parts.join(" > ")}\` : "";
    }

    function getSourceStatus(memo) {
      const source = memo?.source || {};
      const kind = String(source.kind || "").trim();

      if (kind !== "noteItem") {
        return "";
      }

      const status = String(source.status || "active").trim();
      return status || "active";
    }

    function getSourceStatusLabel(memo) {
      const source = memo?.source || {};
      const kind = String(source.kind || "").trim();

      if (kind !== "noteItem") {
        return "";
      }

      const status = getSourceStatus(memo);

      if (status === "cleared") {
        return "元メモなし";
      }

      if (status === "missing") {
        return "リンク切れ";
      }

      return "";
    }

    function getSourceSummaryClassName(memo) {
      const source = memo?.source || {};
      const kind = String(source.kind || "").trim();

      if (kind !== "noteItem") {
        return "sourceSummaryText";
      }

      const status = getSourceStatus(memo);
      return status === "active"
        ? "sourceSummaryText"
        : "sourceSummaryText isInactive";
    }

    function getSourceStatusBadgeHtml(memo) {
      const source = memo?.source || {};
      const kind = String(source.kind || "").trim();

      if (kind !== "noteItem") {
        return "";
      }

      const label = getSourceStatusLabel(memo);
      if (!label) {
        return "";
      }

      const status = getSourceStatus(memo);
      const statusClass =
        status === "missing"
          ? "sourceStatusBadge isMissing"
          : "sourceStatusBadge isCleared";

      return \`<span class="\${statusClass}">\${escapeHtml(label)}</span>\`;
    }

    function matchesQuickFilter(memo, filterValue) {
      const filter = String(filterValue || "").trim();
      if (!filter) return true;

      const type = String(memo?.type || "text");
      const source = memo?.source || {};
      const sourceKind = String(source?.kind || "");
      const sourceStatus = String(source?.status || "active");

      switch (filter) {
        case "hasSource":
          return sourceKind === "noteItem" || sourceKind === "writingMemo";
        case "cleared":
          return sourceKind === "noteItem" && sourceStatus === "cleared";
        case "missing":
          return sourceKind === "noteItem" && sourceStatus === "missing";
        case "text":
          return type === "text";
        case "list":
          return type === "list";
        case "todo":
          return type === "todo";
        case "pinned":
          return Boolean(memo?.isPinned);
        case "archived":
          return Boolean(memo?.isArchived);
        default:
          return true;
      }
    }

    function getQuickFilterLabel(filterValue) {
      switch (String(filterValue || "")) {
        case "hasSource":
          return "絞り込み: 出典あり";
        case "cleared":
          return "絞り込み: 元メモなし";
        case "missing":
          return "絞り込み: リンク切れ";
        case "text":
          return "絞り込み: 通常メモ";
        case "list":
          return "絞り込み: リストメモ";
        case "todo":
          return "絞り込み: TODOメモ";
        case "pinned":
          return "絞り込み: ピン留め";
        case "archived":
          return "絞り込み: 保管中";
        default:
          return "絞り込み: 通常表示";
      }
    }

    function getTodoCounts(memo) {
      const items = Array.isArray(memo?.todoItems) ? memo.todoItems : [];
      const total = items.length;
      const done = items.filter((item) => item?.done).length;
      const undone = Math.max(0, total - done);

      return {
        total,
        done,
        undone,
      };
    }

    function normalizeState(state) {
      return {
        filePath: state?.filePath || "",
        workDir: state?.workDir || "",
        workTitle: state?.workTitle || "",
        data: {
          version: Number(state?.data?.version || 1),
          updatedAt: state?.data?.updatedAt || "",
          memos: Array.isArray(state?.data?.memos)
            ? state.data.memos.map((memo) => ({
                ...memo,
                showInDashboard: Boolean(memo?.showInDashboard),
              }))
            : [],
        },
      };
    }

    function normalizeTags(value) {
      if (Array.isArray(value)) {
        return value
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
          .filter((tag, index, array) => array.indexOf(tag) === index);
      }

      return String(value || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter((tag, index, array) => array.indexOf(tag) === index);
    }

    function getMemoTypeLabel(type) {
      return MEMO_TYPE_LABELS[type] || "通常メモ";
    }

    function hasNoteItemSource(memo) {
      const source = memo?.source || {};
      return String(source.kind || "") === "noteItem";
    }

    function canOpenSourceNote(memo) {
      const source = memo?.source || {};
      const status = String(source.status || "active");

      return (
        String(memo?.type || "text") === "text" &&
        String(source.kind || "") === "noteItem" &&
        status !== "missing"
      );
    }

    function canApplyToNoteItem(memo) {
      const source = memo?.source || {};
      const status = String(source.status || "active");

      return (
        String(memo?.type || "text") === "text" &&
        String(source.kind || "") === "noteItem" &&
        status !== "missing"
      );
    }

    function canUnlinkSourceNote(memo) {
      const source = memo?.source || {};
      const status = String(source.status || "active");

      return (
        String(memo?.type || "text") === "text" &&
        String(source.kind || "") === "noteItem" &&
        status === "missing"
      );
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function stringifyListItems(items) {
      return Array.isArray(items)
        ? items.map((item) => item?.text || "").join(" ")
        : "";
    }

    function getMemoSearchText(memo) {
      return [
        memo?.title || "",
        memo?.body || "",
        Array.isArray(memo?.tags) ? memo.tags.join(" ") : "",
        stringifyListItems(memo?.listItems),
        stringifyListItems(memo?.todoItems),
        getMemoTypeLabel(memo?.type || "text"),
      ]
        .join(" ")
        .toLowerCase();
    }

    function compareText(a, b) {
      return String(a || "").localeCompare(String(b || ""), "ja");
    }

    function getTimeValue(value) {
      const time = new Date(value || 0).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function formatTagsInput(tags) {
      return Array.isArray(tags) ? tags.join(", ") : "";
    }
  `;
}

module.exports = {
  getConceptMemoUtilsScript,
};