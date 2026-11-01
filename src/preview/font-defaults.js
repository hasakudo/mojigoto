const DEFAULT_MANUSCRIPT_FONT = '"Source Han Serif JP","Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif';

// Accept font lists, but never allow a family name to escape a CSS declaration/style element.
function safeFontFamily(value, fallback = DEFAULT_MANUSCRIPT_FONT) {
  const text = String(value ?? "").trim();
  if (!text || /[;{}<>\\\r\n\x00-\x1f]/.test(text) || /\/\*|\*\//.test(text)) return fallback;
  const parts = text.match(/"[^"\n]*"|'[^'\n]*'|[^,]+/g) || [];
  if (!parts.length) return fallback;
  const families = [];
  for (let part of parts) {
    part = part.trim();
    if (/^(["']).*\1$/.test(part)) part = part.slice(1, -1);
    if (!part || /["']/.test(part)) return fallback;
    families.push(/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|emoji|math|fangsong)$/i.test(part) ? part : `"${part}"`);
  }
  return families.join(",");
}

function usesDefaultFont(font) {
  return font?.useDefault === true || !String(font?.family ?? "").trim();
}

function resolveManuscriptFont(font, defaultFamily) {
  const common = safeFontFamily(defaultFamily);
  return usesDefaultFont(font) ? common : safeFontFamily(font.family, common);
}

module.exports = { DEFAULT_MANUSCRIPT_FONT, safeFontFamily, usesDefaultFont, resolveManuscriptFont };
