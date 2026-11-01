const fs = require("fs/promises");
const syncFs = require("fs");
const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { writeRawFile, storageRevision } = require("../data/structured-file-write");
const format = require("../../web/lib/generated-note-markdown");

const SETTINGS = "web-import-settings.json";
const queues = new Map();
const statuses = new Map();
const listeners = new Set();
const reported = new Map();
const key = (dir) => process.platform === "win32" ? path.resolve(dir).toLowerCase() : path.resolve(dir);
const hash = (text) => createHash("sha256").update(text).digest("hex");
function enqueue(dir, action) {
  const id = key(dir);
  const job = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(id, job);
  return job.finally(() => { if (queues.get(id) === job) queues.delete(id); });
}
function parseSettings(raw) {
  if (raw === null) return { enabled: false };
  const data = JSON.parse(raw);
  if (data.schemaVersion !== 1 || typeof data.enabled !== "boolean" || typeof data.workId !== "string" || !data.workId) {
    throw new Error("Web読込用Markdownの設定ファイルを確認してください。");
  }
  return data;
}
async function readRaw(file) {
  try { return await fs.readFile(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function settings(dir) { return parseSettings(await readRaw(path.join(dir, SETTINGS))); }
function getStatus(dir) {
  if (!dir) return { available: false, enabled: false, error: "作品をViewに連携してください。" };
  let config = { enabled: false }, error = "";
  try { config = parseSettings(syncFs.existsSync(path.join(dir, SETTINGS)) ? syncFs.readFileSync(path.join(dir, SETTINGS), "utf8") : null); }
  catch (e) { error = e.message; }
  return { available: true, enabled: config.enabled, workKey: hash(key(dir)), ...(statuses.get(key(dir)) || {}), ...(error ? { error } : {}) };
}
function publish(dir, status) {
  statuses.set(key(dir), { ...(statuses.get(key(dir)) || {}), ...status });
  for (const listener of listeners) { try { listener(dir, getStatus(dir)); } catch {} }
}
function fail(dir, file, error, notifyUsers = true) {
  const message = `Web読込用Markdownの更新が未完了です（ノートの保存とは別の処理です）：${path.basename(file || "")} ${error.message || error}`;
  const id = `${key(dir)}:${file}`;
  const notify = reported.get(id) !== message;
  reported.set(id, message);
  publish(dir, { error: errorsFor(dir) });
  if (notify && notifyUsers) {
    try { require("../views/note-webview").notifyWebMarkdownWarning?.(file, message); } catch {}
    try { require("vscode").window.showWarningMessage(message + " Dashboardの保存設定から再試行できます。"); } catch {}
  }
  return { ok: false, error: message };
}
function errorsFor(dir) { return [...reported].filter(([id]) => id.startsWith(`${key(dir)}:`)).map(([, error]) => error).join("\n"); }
async function rejectLinks(file, base) {
  let current = file;
  while (key(current) !== key(base)) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("生成先にリンクがあります。通常のフォルダへ戻してから再試行してください。"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("生成先が作品内にありません。");
    current = parent;
  }
}
function noteLocation(file) {
  const folder = path.dirname(path.resolve(file));
  const type = path.basename(folder).toLowerCase() === "plots" ? "plot" : path.basename(folder).toLowerCase() === "references" ? "reference" : "";
  const dir = path.dirname(folder);
  if (!type || path.basename(dir).toLowerCase() !== ".mojigoto" || path.extname(file).toLowerCase() !== ".json") return null;
  return { dir, type, folder };
}
async function uniqueNote(dir, type, file, noteId) {
  if (!noteId) throw new Error("IDのない旧ノートです。ノートを一度保存してから再試行してください。");
  const folder = path.join(dir, type === "plot" ? "plots" : "references");
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
    const candidate = path.join(folder, entry.name);
    if (key(candidate) === key(file)) continue;
    const other = JSON.parse(await fs.readFile(candidate, "utf8"));
    if (String(other.id || "") === noteId) throw new Error("同じIDのノートが複数あります。コピー元とコピー先を確認してください。原本のIDは変更していません。");
  }
}
function outputFileName(noteId, title, type) {
  const label = Array.from(String(title || "無題ノート").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "")).slice(0, 48).join("") || "無題ノート";
  return `${type === "reference" ? "資料" : "プロット"}_${label}--${hash(`${type}:${noteId}`).slice(0, 8)}.md`;
}
async function previousOutputs(dir, output, config, noteId, type) {
  const root = path.join(dir, "web-import");
  await rejectLinks(output, dir);
  let names = [];
  try { names = await fs.readdir(root); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const suffix = `--${hash(`${type}:${noteId}`).slice(0, 8)}.md`;
  const legacy = path.join(root, type === "plot" ? "plots" : "references", `${hash(noteId).slice(0, 32)}.md`);
  const paths = new Set([output, legacy, ...names.filter((name) => name.endsWith(suffix)).map((name) => path.join(root, name))]);
  const found = [];
  for (const file of paths) {
    await rejectLinks(file, dir);
    const raw = await readRaw(file);
    if (raw === null) continue;
    let decoded;
    try { decoded = format.decode(raw); } catch {}
    if (!decoded || decoded.metadata.workId !== config.workId || decoded.metadata.noteId !== noteId || decoded.metadata.type !== type
        || hash(decoded.body) !== decoded.metadata.bodyHash || hash(format.canonical(decoded.metadata, decoded.body)) !== decoded.metadata.exportHash) {
      throw new Error(`「${path.basename(file)}」は手動編集済み、または別のファイルです。退避・移動してから再試行してください。`);
    }
    found.push({ file, raw, decoded });
  }
  return found;
}
async function generate(dir, file, config) {
  const location = noteLocation(file);
  if (!location || key(location.dir) !== key(dir)) throw new Error("ノートの保存先を確認してください。");
  const raw = await fs.readFile(file, "utf8");
  const note = JSON.parse(raw);
  const addressBookPath = path.join(dir, "address-book.json");
  await rejectLinks(addressBookPath, dir);
  const addressBookRaw = await readRaw(addressBookPath);
  const workBook = addressBookRaw === null ? format.importedAddressBook(note.importedAddressBook)?.book : JSON.parse(addressBookRaw);
  if (!Array.isArray(note.groups) || !note.groups.length) throw new Error("旧形式、または構造のないノートです。ノートを一度保存してから再試行してください。");
  const noteId = typeof note.id === "string" ? note.id.trim() : "";
  const sourceIds = note.groups.map((group) => ({ id: group.id, items: (group.items || []).map((item) => ({ id: item.id, kind: item.kind === "divider" ? "divider" : "entry" })) }));
  format.validateSourceIds(sourceIds);
  await uniqueNote(dir, location.type, file, noteId);
  const output = path.join(dir, "web-import", outputFileName(noteId, note.title, location.type));
  const previous = await previousOutputs(dir, output, config, noteId, location.type);
  const current = previous.find((entry) => key(entry.file) === key(output));
  const attachments = format.formatAttachments(note, workBook);
  const attachmentsHash = hash(JSON.stringify(attachments));
  const unchanged = current?.decoded.metadata.version === format.CURRENT_VERSION && current.decoded.metadata.sourceHash === hash(raw)
    && current.decoded.metadata.attachmentsHash === attachmentsHash
    && current.decoded.metadata.sourceFileName === path.basename(file);
  const body = format.formatBody(note);
  const metadata = { format: "mojigoto-web-note", version: format.CURRENT_VERSION, escapedHeadings: true, sourceIds,
    details: format.formatDetails(note, config.workId), attachments, attachmentsHash, workId: config.workId, noteId,
    type: location.type, title: String(note.title || ""), sourceFileName: path.basename(file), sourceHash: hash(raw),
    generatedAt: new Date().toISOString(), bodyHash: hash(body) };
  metadata.exportHash = hash(format.canonical(metadata, body));
  format.validateDetails(metadata);
  format.validateAttachments(metadata);
  const generated = format.encode(metadata, body);
  if (Buffer.byteLength(generated, "utf8") > 10 * 1024 * 1024) throw new Error("Web読込用Markdownが10MBを超えます。ノートを分けてから再試行してください。");
  // Use the existing conflict-aware atomic writer. Drive fileId preservation
  // after desktop replacement must be checked on a real streaming drive.
  if (!(await settings(dir)).enabled) return { skipped: true };
  if (await readRaw(file) !== raw) throw new Error("生成中にノートが更新されました。次の保存か今すぐ更新で再試行してください。");
  if (await readRaw(addressBookPath) !== addressBookRaw) throw new Error("生成中に呼び名一覧が更新されました。今すぐ更新で再試行してください。");
  if (!unchanged) await writeRawFile(output, generated, storageRevision(current?.raw ?? null));
  // Remove only verified generated files, after the readable replacement exists.
  for (const entry of previous.filter((entry) => key(entry.file) !== key(output))) {
    await rejectLinks(entry.file, dir);
    if (await readRaw(entry.file) !== entry.raw) throw new Error("移行中に古いMarkdownが変更されました。両方のファイルを残しています。確認してから再試行してください。");
    await fs.unlink(entry.file);
  }
  for (const folder of ["plots", "references"]) {
    const legacyFolder = path.join(dir, "web-import", folder);
    await rejectLinks(legacyFolder, dir);
    try { await fs.rmdir(legacyFolder); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
  }
  return { output, changed: !unchanged };
}
async function generateAll(dir) {
  const config = await settings(dir);
  if (!config.enabled) return { ok: true, skipped: true };
  let count = 0;
  const errors = [];
  const active = new Set();
  for (const name of ["plots", "references"]) {
    let entries;
    try { entries = await fs.readdir(path.join(dir, name), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
      const file = path.join(dir, name, entry.name);
      active.add(key(file));
      try { await generate(dir, file, config); count++; reported.delete(`${key(dir)}:${file}`); }
      catch (error) { errors.push(fail(dir, file, error, false).error); }
    }
  }
  const prefix = `${key(dir)}:`;
  for (const id of reported.keys()) {
    if (id.startsWith(prefix) && id !== prefix && !active.has(key(id.slice(prefix.length)))) reported.delete(id);
  }
  reported.delete(`${key(dir)}:`);
  const status = { count, updatedAt: new Date().toISOString(), error: errors.join("\n") };
  publish(dir, { ...status, error: errorsFor(dir) });
  return { ok: !errors.length, ...status };
}
function setEnabled(dir, enabled) {
  if (!dir || typeof enabled !== "boolean") return Promise.reject(new Error("作品とON／OFFを確認してください。"));
  return enqueue(dir, async () => {
    const file = path.join(dir, SETTINGS), raw = await readRaw(file);
    await rejectLinks(file, dir);
    const previous = parseSettings(raw);
    await writeRawFile(file, JSON.stringify({ schemaVersion: 1, workId: previous.workId || randomUUID(), enabled }, null, 2), storageRevision(raw));
    for (const id of reported.keys()) if (id.startsWith(`${key(dir)}:`)) reported.delete(id);
    publish(dir, { error: "" });
    if (!enabled) return { ok: true };
    try { return await generateAll(dir); }
    catch (error) { return fail(dir, "", error, false); }
  });
}
function regenerate(dir) {
  return enqueue(dir, async () => {
    try { return await generateAll(dir); }
    catch (error) { return fail(dir, "", error, false); }
  });
}
async function afterNoteSaved(file) {
  const location = noteLocation(file);
  if (!location) return;
  return enqueue(location.dir, async () => {
    try {
      const config = await settings(location.dir);
      if (!config.enabled) return;
      const result = await generate(location.dir, file, config);
      reported.delete(`${key(location.dir)}:${file}`);
      publish(location.dir, { updatedAt: new Date().toISOString(), error: errorsFor(location.dir) });
      return result;
    } catch (error) { return fail(location.dir, file, error); }
  });
}
function onDidChange(listener) { listeners.add(listener); return { dispose() { listeners.delete(listener); } }; }
module.exports = { getStatus, setEnabled, regenerate, afterNoteSaved, onDidChange, noteLocation, outputFileName };
