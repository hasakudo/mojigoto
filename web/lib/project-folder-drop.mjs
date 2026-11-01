const folderError = () => new Error("作品フォルダを1つドロップしてください。対応していない場合は「フォルダを選択」をお使いください。");
const fileDrag = (transfer) => Array.from(transfer?.types || []).includes("Files")
  || Array.from(transfer?.items || []).some((item) => item.kind === "file");

// Entries must be captured synchronously while the drop data store is readable.
export async function readDroppedProjectFolder(transfer, { current = () => true, onProgress = () => {} } = {}) {
  const items = Array.from(transfer?.items || []).filter((item) => item.kind === "file");
  if (items.length !== 1) throw folderError();
  const item = items[0], root = (item.getAsEntry || item.webkitGetAsEntry)?.call(item);
  if (!root?.isDirectory) throw folderError();
  const check = () => {
    if (!current()) { const error = new Error("フォルダの読み取りを中止しました。"); error.name = "AbortError"; throw error; }
  };
  const files = [], stack = [{ entry: root, path: root.name }];
  while (stack.length) {
    check();
    const { entry, path } = stack.pop();
    if (entry.isFile) {
      const source = await new Promise((resolve, reject) => entry.file(resolve, reject));
      check();
      // A real File preserves binary data for the existing multipart uploader.
      const file = new File([source], source.name, { type: source.type, lastModified: source.lastModified });
      Object.defineProperty(file, "webkitRelativePath", { value: path });
      files.push(file);
      if (files.length % 50 === 0) onProgress(files.length);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = [];
      while (true) {
        check();
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        check();
        if (!batch.length) break;
        children.push(...batch);
      }
      children.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!child.name || /[\/\\\x00-\x1f]/.test(child.name) || [".", ".."].includes(child.name)) throw folderError();
        stack.push({ entry: child, path: `${path}/${child.name}` });
      }
    } else throw folderError();
  }
  if (!files.length) throw new Error("ファイルが入った作品フォルダを選択してください。空フォルダは取り込めません。");
  return files;
}

export function bindProjectFolderDrop({ zone, document, canRead, onFiles, onError, onReading, onProgress }) {
  let generation = 0, depth = 0;
  const clearDrag = () => { depth = 0; zone.classList.remove("is-dragover"); };
  const cancel = () => { generation++; clearDrag(); zone.setAttribute("aria-busy", "false"); onReading(false); };
  const updateAvailability = () => { zone.setAttribute("aria-disabled", String(!canRead())); if (!canRead()) clearDrag(); };
  zone.addEventListener("dragenter", (event) => {
    if (!fileDrag(event.dataTransfer)) return;
    event.preventDefault(); depth++;
    zone.classList.toggle("is-dragover", canRead());
  });
  zone.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) clearDrag(); });
  zone.addEventListener("dragover", (event) => {
    if (!fileDrag(event.dataTransfer)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = canRead() ? "copy" : "none";
  });
  zone.addEventListener("drop", async (event) => {
    if (!fileDrag(event.dataTransfer)) return;
    event.preventDefault(); event.stopPropagation(); clearDrag();
    if (!canRead()) return;
    const token = ++generation;
    const current = () => token === generation && canRead();
    zone.setAttribute("aria-busy", "true"); onReading(true);
    try {
      const files = await readDroppedProjectFolder(event.dataTransfer, { current, onProgress });
      if (current()) onFiles(files);
    } catch (error) {
      if (current() && error.name !== "AbortError") onError(new Error(`フォルダを読み取れませんでした。${error.message || "選び直してください。"}`));
    } finally {
      if (token === generation) { zone.setAttribute("aria-busy", "false"); onReading(false); }
    }
  });
  for (const eventName of ["dragover", "drop"]) document.addEventListener(eventName, (event) => {
    if (!fileDrag(event.dataTransfer) || zone.contains(event.target)) return;
    event.preventDefault();
    if (eventName === "drop" && canRead()) onError(new Error("「PCの作品フォルダ」の枠内にフォルダをドロップしてください。"));
  });
  updateAvailability();
  return { cancel, updateAvailability };
}
