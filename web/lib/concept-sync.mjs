function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
}

export function notePayloadFromConcept(memo) {
  const type = String(memo?.type || "text");
  if (type === "list") {
    return {
      type: "list",
      body: (memo?.listItems || []).map((item) => String(item?.text || "").trim()).filter(Boolean).join("\n"),
      tags: normalizeTags(memo?.tags),
    };
  }
  if (type === "todo") {
    return {
      type: "list",
      body: (memo?.todoItems || []).map((item) => `[${item?.done ? "x" : " "}] ${String(item?.text || "").trim()}`).join("\n"),
      tags: normalizeTags(memo?.tags),
    };
  }
  return { type: "text", body: String(memo?.body || ""), tags: normalizeTags(memo?.tags) };
}

export function noteMemoPayload(memo) {
  return {
    type: String(memo?.type || "text") === "list" ? "list" : "text",
    body: String(memo?.body || ""),
    tags: normalizeTags(memo?.tags),
  };
}

export function syncFingerprint(payload) {
  const input = JSON.stringify(noteMemoPayload(payload));
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sync-v1-${hash.toString(16).padStart(8, "0")}`;
}

export function analyzeConceptNoteSync(conceptMemo, noteMemo) {
  const conceptFingerprint = syncFingerprint(notePayloadFromConcept(conceptMemo));
  const noteFingerprint = syncFingerprint(noteMemoPayload(noteMemo));
  const candidates = [conceptMemo?.source?.syncFingerprint, noteMemo?.conceptMemoSyncFingerprint]
    .map((value) => String(value || ""))
    .filter(Boolean);
  const baseline = candidates.find((value) => value === conceptFingerprint || value === noteFingerprint) || candidates[0] || "";

  if (conceptFingerprint === noteFingerprint) {
    return { status: "synced", baseline: conceptFingerprint, conceptFingerprint, noteFingerprint };
  }
  if (!baseline) return { status: "untracked", baseline: "", conceptFingerprint, noteFingerprint };
  if (conceptFingerprint === baseline) return { status: "note-changed", baseline, conceptFingerprint, noteFingerprint };
  if (noteFingerprint === baseline) return { status: "concept-changed", baseline, conceptFingerprint, noteFingerprint };
  return { status: "conflict", baseline, conceptFingerprint, noteFingerprint };
}

export function applyNotePayloadToConcept(memo, noteMemo) {
  const payload = noteMemoPayload(noteMemo);
  if (memo.type === "todo") {
    const previous = Array.isArray(memo.todoItems) ? memo.todoItems : [];
    memo.todoItems = payload.body.split(/\r?\n/).map((line, index) => {
      const marker = line.trim().match(/^\[([ xX])\]\s*/);
      return {
        ...(previous[index] || {}),
        id: String(previous[index]?.id || `td_${Date.now()}_${index}`),
        text: marker ? line.trim().slice(marker[0].length) : line.trim(),
        done: marker ? marker[1].toLowerCase() === "x" : Boolean(previous[index]?.done),
      };
    }).filter((item) => item.text);
    memo.body = "";
  } else if (payload.type === "list") {
    const previous = Array.isArray(memo.listItems) ? memo.listItems : [];
    memo.type = "list";
    memo.listItems = payload.body.split(/\r?\n/).map((text, index) => ({
      ...(previous[index] || {}),
      id: String(previous[index]?.id || `li_${Date.now()}_${index}`),
      text: text.trim(),
      checked: Boolean(previous[index]?.checked),
    })).filter((item) => item.text);
    memo.body = "";
  } else {
    memo.type = "text";
    memo.body = payload.body;
  }
  memo.tags = payload.tags;
  return memo;
}
