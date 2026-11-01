const fs = require("fs/promises");
const path = require("path");
const { createHash, randomUUID } = require("crypto");

const writes = new Map();
function storageRevision(raw) {
  return raw === null ? "missing" : createHash("sha256").update(raw).digest("hex");
}
async function readRaw(filePath) {
  try { return await fs.readFile(filePath, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function conflict() {
  const error = new Error("ファイルが読み込み後に更新されました。未保存内容を退避してから最新の内容を読み直してください。");
  error.code = "conflict";
  return error;
}

async function writeStructuredFile(filePath, data, expectedRevision) {
  const { storageRevision: ignoredRevision, ...storedData } = data;
  const content = JSON.stringify(storedData, null, 2);
  const revision = await writeRawFile(filePath, content, expectedRevision);
  return { ...data, storageRevision: revision };
}

async function writeRawFile(filePath, content, expectedRevision) {
  const absolute = path.resolve(filePath);
  const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  const job = (writes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const before = await readRaw(absolute);
    // Existing documents always need the version that the caller read.
    if (before !== null && !expectedRevision) throw conflict();
    if (expectedRevision && storageRevision(before) !== expectedRevision) throw conflict();
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.new-${randomUUID()}`;
    const handle = await fs.open(temporary, "wx");
    try {
      try { await handle.writeFile(content, { encoding: "utf8" }); }
      finally { await handle.close(); }
      if (storageRevision(await readRaw(absolute)) !== storageRevision(before)) throw conflict();
      await fs.rename(temporary, absolute);
    } finally {
      await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") console.warn("[mojigoto] temporary file cleanup failed", error); });
    }
    return storageRevision(content);
  });
  writes.set(key, job);
  try { return await job; }
  finally { if (writes.get(key) === job) writes.delete(key); }
}

module.exports = { storageRevision, writeStructuredFile, writeRawFile };
