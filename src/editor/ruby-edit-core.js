const segmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "grapheme" }) : null;

function characters(text) {
  if (!segmenter) throw new Error("この環境では文字単位のルビ編集に対応していません。");
  return Array.from(segmenter.segment(String(text)), part => part.segment);
}

function rubySpans(text) {
  const pattern = /《《[^\r\n]*?》》|[|｜]([^|｜《》\r\n]+)《([^《》\r\n]*)》|([\p{Script=Han}\p{Mark}々〆ヵヶ]+)《([^《》\r\n]+)》/gu;
  return Array.from(String(text).matchAll(pattern), match => ({
    start: match.index, end: match.index + match[0].length,
    raw: match[0], base: match[1] ?? match[3], reading: match[2] ?? match[4],
    pipe: /^[|｜]/u.test(match[0]) ? match[0][0] : "",
    emphasis: match[1] === undefined && match[3] === undefined,
  }));
}

function draftSignature(draft) {
  return JSON.stringify([draft.mode, draft.groupReading, draft.readings]);
}

function resolveRubyTarget(text, start, end, { defaultMode = "group", pipe = "|" } = {}) {
  text = String(text);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) throw new Error("選択範囲を確認してください。");
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", start);
  if (lineEnd < 0) lineEnd = text.length;
  if (end > lineEnd) throw new Error("ルビは改行を含まない範囲で指定してください。");
  const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
  const spans = rubySpans(line).map(span => ({ ...span, start: span.start + lineStart, end: span.end + lineStart }));
  if (start === end) {
    const span = spans.find(span => !span.emphasis && span.start <= start && (start < span.end || (start === lineEnd && start === span.end)));
    if (!span) throw new Error("ルビを付けたい文字を選択するか、既存のルビ内にカーソルを置いてください。");
    start = span.start;
    end = span.end;
  } else {
    for (const span of spans) {
      if (span.start < end && span.end > start) {
        if (span.emphasis) throw new Error("傍点の範囲はルビと分けて編集してください。");
        start = Math.min(start, span.start);
        end = Math.max(end, span.end);
      }
    }
  }
  // Do not allow a selection to cut a surrogate pair, combining mark or IVS.
  const boundaries = new Set([lineStart]);
  let boundary = lineStart;
  for (const char of characters(line)) { boundary += char.length; boundaries.add(boundary); }
  if (!boundaries.has(start) || !boundaries.has(end)) throw new Error("文字の途中が選択されています。文字全体を選択してください。");
  const source = text.slice(start, end);
  const parts = [];
  let cursor = start;
  for (const span of spans.filter(span => span.start >= start && span.end <= end)) {
    if (span.emphasis) throw new Error("傍点の範囲はルビと分けて編集してください。");
    if (span.start > cursor) parts.push({ base: text.slice(cursor, span.start), reading: "", plain: true });
    parts.push(span);
    cursor = span.end;
  }
  if (cursor < end) parts.push({ base: text.slice(cursor, end), reading: "", plain: true });
  if (parts.some(part => part.plain && /[|｜《》\r\n]/u.test(part.base))) throw new Error("ルビ記号が途中の範囲です。記法を確認してから開き直してください。");
  const base = parts.map(part => part.base).join("");
  if (!base.trim()) throw new Error("ルビを付ける文字を選択してください。");
  const chars = characters(base);
  const hasRuby = parts.some(part => !part.plain);
  const canMap = parts.every(part => part.plain || characters(part.base).length === 1);
  const readings = canMap ? parts.flatMap(part => part.plain ? characters(part.base).map(() => "") : [part.reading]) : chars.map(() => "");
  const mode = hasRuby ? (canMap && parts.length > 1 ? "mono" : "group") : defaultMode === "mono" ? "mono" : "group";
  const draft = { mode, groupReading: parts.map(part => part.reading).join(""), readings };
  return { start, end, source, base, chars, pipe: parts.find(part => part.pipe)?.pipe || (pipe === "｜" ? "｜" : "|"),
    originalReading: draft.groupReading, draft, initialSignature: draftSignature(draft), hasRuby };
}

function resolveRubyTargets(text, ranges, options = {}) {
  if (!Array.isArray(ranges) || !ranges.length) throw new Error("ルビを付ける文字を選択してください。");
  const selected = ranges.some(range => range.start !== range.end)
    ? ranges.filter(range => range.start !== range.end) : ranges;
  let targets = selected.map(range => resolveRubyTarget(text, range.start, range.end, options));
  targets.sort((a, b) => a.start - b.start);
  targets = targets.filter((target, index) => !index || target.start !== targets[index - 1].start || target.end !== targets[index - 1].end);
  if (targets.some((target, index) => index && target.start < targets[index - 1].end)) throw new Error("選択範囲が重なっています。範囲を選び直してください。");
  return targets;
}

function serializeRubyEdit(target, input) {
  if (!input || !["group", "mono"].includes(input.mode)) throw new Error("ルビの種類を選択してください。");
  if (typeof input.groupReading !== "string" || !Array.isArray(input.readings) || input.readings.length !== target.chars.length
    || input.readings.some(value => typeof value !== "string")) throw new Error("ルビの入力内容を確認してください。");
  const values = input.mode === "group" ? [input.groupReading] : input.readings;
  if (values.some(value => /[|｜《》\r\n]/u.test(value))) throw new Error("ルビには改行や | ｜ 《 》 を含められません。");
  if (!values.some(value => value.trim())) throw new Error("ルビを入力してください。単一では空欄の文字にルビを付けません。");
  if (target.hasRuby && draftSignature(input) === target.initialSignature) return target.source;
  if (input.mode === "group") return `${target.pipe}${target.base}《${input.groupReading}》`;
  return target.chars.map((char, index) => input.readings[index] ? `${target.pipe}${char}《${input.readings[index]}》` : char).join("");
}

module.exports = { characters, rubySpans, resolveRubyTarget, resolveRubyTargets, serializeRubyEdit };
