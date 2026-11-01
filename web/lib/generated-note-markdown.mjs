import * as shared from "./generated-note-markdown.js";
const format = shared.default ?? globalThis[Symbol.for("mojigoto.generatedNoteMarkdown")];
export const { decode, canonical, restoreHeadings, validateParsedIds, applyDetails, remapSelfLinks, findImportedTarget, importedAddressBook } = format;
export async function verifyGeneratedMarkdown(decoded) {
  const hash = async (value) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if ((decoded.metadata.version >= 4 && await hash(JSON.stringify(decoded.metadata.attachments)) !== decoded.metadata.attachmentsHash)
      || await hash(decoded.body) !== decoded.metadata.bodyHash
      || await hash(canonical(decoded.metadata, decoded.body)) !== decoded.metadata.exportHash) {
    throw new Error("生成後にMarkdownが変更されています。VS Codeで再生成したファイルを選択してください。");
  }
}
