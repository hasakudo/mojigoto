const fs = require("fs");
const path = require("path");
const { isDeepStrictEqual } = require("util");

const NOTE_INDEX_FILE = "notes-index.json";

function noteSearchText(note) {
  const parts = [note?.title];
  for (const group of note?.groups || []) {
    parts.push(group?.title);
    for (const item of group?.items || []) {
      parts.push(item?.kind === "divider" ? item?.label : item?.heading);
      parts.push(item?.kind === "divider" ? item?.value : item?.body);
      parts.push(item?.memo?.body);
      parts.push(...(Array.isArray(item?.memo?.tags) ? item.memo.tags : []));
    }
  }
  return parts.filter(Boolean).join("\n");
}

function makeNoteIndexEntry(fileName, note, fallbackType, modifiedAt = "") {
  const searchText = noteSearchText(note);
  const previewText = noteSearchText({ ...note, title: "" }).replace(/\s+/g, " ").trim();
  const previewChars = Array.from(previewText);
  return {
    fileName: String(fileName || ""),
    id: String(note?.id || ""),
    type: note?.type === "reference" ? "reference" : fallbackType === "reference" ? "reference" : "plot",
    title: String(note?.title || ""),
    order: Number.isFinite(Number(note?.order)) && note?.order !== null && note?.order !== "" ? Number(note.order) : null,
    groupCount: Array.isArray(note?.groups) ? note.groups.length : 0,
    preview: previewChars.length > 100 ? `${previewChars.slice(0, 100).join("")}…` : previewText,
    searchText,
    updatedAt: String(note?.updatedAt || modifiedAt || ""),
    fileModifiedAt: String(modifiedAt || ""),
  };
}

function readEntries(dirPath, type) {
  let files = [];
  try {
    files = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return files
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .map((entry) => {
      const filePath = path.join(dirPath, entry.name);
      try {
        const note = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return makeNoteIndexEntry(entry.name, note, type, fs.statSync(filePath).mtime.toISOString());
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "ja", { numeric: true }));
}

function comparableIndexContent(value) {
  const sortEntries = (entries) => [...(Array.isArray(entries) ? entries : [])]
    .sort((a, b) => String(a?.fileName || "").localeCompare(String(b?.fileName || ""), "ja", { numeric: true }));
  return {
    schemaVersion: Number(value?.schemaVersion || 0),
    plots: sortEntries(value?.plots),
    references: sortEntries(value?.references),
  };
}

function writeNoteIndex(mojigotoDir, now = new Date()) {
  if (!mojigotoDir) return false;
  try {
    fs.mkdirSync(mojigotoDir, { recursive: true });
    const filePath = path.join(mojigotoDir, NOTE_INDEX_FILE);
    const previous = (() => {
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return null;
      }
    })();
    const document = {
      schemaVersion: 1,
      updatedAt: now.toISOString(),
      plots: readEntries(path.join(mojigotoDir, "plots"), "plot"),
      references: readEntries(path.join(mojigotoDir, "references"), "reference"),
    };
    if (previous && isDeepStrictEqual(comparableIndexContent(previous), comparableIndexContent(document))) {
      return previous;
    }
    fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    return document;
  } catch {
    return false;
  }
}

module.exports = {
  NOTE_INDEX_FILE,
  noteSearchText,
  makeNoteIndexEntry,
  comparableIndexContent,
  writeNoteIndex,
};
