const fs = require("fs/promises");
const path = require("path");
const { storageRevision, writeRawFile } = require("../data/structured-file-write");

const queues = new Map();

function enqueueBackupOperation(indexPath, task) {
  const absolute = path.resolve(indexPath);
  const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  const next = (queues.get(key) || Promise.resolve()).catch(() => undefined).then(task);
  const cleanup = () => { if (queues.get(key) === tracked) queues.delete(key); };
  const tracked = next.then(cleanup, cleanup);
  queues.set(key, tracked);
  return next;
}

async function writeJsonAtomic(filePath, value, expectedRevision) {
  let before = null;
  try { before = await fs.readFile(filePath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return writeRawFile(filePath, `${JSON.stringify(value, null, 2)}\n`, expectedRevision || storageRevision(before));
}

module.exports = { enqueueBackupOperation, writeJsonAtomic };
