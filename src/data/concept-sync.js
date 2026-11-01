function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
}

function notePayloadFromConcept(memo) {
  const type = String(memo?.type || "text");
  if (type === "list") {
    return { type: "list", body: (memo?.listItems || []).map((item) => String(item?.text || "").trim()).filter(Boolean).join("\n"), tags: normalizeTags(memo?.tags) };
  }
  if (type === "todo") {
    return { type: "list", body: (memo?.todoItems || []).map((item) => `[${item?.done ? "x" : " "}] ${String(item?.text || "").trim()}`).join("\n"), tags: normalizeTags(memo?.tags) };
  }
  return { type: "text", body: String(memo?.body || ""), tags: normalizeTags(memo?.tags) };
}

function noteMemoPayload(memo) {
  return { type: String(memo?.type || "text") === "list" ? "list" : "text", body: String(memo?.body || ""), tags: normalizeTags(memo?.tags) };
}

function syncFingerprint(payload) {
  const input = JSON.stringify(noteMemoPayload(payload));
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sync-v1-${hash.toString(16).padStart(8, "0")}`;
}

function createSyncConflictError() {
  const error = new Error("構想メモと項目メモの両方が変更されています。同期する内容を選択してください。");
  error.code = "MOJIGOTO_MEMO_SYNC_CONFLICT";
  return error;
}

function hasSyncConflict(currentFingerprint, desiredFingerprint, baseline, requireSyncBaseline = false) {
  if (currentFingerprint === desiredFingerprint) return false;
  if (!baseline) return Boolean(requireSyncBaseline);
  return currentFingerprint !== baseline && desiredFingerprint !== baseline;
}

module.exports = { createSyncConflictError, hasSyncConflict, noteMemoPayload, notePayloadFromConcept, syncFingerprint };
