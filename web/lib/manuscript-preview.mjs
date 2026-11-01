export function normalizePreviewLineCharacters(value, fallback = 40) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(40, Math.max(10, parsed)) : fallback;
}

export function parseManuscriptInline(value) {
  const source = String(value || "");
  const tokens = [];
  let cursor = 0;
  let plain = "";
  const flushPlain = () => {
    if (!plain) return;
    tokens.push({ type: "text", text: plain });
    plain = "";
  };

  while (cursor < source.length) {
    if (source.startsWith("《《", cursor)) {
      const end = source.indexOf("》》", cursor + 2);
      if (end >= 0) {
        flushPlain();
        tokens.push({ type: "emphasis", text: source.slice(cursor + 2, end) });
        cursor = end + 2;
        continue;
      }
    }

    if (source[cursor] === "|" || source[cursor] === "｜") {
      const rubyOpen = source.indexOf("《", cursor + 1);
      const lineBreak = source.indexOf("\n", cursor + 1);
      if (rubyOpen >= 0 && (lineBreak < 0 || rubyOpen < lineBreak)) {
        const rubyClose = source.indexOf("》", rubyOpen + 1);
        const base = source.slice(cursor + 1, rubyOpen);
        const reading = rubyClose >= 0 ? source.slice(rubyOpen + 1, rubyClose) : "";
        if (rubyClose >= 0 && base && reading && !/[|｜《》]/u.test(base)) {
          flushPlain();
          tokens.push({ type: "ruby", text: base, reading });
          cursor = rubyClose + 1;
          continue;
        }
      }
    }

    plain += source[cursor];
    cursor += 1;
  }
  flushPlain();
  return tokens;
}

export function parseManuscriptPreview(value) {
  return String(value || "").replace(/\r\n?/g, "\n").split("\n").map((raw) => {
    const heading = /^(#{1,3})(?!#)(?=\s|$)(?:\s+)?(.*)$/u.exec(raw);
    const text = heading ? heading[2] : raw;
    return {
      type: heading ? "heading" : raw ? "paragraph" : "blank",
      level: heading ? heading[1].length : 0,
      tokens: parseManuscriptInline(text),
    };
  });
}
