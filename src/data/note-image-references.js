const fs = require("fs/promises");
const path = require("path");

// Copies imported from Markdown can share an image. Remove the physical file
// only after saving the note, and only when no other note still references it.
async function removeUnreferencedImage(root, currentFile, groups, relativePath) {
  const target = path.resolve(root, relativePath);
  const imageRoot = path.resolve(root, "note-images") + path.sep;
  if (!target.toLowerCase().startsWith(imageRoot.toLowerCase())) return;
  let location = target;
  while (path.resolve(location).toLowerCase() !== path.resolve(root).toLowerCase()) {
    try { if ((await fs.lstat(location)).isSymbolicLink()) return; }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    location = path.dirname(location);
  }
  const refers = (list) => (list || []).some((group) => (group.images || []).some((image) =>
    path.resolve(root, String(image.relativePath || "")).toLowerCase() === target.toLowerCase()));
  if (refers(groups)) return;
  for (const name of ["plots", "references"]) {
    let files;
    try { files = await fs.readdir(path.join(root, name), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const file of files) {
      if (!file.isFile() || !/\.json$/i.test(file.name)) continue;
      const location = path.join(root, name, file.name);
      if (path.resolve(location).toLowerCase() === path.resolve(currentFile).toLowerCase()) continue;
      if (refers(JSON.parse(await fs.readFile(location, "utf8")).groups)) return;
    }
  }
  try { await fs.unlink(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
module.exports = { removeUnreferencedImage };
