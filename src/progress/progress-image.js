const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sanitizeProgressImageFileNamePart(value, fallback = "progress") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 48)
    .trim();
  return normalized || fallback;
}

function decodeProgressImageDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  if (!source.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error("PNG画像の形式が正しくありません。");
  }
  const encoded = source.slice(PNG_DATA_URL_PREFIX.length);
  if (!encoded || encoded.length > 16 * 1024 * 1024) {
    throw new Error("PNG画像のサイズが正しくありません。");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("PNG画像を確認できませんでした。");
  }
  return bytes;
}

module.exports = {
  decodeProgressImageDataUrl,
  sanitizeProgressImageFileNamePart,
};
