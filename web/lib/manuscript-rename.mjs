import { normalizeManuscriptFolderName } from "./file-names.mjs";

export function manuscriptNameParts(item) {
  if (item?.folder) return { base: item.name, extension: "" };
  const match = /^(.*)(\.(?:txt|md))$/i.exec(String(item?.name || ""));
  if (!match) throw new Error("名前を変更できる原稿ファイルではありません。");
  return { base: match[1], extension: match[2] };
}

export function renamedManuscriptName(item, input) {
  const { extension } = manuscriptNameParts(item);
  const base = normalizeManuscriptFolderName(input);
  if (/[\x00-\x1f\x7f]/.test(base) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) {
    throw new Error("名前に使用できない文字または予約名が含まれています。");
  }
  return base + extension;
}

export async function renameManuscriptItem({ provider, item, parent, input, current = () => true }) {
  const name = renamedManuscriptName(item, input);
  if (name === item.name) return { item, changed: false };
  const check = () => { if (!current()) throw new Error("画面が切り替わったため、名前の変更を中止しました。"); };
  check();
  const [metadata, siblings] = await Promise.all([provider.getItemMetadata(item), provider.listChildren(parent.id)]);
  check();
  if (metadata.id !== item.id || metadata.name !== item.name || Boolean(metadata.folder) !== Boolean(item.folder)
    || !siblings.some((entry) => entry.id === item.id)) {
    throw new Error("名前または保存先が更新されています。一覧を読み直してください。");
  }
  if (siblings.some((entry) => entry.id !== item.id && entry.name.localeCompare(name, "ja", { sensitivity: "base" }) === 0)) {
    throw new Error("同じ名前のファイルまたはフォルダがすでにあります。");
  }
  const saved = await provider.renameItem(metadata, name);
  return { item: saved, changed: true };
}

// Change only stored references, preserving timestamps, pinning and other works.
export function renameManuscriptReferences(entries, before, saved, matches = () => true) {
  const update = (item) => item?.id === before.id ? { ...item, ...saved } : item;
  return entries.map((entry) => {
    if (!matches(entry)) return entry;
    if (entry.route && !["manuscript-file", "manuscript-list"].includes(entry.route.kind)) return entry;
    const reference = entry.route || entry;
    const next = { ...reference, item: update(reference.item), folder: update(reference.folder),
      trail: reference.trail?.map(update) };
    return entry.route ? { ...entry, route: next } : next;
  });
}

export function createManuscriptRenameController({ state, elements: e, setBusy, onRenamed, refresh, notify }) {
  let context = null, pending = false;
  const current = (owner) => owner && state.provider === owner.provider && state.selectedWork === owner.work
    && state.workRoot === owner.root && state.userSession === owner.session && !e.filesSection.hidden
    && state.manuscriptFolder?.id === owner.parent?.id;
  function open(item) {
    if (pending || state.saving || state.syncing || state.dirty || e.filesSection.hidden) return;
    const parts = manuscriptNameParts(item);
    context = { item, provider: state.provider, work: state.selectedWork, root: state.workRoot,
      session: state.userSession, parent: state.manuscriptFolder, trail: [...state.manuscriptTrail] };
    e.renameManuscriptTitle.textContent = item.folder ? "フォルダ名を変更" : "原稿名を変更";
    e.renameManuscriptInput.value = parts.base;
    e.renameManuscriptExtension.textContent = parts.extension;
    e.renameManuscriptHelp.textContent = item.folder ? "フォルダの名前を変更します。" : "拡張子はそのまま保持します。";
    e.renameManuscriptError.textContent = "";
    e.renameManuscriptDialog.showModal();
    e.renameManuscriptInput.focus();
    e.renameManuscriptInput.select();
  }
  e.renameManuscriptForm.addEventListener("submit", async (event) => {
    if (event.submitter && event.submitter.value !== "rename") return;
    event.preventDefault();
    if (pending) return;
    if (!current(context)) {
      e.renameManuscriptError.textContent = "画面が更新されました。閉じてから名前変更を開き直してください。";
      return;
    }
    if (state.saving || state.syncing || state.dirty) {
      e.renameManuscriptError.textContent = state.dirty
        ? "編集内容を保存してから名前を変更してください。"
        : "保存・同期が終わってから、もう一度変更してください。";
      return;
    }
    const owner = context;
    pending = true;
    state.saving = true;
    e.renameManuscriptError.textContent = "";
    e.renameManuscriptInput.disabled = true;
    e.cancelRenameManuscriptButton.disabled = true;
    setBusy(e.renameManuscriptButton, true, "変更中…");
    try {
      const result = await renameManuscriptItem({ ...owner, input: e.renameManuscriptInput.value, current: () => current(owner) });
      if (current(owner)) {
        if (result.changed) onRenamed(owner.item, result.item);
        e.renameManuscriptDialog.close();
        if (result.changed) {
          notify("名前を変更しました。");
          try { await refresh(owner.parent, owner.trail); }
          catch { notify("名前は変更しました。一覧を再読み込みしてください。", true); }
        }
      }
    } catch (error) {
      if (current(owner)) e.renameManuscriptError.textContent = error.message || "名前を変更できませんでした。";
    } finally {
      pending = false;
      state.saving = false;
      e.renameManuscriptInput.disabled = false;
      e.cancelRenameManuscriptButton.disabled = false;
      setBusy(e.renameManuscriptButton, false);
    }
  });
  e.renameManuscriptDialog.addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
  e.cancelRenameManuscriptButton.addEventListener("click", () => {
    if (!pending) e.renameManuscriptDialog.close();
  });
  // close is queued by the browser and may arrive after this dialog is reopened.
  e.renameManuscriptDialog.addEventListener("close", () => {
    if (!e.renameManuscriptDialog.open && !pending) context = null;
  });
  return { open };
}
