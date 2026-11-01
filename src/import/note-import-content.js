const { prepareImportedGroups } = require("./note-memo-options");

// Create uses the source title; replacement also considers the target title.
function getImportedNoteTitle(options, payload, replacing = false) {
  return String(payload?.title || "").trim()
    || (replacing ? String(options?.existingNoteTitle || "").trim() : "")
    || String(options?.previewData?.titleCandidate || "").trim()
    || "インポートノート";
}

function buildImportedNoteReplacement(existingNote, sourceNote, noteType, title, includeItemMemos = true) {
  return {
    storageRevision: existingNote.storageRevision,
    id: existingNote.id,
    order: existingNote.order,
    title,
    type: String(noteType || "plot"),
    groups: prepareImportedGroups(sourceNote?.groups, includeItemMemos),
  };
}

module.exports = { getImportedNoteTitle, buildImportedNoteReplacement };
