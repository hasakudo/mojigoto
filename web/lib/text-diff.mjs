function normalizedLines(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
}

function findNearby(lines, value, start, distance = 80) {
  const end = Math.min(lines.length, start + distance + 1);
  for (let index = start; index < end; index += 1) {
    if (lines[index] === value) return index;
  }
  return -1;
}

export function createLineDiffRows(beforeValue, afterValue) {
  const before = normalizedLines(beforeValue);
  const after = normalizedLines(afterValue);
  const rows = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let beforeLine = 1;
  let afterLine = 1;

  const push = (type, oldText = "", newText = "") => {
    rows.push({
      type,
      oldLine: type === "insert" ? null : beforeLine,
      newLine: type === "delete" ? null : afterLine,
      oldText,
      newText,
    });
    if (type !== "insert") beforeLine += 1;
    if (type !== "delete") afterLine += 1;
  };

  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      push("equal", before[beforeIndex], after[afterIndex]);
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }
    const nextInAfter = findNearby(after, before[beforeIndex], afterIndex + 1);
    const nextInBefore = findNearby(before, after[afterIndex], beforeIndex + 1);
    const insertDistance = nextInAfter < 0 ? Infinity : nextInAfter - afterIndex;
    const deleteDistance = nextInBefore < 0 ? Infinity : nextInBefore - beforeIndex;
    if (insertDistance < deleteDistance) {
      push("insert", "", after[afterIndex]);
      afterIndex += 1;
    } else if (deleteDistance < Infinity) {
      push("delete", before[beforeIndex], "");
      beforeIndex += 1;
    } else {
      push("change", before[beforeIndex], after[afterIndex]);
      beforeIndex += 1;
      afterIndex += 1;
    }
  }
  while (beforeIndex < before.length) {
    push("delete", before[beforeIndex], "");
    beforeIndex += 1;
  }
  while (afterIndex < after.length) {
    push("insert", "", after[afterIndex]);
    afterIndex += 1;
  }
  return rows;
}

export function summarizeLineDiff(rows) {
  return rows.reduce((summary, row) => {
    if (row.type === "change") summary.changed += 1;
    if (row.type === "insert") summary.inserted += 1;
    if (row.type === "delete") summary.deleted += 1;
    return summary;
  }, { changed: 0, inserted: 0, deleted: 0 });
}

export function selectDiffContext(rows, { context = 3, showAll = false } = {}) {
  if (showAll) return [...rows];
  const visible = new Set();
  rows.forEach((row, index) => {
    if (row.type === "equal") return;
    for (let cursor = Math.max(0, index - context); cursor <= Math.min(rows.length - 1, index + context); cursor += 1) {
      visible.add(cursor);
    }
  });
  if (!visible.size) return rows.slice(0, Math.min(rows.length, context * 2 + 1));
  const result = [];
  let index = 0;
  while (index < rows.length) {
    if (visible.has(index)) {
      result.push(rows[index]);
      index += 1;
      continue;
    }
    const start = index;
    while (index < rows.length && !visible.has(index)) index += 1;
    result.push({ type: "gap", omitted: index - start });
  }
  return result;
}
