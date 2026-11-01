export const COUNT_MODES = {
  compact: "空白・改行を除く",
  default: "ルビ・見出し・空白・改行を除く",
  withFullWidthSpaces: "全角空白を含む（ルビ除外）",
  withNewlines: "改行を含む（ルビ・空白除外）",
  withSpacesAndNewlines: "空白・改行を含む（ルビ除外）",
  allExceptNewlines: "改行だけ除く（ルビ含む）",
  allInclusive: "すべて含む",
};

export function stripRubyForCount(text) {
  return String(text || "")
    .replace(/《《(.*?)》》/g, "$1")
    .replace(/《[^》\n]*》/g, "")
    .replace(/[|｜]/g, "");
}

function structured(text) {
  return stripRubyForCount(String(text || "").replace(/\r\n?/g, "\n").replace(/^(#{1,3})\s+/gm, ""));
}

export function countTextByMode(text, mode = "compact") {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  if (mode === "allInclusive") return [...normalized].length;
  if (mode === "allExceptNewlines") return [...normalized.replace(/\n/g, "")].length;
  if (mode === "compact") return [...normalized.replace(/[\s\r\n]/g, "")].length;
  let value = structured(normalized);
  if (mode === "withFullWidthSpaces") value = value.replace(/[ \t\n]/g, "");
  else if (mode === "withNewlines") value = value.replace(/[ \t\u3000]/g, "");
  else if (mode === "withSpacesAndNewlines") value = value;
  else value = value.replace(/[\s\r\n]/g, "");
  return [...value].length;
}
