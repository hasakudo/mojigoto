(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = { ...factory(), createNoteSearchReplace: factory };
  else root.MojigotoNoteSearchReplace = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function createNoteSearchReplace() {
  const array = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === "string" ? value : "";

  // Offsets are UTF-16 offsets into the original input, suitable for textarea selection.
  function findMatches(source, query, caseSensitive) {
    const boundaries = new Map([[0, 0]]);
    let folded = "", originalOffset = 0;
    for (const char of source) {
      folded += caseSensitive ? char : char.toLowerCase();
      originalOffset += char.length;
      boundaries.set(folded.length, originalOffset);
    }
    const needle = caseSensitive ? query : Array.from(query, char => char.toLowerCase()).join("");
    const matches = [];
    for (let offset = 0; offset <= folded.length - needle.length;) {
      const start = folded.indexOf(needle, offset);
      if (start < 0) break;
      const end = start + needle.length;
      if (boundaries.has(start) && boundaries.has(end)) {
        matches.push({ start: boundaries.get(start), end: boundaries.get(end) });
        offset = end;
      } else offset = start + 1;
    }
    return matches;
  }

  function inspectNotation(source) {
    // Protect explicit/implicit ruby and emphasis, including adjacent mono ruby.
    const pattern = /《《[^《》\r\n]*》》|[|｜]([^|｜《》\r\n]+)《([^《》\r\n]*)》|([\p{Script=Han}\p{Mark}々〆ヵヶ]+)《([^《》\r\n]+)》/gu;
    const spans = [];
    let cursor = 0, malformed = false;
    for (const match of source.matchAll(pattern)) {
      if (/[《》]/u.test(source.slice(cursor, match.index))) malformed = true;
      spans.push({ start: match.index, end: match.index + match[0].length, raw: match[0], kind: match[0].startsWith("《《") ? "emphasis" : "ruby" });
      cursor = match.index + match[0].length;
    }
    if (/[《》]/u.test(source.slice(cursor))) malformed = true;
    return { spans, malformed };
  }

  function positionIndex(source) {
    const starts = [0, ...Array.from(source.matchAll(/\r\n|\r|\n/g), match => match.index + match[0].length)];
    const characters = new Map([[0, 0]]);
    let offset = 0, count = 0;
    for (const char of source) { offset += char.length; characters.set(offset, ++count); }
    return { starts, characters };
  }

  function location({ starts, characters }, offset) {
    let low = 0, high = starts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= offset) low = middle; else high = middle;
    }
    return { line: low + 1, column: characters.get(offset) - characters.get(starts[low]) + 1 };
  }

  function snippet(source, start, end, replacement) {
    let left = Math.max(0, start - 35), right = Math.min(source.length, end + 35);
    if (left > 0 && /[\uDC00-\uDFFF]/.test(source[left])) left--;
    if (right < source.length && /[\uDC00-\uDFFF]/.test(source[right])) right++;
    const prefix = (left ? "…" : "") + source.slice(left, start);
    const suffix = source.slice(end, right) + (right < source.length ? "…" : "");
    return { previewBefore: prefix + source.slice(start, end) + suffix, previewAfter: prefix + replacement + suffix };
  }

  function duplicateIds(records) {
    const seen = new Set(), duplicates = new Set();
    for (const record of records) {
      const id = text(record?.id);
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    return duplicates;
  }

  function buildReplacePlan(note, options = {}) {
    const query = text(options.query), replacement = text(options.replacement);
    const plan = { noteId: text(note?.id), revision: Number.isSafeInteger(options.revision) ? options.revision : 0,
      query, replacement, caseSensitive: options.caseSensitive === true,
      fields: [], candidates: [], excluded: [], issues: [], valid: true };
    if (!query || !plan.noteId) {
      plan.valid = false;
      plan.issues.push({ reason: !query ? "empty_query" : "missing_note_id" });
      return plan;
    }
    const enabled = { names: options.fields?.names !== false, details: options.fields?.details !== false, memos: options.fields?.memos === true };
    const groups = array(note.groups), duplicateGroups = duplicateIds(groups);
    const duplicateItems = duplicateIds(groups.flatMap(group => array(group?.items)));
    function addField(group, item, field, label, value) {
      const before = text(value);
      const matches = findMatches(before, query, plan.caseSensitive);
      if (!matches.length) return;
      if (!text(group?.id) || duplicateGroups.has(group.id) || (item && (!text(item.id) || duplicateItems.has(item.id)))) {
        plan.issues.push({ groupId: text(group?.id), itemId: text(item?.id), field, reason: "ambiguous_identity" });
        return;
      }
      const fieldIndex = plan.fields.length, notation = inspectNotation(before), positions = positionIndex(before);
      plan.fields.push({ noteId: plan.noteId, groupId: group.id, itemId: text(item?.id), field, label,
        groupTitle: text(group.title), itemTitle: item?.kind === "divider" ? text(item.label) : text(item?.heading), before });
      let spanIndex = 0;
      for (const match of matches) {
        while (spanIndex < notation.spans.length && notation.spans[spanIndex].end <= match.start) spanIndex++;
        const span = notation.spans[spanIndex];
        const reason = notation.malformed ? "malformed_notation" : span && span.start < match.end ? "protected_notation" : "";
        const candidate = { id: `${fieldIndex}:${match.start}:${match.end}`, fieldIndex, ...match,
          ...location(positions, match.start), before: before.slice(match.start, match.end), after: replacement,
          ...snippet(before, match.start, match.end, replacement) };
        if (reason) plan.excluded.push({ ...candidate, reason, ...(span ? { notationKind: span.kind } : {}) });
        else if (candidate.before !== replacement) plan.candidates.push(candidate);
      }
    }
    for (const group of groups) {
      if (!group || typeof group !== "object") continue;
      if (enabled.names) addField(group, null, "title", "大分類名", group.title);
      for (const item of array(group.items)) {
        if (!item || typeof item !== "object") continue;
        if (item.kind === "divider") {
          if (enabled.names) {
            addField(group, item, "label", "区分名", item.label);
            addField(group, item, "value", "補足", item.value);
          }
        } else {
          if (enabled.names) addField(group, item, "heading", "項目名", item.heading);
          if (enabled.details) addField(group, item, "body", "項目詳細", item.body);
          if (enabled.memos) addField(group, item, "memo.body", "項目メモ", item.memo?.body);
        }
      }
    }
    return plan;
  }

  // Only computes string changes. It never reads/writes the live note or performs persistence.
  function previewReplaceSelection(plan, selectedIds) {
    if (!plan?.valid) return { ok: false, reason: "invalid_plan", changes: [] };
    const ids = new Set(array(selectedIds));
    const candidates = new Map(plan.candidates.map(candidate => [candidate.id, candidate]));
    if ([...ids].some(id => !candidates.has(id))) return { ok: false, reason: "invalid_selection", changes: [] };
    const selectedFields = new Map();
    for (const id of ids) {
      const candidate = candidates.get(id);
      if (!selectedFields.has(candidate.fieldIndex)) selectedFields.set(candidate.fieldIndex, []);
      selectedFields.get(candidate.fieldIndex).push(candidate);
    }
    const changes = [], issues = [];
    for (const [fieldIndex, matches] of selectedFields) {
      const field = plan.fields[fieldIndex], original = inspectNotation(field.before);
      matches.sort((a, b) => a.start - b.start);
      let cursor = 0, after = "";
      for (const match of matches) {
        after += field.before.slice(cursor, match.start) + plan.replacement;
        cursor = match.end;
      }
      after += field.before.slice(cursor);
      let editIndex = 0, delta = 0;
      const expected = original.spans.map(span => {
        while (editIndex < matches.length && matches[editIndex].end <= span.start) {
          const match = matches[editIndex++];
          delta += plan.replacement.length - (match.end - match.start);
        }
        return { ...span, start: span.start + delta, end: span.end + delta };
      });
      const actual = inspectNotation(after);
      if (actual.malformed || JSON.stringify(expected) !== JSON.stringify(actual.spans)) issues.push({ fieldIndex, reason: "notation_change" });
      else changes.push({ ...field, fieldIndex, after, count: matches.length });
    }
    return issues.length ? { ok: false, reason: "notation_change", issues, changes: [] }
      : { ok: true, changes, count: ids.size };
  }

  // Search includes protected notation and never suppresses a match because its replacement is identical.
  function buildSearchPlan(note, options = {}) {
    const plan = buildReplacePlan(note, { ...options, replacement: "" });
    return { ...plan, matches: [...plan.candidates.map(row => ({ ...row, reason: "" })), ...plan.excluded]
      .sort((a, b) => a.fieldIndex - b.fieldIndex || a.start - b.start) };
  }

  return { buildReplacePlan, previewReplaceSelection, buildSearchPlan };
});
