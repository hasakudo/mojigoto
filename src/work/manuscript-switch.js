const fsp = require("fs/promises");
const path = require("path");

async function linkStat(fileSystem, linkPath) {
  try { return await fileSystem.lstat(linkPath); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function replaceJunction(linkPath, targetPath, fileSystem = fsp) {
  const existing = await linkStat(fileSystem, linkPath);
  if (existing && !existing.isSymbolicLink()) {
    const error = new Error("原稿リンクの位置に実フォルダまたはファイルがあります。内容を保護して直接参照へ切り替えます。");
    error.code = "EISDIR";
    throw error;
  }
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const temporary = `${linkPath}.new-${suffix}`;
  const previous = `${linkPath}.previous-${suffix}`;
  let movedPrevious = false;
  let installed = false;
  try {
    // Create first: an unsupported filesystem must not remove the old link.
    await fileSystem.symlink(targetPath, temporary, "junction");
    if (existing) { await fileSystem.rename(linkPath, previous); movedPrevious = true; }
    await fileSystem.rename(temporary, linkPath);
    installed = true;
  } catch (error) {
    if (movedPrevious) {
      try { await fileSystem.rename(previous, linkPath); }
      catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  } finally {
    const disposable = installed ? previous : temporary;
    try {
      const stat = await linkStat(fileSystem, disposable);
      if (stat?.isSymbolicLink()) await fileSystem.unlink(disposable);
    } catch { /* Never recursively remove a real directory to clean up a link. */ }
  }
}

async function switchManuscriptRoot({ linkPath, targetPath, configuredRoot = "", updateRoot, fileSystem = fsp }) {
  if (!(await fileSystem.stat(targetPath)).isDirectory()) throw new Error("作品の原稿フォルダを確認できませんでした。");
  if (configuredRoot && path.resolve(configuredRoot) !== path.resolve(linkPath)) {
    await updateRoot(targetPath);
    return { mode: "direct", manuscriptRoot: targetPath };
  }
  try {
    await replaceJunction(linkPath, targetPath, fileSystem);
  } catch (error) {
    if (error.rollbackError || !["EISDIR", "ENOTSUP", "EOPNOTSUPP", "EPERM", "EACCES", "EINVAL"].includes(error.code)) throw error;
    await updateRoot(targetPath);
    return { mode: "direct", manuscriptRoot: targetPath, fallback: true };
  }
  await updateRoot(linkPath);
  return { mode: "junction", manuscriptRoot: linkPath };
}

module.exports = { replaceJunction, switchManuscriptRoot };
