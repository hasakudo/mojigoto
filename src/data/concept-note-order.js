const fs = require("fs/promises");
const path = require("path");
const { buildConceptNoteIndex } = require("../../web/lib/concept-note-order");

// Read only: opening a filter must never create note folders or rewrite notes.
async function readConceptNoteIndex(baseDir) {
  const entries = [];
  let failedCount = 0;
  for (const [type, folder] of [["plot", "plots"], ["reference", "references"]]) {
    const dir = path.join(baseDir, folder);
    let files;
    try { files = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code !== "ENOENT") failedCount++; continue; }
    const results = await Promise.allSettled(files.filter((file) => file.isFile() && /\.json$/i.test(file.name))
      .map(async (file) => ({ item: { name: file.name }, data: { ...JSON.parse(await fs.readFile(path.join(dir, file.name), "utf8")), type } })));
    for (const result of results) {
      if (result.status === "fulfilled") entries.push(result.value);
      else failedCount++;
    }
  }
  return { notes: buildConceptNoteIndex(entries), failedCount };
}
module.exports = { readConceptNoteIndex };
