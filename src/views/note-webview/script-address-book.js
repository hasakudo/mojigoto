const { getAddressBookCellActionsScript, getAddressBookEventsScript } = require("../address-book/script-actions");
const { getAddressBookCandidatesScript, getAddressBookVisibilityScript, getAddressBookMatrixScript } = require("../address-book/script-renderer");
const { getAddressBookSaveScript, getAddressBookSaveTimerScript, getAddressBookMessageScript } = require("../address-book/script-sync");

function getAddressBookScript({ standalone = false } = {}) {
  return `
    let workAddressBookState = { characters: [], firstPerson: {}, calls: {}, migratedNoteIds: [] };
    let addressCandidateState = [];
    let addressBookSaveTimer = null;
    let activeAddressTermInput = null;
    let addressBookLoaded = false;
    let addressBookEditVersion = 0;
    let addressBookSavedVersion = 0;
    let addressBookSaveInFlight = null;
    let addressBookSaveBlocked = false;
    let addressBookPendingAction = null;
    let addressBookLoadRequest = null;
    let addressBookLoadSerial = 0;

${getAddressBookSaveScript()}
    function normalizeAddressBookForEditor(value) {
      const seen = new Set();
      const characters = (Array.isArray(value?.characters) ? value.characters : [])
        .map((character) => ({
          noteType: character?.noteType === "plot" ? "plot" : "reference",
          noteId: String(character?.noteId || ""),
          noteFileName: String(character?.noteFileName || ""),
          noteTitle: String(character?.noteTitle || ""),
          groupId: String(character?.groupId || ""),
          groupTitle: String(character?.groupTitle || ""),
          id: String(character?.id || makeId("person")),
          sourceKind: ["group", "divider", "item"].includes(character?.sourceKind)
            ? character.sourceKind
            : "item",
          sourceId: String(character?.sourceId || ""),
          dividerNameSource: character?.dividerNameSource === "label" ? "label" : "value",
          dividerLabel: String(character?.dividerLabel || "").trim(),
          dividerValue: String(character?.dividerValue || "").trim(),
          label: String(character?.label || "").trim(),
        }))
        .filter((character) => {
          if (!character.id || seen.has(character.id)) return false;
          seen.add(character.id);
          return true;
        });
      const normalizeMap = (source) => {
        const result = {};
        if (!source || typeof source !== "object" || Array.isArray(source)) return result;
        Object.entries(source).forEach(([key, text]) => {
          const value = String(text || "").trim();
          if (key && value) result[String(key)] = value;
        });
        return result;
      };
      return {
        storageRevision: value?.storageRevision,
        characters,
        firstPerson: normalizeMap(value?.firstPerson),
        calls: normalizeMap(value?.calls),
        hiddenTerms: [...new Set((Array.isArray(value?.hiddenTerms) ? value.hiddenTerms : []).map((term) => String(term || "").trim()).filter(Boolean))],
        migratedNoteIds: Array.isArray(value?.migratedNoteIds) ? [...value.migratedNoteIds] : [],
      };
    }

    function ensureAddressBookState() {
      workAddressBookState = normalizeAddressBookForEditor(workAddressBookState);
      return workAddressBookState;
    }

    function getAddressSourceCandidates() {
      return Array.isArray(addressCandidateState) ? addressCandidateState : [];
    }

    function getDividerCandidateLabel(candidate, source) {
      if (candidate?.sourceKind !== "divider") return String(candidate?.label || "").trim();
      const dividerLabel = String(candidate?.dividerLabel || "").trim();
      const dividerValue = String(candidate?.dividerValue || "").trim();
      return source === "label"
        ? dividerLabel || dividerValue
        : dividerValue || dividerLabel;
    }

    function getAddressCharacterLabel(character) {
      const candidate = getAddressSourceCandidates().find((entry) =>
        entry.noteType === character.noteType && entry.noteId === character.noteId &&
        entry.sourceKind === character.sourceKind && entry.sourceId === character.sourceId,
      );
      if (candidate?.sourceKind === "divider") {
        return getDividerCandidateLabel(candidate, character.dividerNameSource) || character.label || "名前未設定";
      }
      return candidate?.label || character.label || "名前未設定";
    }

    function getAddressTermStats() {
      const book = ensureAddressBookState();
      const defaults = ["私", "わたし", "わたくし", "僕", "俺", "自分", "あなた", "君", "お前", "あんた", "貴方", "貴女"];
      const counts = new Map(defaults.map((term) => [term, 0]));
      book.hiddenTerms.forEach((term) => {
        if (!counts.has(term)) counts.set(term, 0);
      });
      [...Object.values(book.firstPerson || {}), ...Object.values(book.calls || {})]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
      return [...counts.entries()]
        .map(([term, count]) => ({ term, count, hidden: book.hiddenTerms.includes(term) }))
        .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term, "ja"));
    }

    function getAddressTerms() {
      return getAddressTermStats().filter((entry) => !entry.hidden).map((entry) => entry.term);
    }

${getAddressBookCandidatesScript()}
${getAddressBookSaveTimerScript()}
${getAddressBookVisibilityScript()}
${getAddressBookCellActionsScript()}
${getAddressBookMatrixScript()}
${getAddressBookEventsScript(standalone)}
${getAddressBookMessageScript()}
  `;
}

module.exports = {
  getAddressBookScript,
};
