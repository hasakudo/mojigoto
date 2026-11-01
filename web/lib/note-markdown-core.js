// Shared by the VS Code CommonJS adapter and the browser module wrapper.
// No filesystem, DOM, or cloud access is performed here.
(function () {
"use strict";

function createImportId(prefix = "import") {
  return globalThis.crypto?.randomUUID
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getBaseNameWithoutExt(fileName = "") {
  const base = String(fileName || "").trim().split(/[\\/]/).pop();
  return base.lastIndexOf(".") > 0 ? base.slice(0, base.lastIndexOf(".")) : base;
}

function normalizeLineEndings(text) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function readFence(line, active) {
  const marker = String(line).match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!marker) return active;
  if (!active) {
    if (marker[1][0] === "`" && marker[2].includes("`")) return null;
    return { character: marker[1][0], length: marker[1].length };
  }
  return marker[1][0] === active.character && marker[1].length >= active.length && !marker[2].trim()
    ? null : active;
}

function isUnsupportedMarkdownLine(trimmed) {
  return (
    trimmed.startsWith("```") ||
    /^\|.*\|$/.test(trimmed) ||
    trimmed.startsWith("- [ ]") ||
    trimmed.startsWith("- [x]")
  );
}

function stripSupplementPrefix(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith(">")) return raw;

  const body = raw.replace(/^>\s?/, "");
  return body.replace(/^補足:\s*/, "").trim();
}

function getFirstPreviewLine(body = "") {
  const lines = String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[0] || "";
}

function buildTitleCandidate(options = {}) {
  const existingNoteTitle = String(options?.existingNoteTitle || "").trim();
  if (existingNoteTitle) return existingNoteTitle;

  const base = getBaseNameWithoutExt(options?.fileName || "");
  return base || "インポートノート";
}

function createGroup(title = "", meta = {}) {
  return {
    id: createImportId("group"),
    title: String(title || "").trim() || "無題大分類",
    items: [],
    importMeta: {
      supplemented: !!meta.supplemented,
    },
  };
}

function createDivider(label = "", value = "", meta = {}) {
  return {
    id: createImportId("item"),
    kind: "divider",
    label: String(label || "").trim() || "無題区分",
    value: String(value || ""),
    importMeta: {
      supplemented: !!meta.supplemented,
    },
  };
}

function createEntry(heading = "", body = "", meta = {}) {
  return {
    id: createImportId("item"),
    kind: "entry",
    heading: String(heading || "").trim() || "無題項目",
    body: String(body || ""),
    importMeta: {
      supplemented: !!meta.supplemented,
    },
  };
}

function normalizeImportedItemMemo(memo = {}) {
  return { type: memo?.type === "list" ? "list" : "text", body: String(memo?.body || ""),
    tags: [...new Set((Array.isArray(memo?.tags) ? memo.tags : []).map(tag => String(tag).trim()).filter(Boolean))],
    updatedAt: "", linkedConceptMemoIds: [], autoSyncToConceptMemo: false, autoSyncToConceptMemoOverride: false,
    conceptMemoSyncedAt: "", conceptMemoSyncFingerprint: "" };
}

function formatItemMemoMarkdown(memo = {}) {
  const value = normalizeImportedItemMemo(memo);
  const body = normalizeLineEndings(value.body);
  if (!body.trim() && !value.tags.length) return "";
  let length = 3;
  for (const match of body.matchAll(/~+/g)) length = Math.max(length, match[0].length + 1);
  const fence = "~".repeat(length);
  const metadata = JSON.stringify({ type: value.type, tags: value.tags }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `#### 項目メモ\n${fence}mojigoto-item-memo-v1 ${metadata}\n${body}\n${fence}`;
}

function readItemMemoBlock(lines, index) {
  const heading = String(lines[index] || "").trim().match(/^####[ \t　]+項目メモ(?:[（(]リスト[）)])?[ \t]*$/);
  const start = heading ? index + 1 : index;
  const opening = String(lines[start] || "").match(/^ {0,3}(~{3,})mojigoto-item-memo-v1\s+(.*)$/);
  if (!opening) {
    if (!heading) return null;
    // A malformed versioned block must stay literal, never become plain memo.
    if (/^ {0,3}~{3,}mojigoto-item-memo/.test(String(lines[start] || ""))) return { invalid: true };
    let end = start, fence = null;
    while (end < lines.length) {
      const line = String(lines[end] || "");
      if (!fence && (/^\s*#{1,3}(?:[ \t　]|$)/.test(line) || /^\s*####[ \t　]+項目メモ(?:[（(]リスト[）)])?[ \t]*$/.test(line))) break;
      fence = readFence(line, fence);
      end += 1;
    }
    const body = lines.slice(start, end).join("\n").replace(/\n+$/, "");
    return { end: end - 1, memo: normalizeImportedItemMemo({ type: /[（(]リスト[）)]/.test(heading[0]) ? "list" : "text", body }) };
  }
  let metadata;
  try { metadata = JSON.parse(opening[2]); } catch { return { invalid: true }; }
  if (!metadata || !["text", "list"].includes(metadata.type) || !Array.isArray(metadata.tags)
      || !metadata.tags.every(tag => typeof tag === "string")) return { invalid: true };
  const closing = new RegExp(`^ {0,3}~{${opening[1].length},}[ \\t]*$`);
  let end = start + 1;
  while (end < lines.length && !closing.test(lines[end])) end += 1;
  if (end === lines.length) return { invalid: true };
  return { end, memo: normalizeImportedItemMemo({ ...metadata, body: lines.slice(start + 1, end).join("\n") }) };
}

const WARNING_MESSAGES = {
  INVALID_ITEM_MEMO: "項目メモの形式または位置を確認できないため、元の内容を本文として読み込みます。",
  MISSING_GROUP_FOR_DIVIDER:
    "大分類がない区分があったため、「無題大分類」を補って読み込みます。",
  MISSING_GROUP_FOR_ENTRY:
    "大分類がないため、「無題大分類」を補って読み込みます。",
  MISSING_ENTRY_HEADING:
    "項目名がない本文があったため、「無題項目」を補って読み込みます。",
  MISSING_GROUP_AND_ENTRY_FOR_BODY:
    "大分類と項目名がない本文があったため、「無題大分類」と「無題項目」を補って読み込みます。",
  ORPHAN_SUPPLEMENT_LINE: "区分に属さない補足行は読み込み対象外になります。",
  UNSUPPORTED_MARKDOWN_AS_BODY:
    "一部のMarkdown記法はノート構造に対応していないため、本文として読み込みます。",
};

function dedupeWarnings(warnings = []) {
  const seen = new Set();
  const results = [];

  for (const warning of warnings) {
    const code = String(warning?.code || "").trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);

    results.push({
      code,
      message: WARNING_MESSAGES[code] || code,
      level: String(warning?.level || "info"),
      sampleLine: String(warning?.sampleLine || "").trim(),
    });
  }

  return results;
}

function countImportedItems(groups = []) {
  let dividers = 0;
  let entries = 0;

  for (const group of groups) {
    const items = Array.isArray(group?.items) ? group.items : [];
    for (const item of items) {
      if (item?.kind === "divider") {
        dividers += 1;
      } else {
        entries += 1;
      }
    }
  }

  return {
    groups: groups.length,
    dividers,
    entries,
  };
}

function buildPreviewGroups(groups = []) {
  return groups.map((group) => ({
    id: String(group?.id || ""),
    title: String(group?.title || ""),
    importMeta: {
      supplemented: !!group?.importMeta?.supplemented,
    },
    items: (Array.isArray(group?.items) ? group.items : []).map((item) => {
      if (item?.kind === "divider") {
        return {
          id: String(item?.id || ""),
          kind: "divider",
          label: String(item?.label || ""),
          value: String(item?.value || ""),
          importMeta: {
            supplemented: !!item?.importMeta?.supplemented,
          },
        };
      }

      const body = String(item?.body || "");
      return {
        id: String(item?.id || ""),
        kind: "entry",
        heading: String(item?.heading || ""),
        body,
        ...(item.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
        previewLine: getFirstPreviewLine(body),
        importMeta: {
          supplemented: !!item?.importMeta?.supplemented,
        },
      };
    }),
  }));
}

function parseMarkdownImport(markdownText, options = {}) {
  const importMode = String(options?.mode || "tree_create").trim();
  const isPartialReplace = importMode === "partial_replace";
  const text = normalizeLineEndings(markdownText);
  const fileName = String(options?.fileName || "").trim();
  const noteType = String(options?.noteType || "plot").trim() || "plot";

  if (!text.trim()) {
    return {
      ok: false,
      error: {
        code: "EMPTY_IMPORT_FILE",
        message: "読み込める内容がありません。",
      },
    };
  }

  const lines = text.split("\n");

  const groups = [];
  const warningDetails = [];

  let currentGroup = null;
  let currentDivider = null;
  let currentEntry = null;

  let pendingDividerSupplementLines = [];
  let dividerSupplementActive = false;
  let fence = null;

  function pushWarning(code, extra = {}) {
    warningDetails.push({
      code: String(code || "").trim(),
      level: String(extra.level || "info"),
      sampleLine: String(extra.sampleLine || ""),
    });
  }

  function ensureGroupForDivider() {
    if (currentGroup) return currentGroup;

    currentGroup = createGroup("無題大分類", { supplemented: true });
    groups.push(currentGroup);

    if (!isPartialReplace) {
      pushWarning("MISSING_GROUP_FOR_DIVIDER");
    }

    return currentGroup;
  }

  function ensureGroupForEntry() {
    if (currentGroup) return currentGroup;

    currentGroup = createGroup("無題大分類", { supplemented: true });
    groups.push(currentGroup);

    if (!isPartialReplace) {
      pushWarning("MISSING_GROUP_FOR_ENTRY");
    }

    return currentGroup;
  }

  function flushDividerSupplement() {
    if (currentDivider && pendingDividerSupplementLines.length) {
      currentDivider.value = pendingDividerSupplementLines.join("\n").trim();
    }

    pendingDividerSupplementLines = [];
    dividerSupplementActive = false;
  }

  function appendEntryBody(line) {
    if (!currentEntry) return;

    currentEntry.body = currentEntry.body
      ? `${currentEntry.body}\n${line}`
      : line;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = String(rawLine || "").trim();
    const memoBlock = !fence && options.readItemMemos !== false ? readItemMemoBlock(lines, lineIndex) : null;
    if (memoBlock?.memo && currentEntry && !currentEntry.memo) {
      currentEntry.body = currentEntry.body.replace(/\n+$/, "");
      currentEntry.memo = memoBlock.memo;
      lineIndex = memoBlock.end;
      continue;
    }
    if (memoBlock) pushWarning("INVALID_ITEM_MEMO", { level: "attention", sampleLine: rawLine });
    const nextFence = readFence(rawLine, fence);
    const literal = !!fence || !!nextFence;
    fence = nextFence;

    const h3 = !literal && trimmed.match(/^###(?:\s|　)+(.*)$/);
    const h2 = !literal && trimmed.match(/^##(?:\s|　)+(.*)$/);
    const h1 = !literal && trimmed.match(/^#(?:\s|　)+(.*)$/);

    if (h3) {
      flushDividerSupplement();

      ensureGroupForEntry();

      const rawHeading = String(h3[1] || "").trim();
      const heading = rawHeading || "無題項目";
      currentEntry = createEntry(heading, "", {
        supplemented: !rawHeading,
      });
      currentGroup.items.push(currentEntry);
      currentDivider = null;
      continue;
    }

    if (h2) {
      flushDividerSupplement();

      ensureGroupForDivider();

      const rawLabel = String(h2[1] || "").trim();
      const label = rawLabel || "無題区分";
      currentDivider = createDivider(label, "", {
        supplemented: !rawLabel,
      });
      currentGroup.items.push(currentDivider);
      currentEntry = null;
      pendingDividerSupplementLines = [];
      dividerSupplementActive = true;
      continue;
    }

    if (h1) {
      flushDividerSupplement();

      const rawGroupTitle = String(h1[1] || "").trim();
      currentGroup = createGroup(rawGroupTitle || "無題大分類", {
        supplemented: !rawGroupTitle,
      });
      groups.push(currentGroup);
      currentDivider = null;
      currentEntry = null;
      continue;
    }

    if (!literal && trimmed.startsWith(">")) {
      if (currentDivider && !currentEntry && dividerSupplementActive) {
        const supplementLine = stripSupplementPrefix(trimmed);
        pendingDividerSupplementLines.push(supplementLine);
        continue;
      }

      if (currentEntry) {
        appendEntryBody(rawLine);
        continue;
      }

      pushWarning("ORPHAN_SUPPLEMENT_LINE", {
        level: "attention",
        sampleLine: rawLine,
      });
      continue;
    }

    if (trimmed === "") {
      if (currentEntry) {
        appendEntryBody("");
      }
      continue;
    }

    if (literal || isUnsupportedMarkdownLine(trimmed)) {
      pushWarning("UNSUPPORTED_MARKDOWN_AS_BODY", {
        level: "attention",
        sampleLine: rawLine,
      });
    }

    flushDividerSupplement();

    if (currentEntry) {
      appendEntryBody(rawLine);
      continue;
    }

    if (currentGroup) {
      currentEntry = createEntry("無題項目", rawLine, {
        supplemented: true,
      });
      currentGroup.items.push(currentEntry);
      currentDivider = null;
      pushWarning("MISSING_ENTRY_HEADING");
      continue;
    }

    currentGroup = createGroup("無題大分類", {
      supplemented: true,
    });
    groups.push(currentGroup);

    currentEntry = createEntry("無題項目", rawLine, {
      supplemented: true,
    });
    currentGroup.items.push(currentEntry);
    currentDivider = null;

    pushWarning(
      isPartialReplace
        ? "MISSING_ENTRY_HEADING"
        : "MISSING_GROUP_AND_ENTRY_FOR_BODY",
    );
  }

  flushDividerSupplement();

  const countsBase = countImportedItems(groups);
  const warnings = dedupeWarnings(warningDetails);

  const parsedNote = {
    title: buildTitleCandidate(options),
    type: noteType,
    noteType,
    groups,
  };

  const previewData = {
    source: {
      filePath: String(options?.filePath || ""),
      fileName,
    },
    target: {
      noteType,
      mode: String(options?.mode || "tree_create"),
      existingNotePath: String(options?.existingNotePath || ""),
      existingNoteTitle: String(options?.existingNoteTitle || ""),
    },
    titleCandidate: parsedNote.title,
    counts: {
      groups: countsBase.groups,
      dividers: countsBase.dividers,
      entries: countsBase.entries,
      warnings: warnings.length,
    },
    warnings,
    preview: {
      groups: buildPreviewGroups(groups),
    },
  };

  return {
    ok: true,
    parsedNote,
    previewData,
  };
}

function parseMarkdownEntriesImport(markdownText, options = {}) {
  const text = normalizeLineEndings(markdownText);
  const fileName = String(options?.fileName || "").trim();

  if (!text.trim()) {
    return {
      ok: false,
      error: {
        code: "EMPTY_IMPORT_FILE",
        message: "読み込める内容がありません。",
      },
    };
  }

  const lines = text.split("\n");
  const entries = [];
  const warningDetails = [];

  let currentEntry = null;
  let fence = null;

  function pushWarning(code, extra = {}) {
    warningDetails.push({
      code: String(code || "").trim(),
      level: String(extra.level || "info"),
      sampleLine: String(extra.sampleLine || ""),
    });
  }

  function pushCurrentEntry() {
    if (!currentEntry) return;

    currentEntry.heading =
      String(currentEntry.heading || "").trim() || "無題項目";
    currentEntry.body = String(currentEntry.body || "").replace(/\n+$/, "");
    entries.push(currentEntry);
    currentEntry = null;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const trimmed = String(rawLine || "").trim();
    const memoBlock = !fence && options.readItemMemos !== false ? readItemMemoBlock(lines, lineIndex) : null;
    if (memoBlock?.memo && currentEntry && !currentEntry.memo) {
      currentEntry.body = currentEntry.body.replace(/\n+$/, "");
      currentEntry.memo = memoBlock.memo;
      lineIndex = memoBlock.end;
      continue;
    }
    if (memoBlock) pushWarning("INVALID_ITEM_MEMO", { level: "attention", sampleLine: rawLine });
    const nextFence = readFence(rawLine, fence);
    const literal = !!fence || !!nextFence;
    fence = nextFence;

    if (!literal && trimmed.startsWith("### ")) {
      pushCurrentEntry();
      currentEntry = createEntry(trimmed.slice(4).trim() || "無題項目", "");
      continue;
    }

    if (!currentEntry) {
      if (trimmed === "") {
        continue;
      }

      // ### が出る前の本文は無題項目に寄せる
      currentEntry = createEntry("無題項目", rawLine, {
        supplemented: true,
      });
      pushWarning("MISSING_ENTRY_HEADING");
      continue;
    }

    currentEntry.body = currentEntry.body
      ? `${currentEntry.body}\n${rawLine}`
      : rawLine;
  }

  pushCurrentEntry();

  if (!entries.length) {
    return {
      ok: false,
      error: {
        code: "ENTRY_IMPORT_NO_ITEMS",
        message:
          "読み込める項目がありません。`### 項目名` 形式の .md を選択してください。",
      },
    };
  }

  return {
    ok: true,
    entries,
    previewData: {
      source: {
        filePath: String(options?.filePath || ""),
        fileName,
      },
      counts: {
        entries: entries.length,
        warnings: dedupeWarnings(warningDetails).length,
      },
      warnings: dedupeWarnings(warningDetails),
      preview: {
        entries: entries.map((item) => ({
          id: String(item.id || ""),
          heading: String(item.heading || ""),
          body: String(item.body || ""),
          ...(item.memo ? { memo: normalizeImportedItemMemo(item.memo) } : {}),
          previewLine: getFirstPreviewLine(item.body || ""),
        })),
      },
    },
  };
}

function parsePlainTextImport(text, options = {}) {
  const normalized = normalizeLineEndings(text);

  if (!normalized.trim()) {
    return {
      ok: false,
      error: {
        code: "EMPTY_IMPORT_FILE",
        message: "読み込める内容がありません。",
      },
    };
  }

  return {
    ok: true,
    body: normalized,
    previewData: {
      source: {
        filePath: String(options?.filePath || ""),
        fileName: String(options?.fileName || ""),
      },
      counts: {
        chars: normalized.length,
        lines: normalized.split("\n").length,
      },
    },
  };
}

const api = {
  formatItemMemoMarkdown,
  normalizeImportedItemMemo,
  parseMarkdownImport,
  parseMarkdownEntriesImport,
  parsePlainTextImport,
  WARNING_MESSAGES,
};

if (typeof module === "object" && module.exports) module.exports = api;
else Object.defineProperty(globalThis, Symbol.for("mojigoto.noteMarkdown"), { value: api });
})();
