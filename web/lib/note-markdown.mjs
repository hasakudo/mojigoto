import * as shared from "./note-markdown-core.js";

// Node uses the CommonJS export; browsers use the private symbol installed by
// the same source. This keeps the extension's synchronous import API intact.
const parser = shared.default ?? globalThis[Symbol.for("mojigoto.noteMarkdown")];
export const { parseMarkdownImport, parseMarkdownEntriesImport, parsePlainTextImport } = parser;
