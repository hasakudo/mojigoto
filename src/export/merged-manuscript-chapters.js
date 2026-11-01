const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { randomUUID, createHash } = require("crypto");

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function captureManuscriptSource(manuscriptRoot, workName) {
  return { manuscriptRoot, manuscriptIdentity:fs.realpathSync(manuscriptRoot), workName };
}

function assertManuscriptSource(source, currentRoot) {
  if (pathKey(source.manuscriptRoot) !== pathKey(currentRoot) ||
      pathKey(source.manuscriptIdentity) !== pathKey(fs.realpathSync(currentRoot))) {
    throw new Error("書き出し対象のViewが切り替わりました。原稿の書き出しを開き直してください。");
  }
}

function groupManuscriptFilesByChapter(manuscriptRoot, files) {
  const groups = new Map();
  for (const file of files) {
    const relative = path.relative(manuscriptRoot, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("原稿フォルダの外のファイルは章に含められません。");
    }
    const parts = relative.split(path.sep), id = parts.length > 1 ? parts[0] : "";
    if (!groups.has(id)) groups.set(id, {id, title:id || "章なし（manuscript直下）", files:[]});
    // Preserve the existing merged-export order within each chapter.
    groups.get(id).files.push(file);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.id || !b.id) return a.id ? -1 : b.id ? 1 : 0;
    return a.id.localeCompare(b.id, "ja", {numeric:true});
  });
}

function safeName(value, fallback) {
  return String(value || "").normalize("NFC").replace(/[\x00-\x1f\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ").replace(/[. ]+$/, "").trim().slice(0, 80) || fallback;
}

function buildChapterOutputNames(workName, chapters, ext, suffix = "") {
  if (!["txt", "md", "html"].includes(ext) || !/^[_a-z0-9]*$/i.test(suffix)) throw new Error("書き出し形式を確認してください。");
  const work = safeName(workName, "作品");
  const bases = chapters.map(chapter => chapter.id === "" ? `${work}（直下の原稿）${suffix}` : `${work}_${safeName(chapter.id, "章")}${suffix}`);
  const counts = new Map();
  for (const base of bases) counts.set(base.toLowerCase(), (counts.get(base.toLowerCase()) || 0) + 1);
  return chapters.map((chapter, index) => {
    const base = bases[index];
    const unique = counts.get(base.toLowerCase()) > 1 ? `_${createHash("sha256").update(chapter.id).digest("hex").slice(0, 10)}` : "";
    return `${base}${unique}.${ext}`;
  });
}

function assertChapterExportDirectory(directory, manuscriptRoot) {
  const realDir = fs.realpathSync(directory), realRoot = fs.realpathSync(manuscriptRoot);
  if (!fs.statSync(realDir).isDirectory()) throw new Error("書き出し先のフォルダが見つかりません。");
  const relative = path.relative(realRoot, realDir);
  if (relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error("書き出し先は原稿フォルダの外を選んでください。出力したファイルが次の原稿結合に含まれることを防ぎます。");
  }
  return realDir;
}

function outputVersion(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`書き出し先に通常のファイルではない項目があります：${path.basename(file)}`);
    return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
  } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function inspectChapterOutputs(directory, outputs) {
  return outputs.map(output => {
    if (!output.fileName || path.basename(output.fileName) !== output.fileName) throw new Error("書き出しファイル名を確認してください。");
    const outPath = path.join(directory, output.fileName);
    return {outPath, version:outputVersion(outPath)};
  });
}

async function writeChapterOutputs(directory, outputs, expected, {beforeCommit, onProgress} = {}) {
  const staged = [], written = [];
  try {
    for (const output of outputs) {
      const temp = path.join(directory, `.mojigoto-export-${randomUUID()}.tmp`);
      const handle = await fsp.open(temp, "wx");
      staged.push(temp);
      try { await handle.writeFile(output.content, {encoding:"utf8"}); }
      finally { await handle.close(); }
    }
    await beforeCommit?.();
    const current = inspectChapterOutputs(directory, outputs);
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("確認後に書き出し先のファイルが変更されました。もう一度書き出してください。");
    for (let index = 0; index < outputs.length; index++) {
      // Replace the output itself; do not write through a hard link to a source.
      await fsp.rename(staged[index], current[index].outPath);
      written.push(current[index].outPath);
      onProgress?.(index + 1, outputs.length, outputs[index].title);
    }
    return written;
  } catch (error) {
    if (written.length) error.message += `（${outputs.length}件中${written.length}件は作成済みです：${written.map(file => path.basename(file)).join("、")}）`;
    throw error;
  } finally {
    for (const temp of staged) { try { await fsp.unlink(temp); } catch {} }
  }
}

module.exports = { captureManuscriptSource, assertManuscriptSource, groupManuscriptFilesByChapter,
  buildChapterOutputNames, assertChapterExportDirectory, inspectChapterOutputs, writeChapterOutputs };
