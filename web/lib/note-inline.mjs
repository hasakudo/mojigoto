// Match the note exporter’s explicit/implicit ruby and emphasis syntax.
// Tokens remain plain text; callers must create DOM nodes rather than HTML.
export function parseNoteInline(value) {
  const source = String(value ?? "");
  const pattern = /《《([^\n]*?)》》|[|｜]([^《\n]+?)《([^《》\n]+?)》|([一-龠々〆ヵヶぁ-んァ-ヴーA-Za-z0-9]+)《([^《》\n]+?)》/gu;
  const tokens = [];
  let end = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > end) tokens.push({ type: "text", text: source.slice(end, match.index) });
    if (match[1] !== undefined) tokens.push({ type: "emphasis", text: match[1] });
    else tokens.push({ type: "ruby", text: match[2] ?? match[4], reading: match[3] ?? match[5] });
    end = match.index + match[0].length;
  }
  if (end < source.length) tokens.push({ type: "text", text: source.slice(end) });
  return tokens;
}
