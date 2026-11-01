const vscode = require("vscode");
const fs = require("fs/promises");
const path = require("path");

const { listWorkDirectories } = require("../core/mojigoto-paths");
const { makeId } = require("../core/path-utils");
const {
  listNotesWithMeta,
  readNoteFile,
} = require("../data/note-store");
const {
  readSettingsFile,
  writeSettingsFile,
} = require("../data/settings-store");
const { linkWorksBidirectionally } = require("./related-works");

const SETTINGS_FIELDS = [
  { key: "title", label: "作品タイトル", description: "新しい作品名もコピーします", picked: false },
  { key: "subtitle", label: "補助タイトル", description: "サブタイトルやシリーズ共通タイトルをコピーします", picked: false },
  { key: "penName", label: "ペンネーム", description: "作者名をコピーします", picked: true },
  { key: "genres", label: "ジャンル", description: "ジャンル設定をコピーします", picked: true },
  { key: "status", label: "作品の状態", description: "構想中・執筆中などをコピーします", picked: false },
  { key: "targetChars", label: "目標文字数", description: "目標文字数をコピーします", picked: false },
  { key: "deadline", label: "締切日", description: "締切日をコピーします", picked: false },
  { key: "summary", label: "あらすじ", description: "あらすじをコピーします", picked: true },
  { key: "memo", label: "メモ", description: "作品設定のメモをコピーします", picked: true },
  { key: "exportOptions", label: "書き出し設定", description: "作品設定の書き出し項目をコピーします", picked: true },
];

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.normalize(path.resolve(String(value || "")));
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeFileStem(value, fallback = "note") {
  return (
    String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .slice(0, 80) || fallback
  );
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function makeUniqueNoteTarget(directory, preferredName, reserved) {
  const extension = ".json";
  const originalStem = safeFileStem(
    path.basename(String(preferredName || ""), path.extname(String(preferredName || ""))),
  );
  let index = 1;

  while (true) {
    const stem = index === 1 ? originalStem : `${originalStem}-${index}`;
    const fileName = `${stem}${extension}`;
    const key = fileName.toLowerCase();
    const filePath = path.join(directory, fileName);
    if (!reserved.has(key) && !(await pathExists(filePath))) {
      reserved.add(key);
      return { fileName, filePath, stem };
    }
    index += 1;
  }
}

function collectIdMaps(note, type, target) {
  const groups = new Map();
  const items = new Map();
  const sourceIds = new Map();

  for (const group of Array.isArray(note?.groups) ? note.groups : []) {
    const oldGroupId = String(group?.id || "");
    const newGroupId = makeId("grp");
    groups.set(oldGroupId, newGroupId);
    sourceIds.set(`group:${oldGroupId}`, newGroupId);

    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const oldItemId = String(item?.id || "");
      const prefix = item?.kind === "divider" ? "div" : "item";
      const newItemId = makeId(prefix);
      items.set(`${oldGroupId}:${oldItemId}`, newItemId);
      sourceIds.set(`${prefix === "div" ? "divider" : "item"}:${oldItemId}`, newItemId);
    }
  }

  return {
    type,
    oldNoteId: String(note?.id || ""),
    newNoteId: makeId(type),
    fileName: target.fileName,
    filePath: target.filePath,
    stem: target.stem,
    title: String(note?.title || ""),
    groups,
    items,
    sourceIds,
  };
}

function cloneAddressBookForCopiedNote(value, mapping) {
  const characters = [];
  const personIds = new Map();
  for (const character of Array.isArray(value?.characters) ? value.characters : []) {
    const sourceKind = ["group", "divider", "item"].includes(character?.sourceKind)
      ? character.sourceKind
      : "item";
    const sourceId = mapping.sourceIds.get(`${sourceKind}:${String(character?.sourceId || "")}`);
    if (!sourceId) continue;
    const newPersonId = makeId("person");
    personIds.set(String(character?.id || ""), newPersonId);
    characters.push({
      id: newPersonId,
      sourceKind,
      sourceId,
      label: String(character?.label || ""),
    });
  }
  const firstPerson = {};
  for (const [oldId, text] of Object.entries(value?.firstPerson || {})) {
    const newId = personIds.get(oldId);
    if (newId && String(text || "").trim()) firstPerson[newId] = String(text).trim();
  }
  const calls = {};
  for (const [oldKey, text] of Object.entries(value?.calls || {})) {
    const [oldFrom, oldTo] = oldKey.split("::");
    const from = personIds.get(oldFrom);
    const to = personIds.get(oldTo);
    if (from && to && String(text || "").trim()) calls[`${from}::${to}`] = String(text).trim();
  }
  return { characters, firstPerson, calls };
}

function resolveMappedLink(link, noteMaps) {
  const type = String(link?.noteType || "reference") === "plot" ? "plot" : "reference";
  const target = noteMaps.get(`${type}:${String(link?.noteId || "")}`);
  if (!target) return null;

  const oldGroupId = String(link?.groupId || "");
  const oldItemId = String(link?.itemId || "");
  const groupId = target.groups.get(oldGroupId);
  const itemId = target.items.get(`${oldGroupId}:${oldItemId}`);
  if (!groupId || !itemId) return null;

  return {
    noteType: target.type,
    noteId: target.newNoteId,
    noteFileName: target.fileName,
    noteTitle: target.title,
    groupId,
    groupTitle: String(link?.groupTitle || ""),
    itemId,
    itemKind: String(link?.itemKind || "entry") === "divider" ? "divider" : "entry",
    itemLabel: String(link?.itemLabel || ""),
  };
}

async function cloneImages({ images, sourceRoot, destinationRoot, destinationStem, newGroupId, warnings }) {
  const cloned = [];

  for (const image of Array.isArray(images) ? images : []) {
    const relativePath = String(image?.relativePath || "").trim();
    if (!relativePath) continue;

    const sourcePath = path.resolve(sourceRoot, relativePath);
    if (!isPathInside(sourceRoot, sourcePath) || !(await pathExists(sourcePath))) {
      warnings.push(`画像「${String(image?.name || image?.fileName || relativePath)}」をコピーできませんでした。`);
      continue;
    }

    const extension = path.extname(String(image?.fileName || sourcePath)) || path.extname(sourcePath);
    const imageId = makeId("img");
    const fileName = `${imageId}${extension.toLowerCase()}`;
    const destinationRelative = path
      .join("note-images", destinationStem, newGroupId, fileName)
      .replace(/\\/g, "/");
    const destinationPath = path.resolve(destinationRoot, destinationRelative);
    if (!isPathInside(destinationRoot, destinationPath)) {
      throw new Error("画像のコピー先が作品フォルダ外になりました。");
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    cloned.push({
      id: imageId,
      name: String(image?.name || image?.fileName || "画像"),
      fileName,
      relativePath: destinationRelative,
      createdAt: new Date().toISOString(),
    });
  }

  return cloned;
}

async function copyWorkData({ sourceWork, destinationWork, settingFields = [], notes = [] }) {
  if (!sourceWork?.fsPath || !destinationWork?.fsPath) {
    throw new Error("コピー元またはコピー先の作品を取得できませんでした。");
  }
  if (samePath(sourceWork.fsPath, destinationWork.fsPath)) {
    throw new Error("同じ作品へコピーすることはできません。");
  }

  const sourceMojigoto = path.join(sourceWork.fsPath, ".mojigoto");
  const destinationMojigoto = path.join(destinationWork.fsPath, ".mojigoto");
  await fs.mkdir(destinationMojigoto, { recursive: true });

  const selectedNotes = [];
  for (const entry of notes) {
    const type = entry?.type === "reference" ? "reference" : "plot";
    const note = await readNoteFile(entry.fsPath, type);
    selectedNotes.push({ ...entry, type, note });
  }

  const reservedByType = { plot: new Set(), reference: new Set() };
  const noteMaps = new Map();
  for (const entry of selectedNotes) {
    const directory = path.join(destinationMojigoto, entry.type === "plot" ? "plots" : "references");
    await fs.mkdir(directory, { recursive: true });
    const target = await makeUniqueNoteTarget(directory, entry.name || `${entry.note.title}.json`, reservedByType[entry.type]);
    const mapping = collectIdMaps(entry.note, entry.type, target);
    noteMaps.set(`${entry.type}:${String(entry.note.id || "")}`, mapping);
    entry.mapping = mapping;
  }

  const warnings = [];
  const createdNotePaths = [];
  const createdImageRoots = [];
  let copiedSettings = false;
  const destinationSettingsPath = path.join(destinationMojigoto, "work.json");
  const settingsExisted = await pathExists(destinationSettingsPath);
  const settingsSnapshot = settingsExisted
    ? await fs.readFile(destinationSettingsPath)
    : null;

  try {
    if (settingFields.length) {
      const sourcePath = path.join(sourceMojigoto, "work.json");
      const destinationPath = destinationSettingsPath;
      const sourceSettings = await readSettingsFile(sourcePath, sourceWork);
      const destinationSettings = await readSettingsFile(destinationPath, destinationWork);
      const nextSettings = { ...destinationSettings };

      for (const field of settingFields) {
        if (field === "genres") {
          nextSettings.genres = Array.isArray(sourceSettings.genres) ? [...sourceSettings.genres] : [];
          nextSettings.genre = String(sourceSettings.genre || "");
        } else if (field === "exportOptions") {
          nextSettings.exportOptions = { ...(sourceSettings.exportOptions || {}) };
        } else if (SETTINGS_FIELDS.some((item) => item.key === field)) {
          nextSettings[field] = sourceSettings[field];
        }
      }

      nextSettings.folderName = path.basename(destinationWork.fsPath);
      copiedSettings = true;
      await writeSettingsFile(destinationPath, nextSettings);
    }

    const existingByType = { plot: 0, reference: 0 };
    for (const type of ["plot", "reference"]) {
      const existing = await listNotesWithMeta(type, destinationWork);
      existingByType[type] = existing.length;
    }

    const typeOffsets = { plot: 0, reference: 0 };
    for (const entry of selectedNotes) {
      const { note, mapping, type } = entry;
      const groups = [];

      for (const group of Array.isArray(note.groups) ? note.groups : []) {
        const oldGroupId = String(group?.id || "");
        const newGroupId = mapping.groups.get(oldGroupId);
        const items = (Array.isArray(group?.items) ? group.items : []).map((item) => {
          const oldItemId = String(item?.id || "");
          const relatedReferences = (Array.isArray(item?.relatedReferences) ? item.relatedReferences : [])
            .map((link) => resolveMappedLink(link, noteMaps))
            .filter(Boolean);
          const cloned = {
            ...item,
            id: mapping.items.get(`${oldGroupId}:${oldItemId}`),
            relatedReferences,
          };
          if (cloned.kind !== "divider") {
            cloned.memo = {
              ...(cloned.memo || {}),
              linkedConceptMemoIds: [],
              autoSyncToConceptMemo: false,
              autoSyncToConceptMemoOverride: false,
              conceptMemoSyncedAt: "",
              conceptMemoSyncFingerprint: "",
            };
          }
          return cloned;
        });

        createdImageRoots.push(path.join(destinationMojigoto, "note-images", mapping.stem, newGroupId));
        const images = await cloneImages({
          images: group?.images,
          sourceRoot: sourceMojigoto,
          destinationRoot: destinationMojigoto,
          destinationStem: mapping.stem,
          newGroupId,
          warnings,
        });
        groups.push({ ...group, id: newGroupId, items, images });
      }

      const payload = {
        schemaVersion: 4,
        id: mapping.newNoteId,
        type,
        title: String(note.title || ""),
        order: existingByType[type] + typeOffsets[type],
        groups,
        addressBook: cloneAddressBookForCopiedNote(note.addressBook, mapping),
        updatedAt: new Date().toISOString(),
      };
      typeOffsets[type] += 1;
      await fs.writeFile(mapping.filePath, JSON.stringify(payload, null, 2), "utf8");
      createdNotePaths.push(mapping.filePath);
    }

    await linkWorksBidirectionally(sourceWork, destinationWork);
  } catch (error) {
    await Promise.all(createdNotePaths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    await Promise.all(createdImageRoots.map((dirPath) => fs.rm(dirPath, { recursive: true, force: true }).catch(() => {})));
    if (copiedSettings) {
      if (settingsExisted) {
        await fs.writeFile(destinationSettingsPath, settingsSnapshot).catch(() => {});
      } else {
        await fs.unlink(destinationSettingsPath).catch(() => {});
      }
    }
    throw error;
  }

  for (const file of createdNotePaths) void require("../export/web-note-markdown").afterNoteSaved(file);
  return {
    copiedSettings,
    copiedPlots: selectedNotes.filter((entry) => entry.type === "plot").length,
    copiedReferences: selectedNotes.filter((entry) => entry.type === "reference").length,
    warnings,
  };
}

async function chooseNotes(type, sourceWork) {
  const label = type === "plot" ? "プロット" : "資料";
  const notes = await listNotesWithMeta(type, sourceWork);
  if (!notes.length) {
    vscode.window.showInformationMessage(`もじごと: コピー元に${label}ノートがありません。`);
    return [];
  }

  const method = await vscode.window.showQuickPick(
    [
      { label: `すべての${label}ノート`, value: "all", description: `${notes.length}件をコピー` },
      { label: `${label}ノートを選択`, value: "select", description: "必要なノートだけコピー" },
    ],
    { title: `もじごと: ${label}のコピー方法`, ignoreFocusOut: true },
  );
  if (!method) return null;
  if (method.value === "all") return notes;

  const picked = await vscode.window.showQuickPick(
    notes.map((note) => ({
      label: note.title,
      description: note.name,
      note,
    })),
    {
      title: `もじごと: コピーする${label}ノートを選択`,
      canPickMany: true,
      ignoreFocusOut: true,
      placeHolder: "複数選択できます",
    },
  );
  return picked ? picked.map((item) => item.note) : null;
}

async function runWorkCopyFlow(destinationItem, treeProvider) {
  const works = listWorkDirectories();
  let destinationWork = destinationItem?.fsPath
    ? works.find((work) => samePath(work.fsPath, destinationItem.fsPath)) || {
        name: destinationItem.workName || path.basename(destinationItem.fsPath),
        title: destinationItem.label || destinationItem.workName || path.basename(destinationItem.fsPath),
        fsPath: destinationItem.fsPath,
      }
    : null;

  if (!destinationWork) {
    const pickedDestination = await vscode.window.showQuickPick(
      works.map((work) => ({ label: work.title, description: work.name, work })),
      { title: "もじごと: コピー先の作品を選択", ignoreFocusOut: true },
    );
    if (!pickedDestination) return null;
    destinationWork = pickedDestination.work;
  }

  const sourceCandidates = works.filter((work) => !samePath(work.fsPath, destinationWork.fsPath));
  if (!sourceCandidates.length) {
    vscode.window.showWarningMessage("もじごと: コピー元にできる別の作品がありません。");
    return null;
  }

  const pickedSource = await vscode.window.showQuickPick(
    sourceCandidates.map((work) => ({ label: work.title, description: work.name, work })),
    {
      title: `もじごと: 「${destinationWork.title}」へコピーする元作品`,
      ignoreFocusOut: true,
    },
  );
  if (!pickedSource) return null;

  const categories = await vscode.window.showQuickPick(
    [
      { label: "作品設定", description: "項目を選んでコピー", value: "settings", picked: true },
      { label: "プロット", description: "すべて、またはノートを選んでコピー", value: "plot", picked: true },
      { label: "資料", description: "すべて、またはノートを選んでコピー", value: "reference", picked: true },
    ],
    {
      title: "もじごと: コピーするデータ",
      canPickMany: true,
      ignoreFocusOut: true,
    },
  );
  if (!categories) return null;
  if (!categories.length) {
    vscode.window.showInformationMessage("もじごと: コピーするデータが選択されていません。");
    return null;
  }

  let settingFields = [];
  if (categories.some((item) => item.value === "settings")) {
    const pickedFields = await vscode.window.showQuickPick(SETTINGS_FIELDS, {
      title: "もじごと: コピーする作品設定",
      canPickMany: true,
      ignoreFocusOut: true,
      placeHolder: "作品フォルダ名と内部情報はコピーされません",
    });
    if (!pickedFields) return null;
    settingFields = pickedFields.map((item) => item.key);
  }

  const notes = [];
  for (const type of ["plot", "reference"]) {
    if (!categories.some((item) => item.value === type)) continue;
    const selected = await chooseNotes(type, pickedSource.work);
    if (selected === null) return null;
    notes.push(...selected);
  }

  if (!settingFields.length && !notes.length) {
    vscode.window.showInformationMessage("もじごと: コピーする項目がありません。");
    return null;
  }

  const plotCount = notes.filter((note) => note.type === "plot").length;
  const referenceCount = notes.filter((note) => note.type === "reference").length;
  const detail = [
    settingFields.length ? `作品設定 ${settingFields.length}項目` : "",
    plotCount ? `プロット ${plotCount}件` : "",
    referenceCount ? `資料 ${referenceCount}件` : "",
  ].filter(Boolean).join(" / ");
  const confirmed = await vscode.window.showWarningMessage(
    `「${pickedSource.work.title}」から「${destinationWork.title}」へコピーします。\n${detail}\n既存データは上書きせず、ノートは追加されます。`,
    { modal: true },
    "コピーする",
  );
  if (confirmed !== "コピーする") return null;

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "もじごと: 他作品からコピー中...", cancellable: false },
    () => copyWorkData({ sourceWork: pickedSource.work, destinationWork, settingFields, notes }),
  );

  treeProvider?.refresh?.();
  const summary = [
    result.copiedSettings ? "作品設定" : "",
    result.copiedPlots ? `プロット ${result.copiedPlots}件` : "",
    result.copiedReferences ? `資料 ${result.copiedReferences}件` : "",
  ].filter(Boolean).join("、");
  const warningText = result.warnings.length ? `（画像 ${result.warnings.length}件を除外）` : "";
  vscode.window.showInformationMessage(`もじごと: ${summary}をコピーしました。${warningText}`);
  return result;
}

function registerWorkCopyCommand(context, treeProvider) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojigoto.copyFromOtherWork", async (item) => {
      if (String(vscode.workspace.getConfiguration("mojigoto").get("mode", "single")) === "single") {
        vscode.window.showWarningMessage("もじごと: 他作品からのコピーはMultiモードで使用できます。");
        return;
      }
      try {
        await runWorkCopyFlow(item, treeProvider);
      } catch (error) {
        vscode.window.showErrorMessage(`もじごと: 他作品からコピーできませんでした: ${error.message || String(error)}`);
      }
    }),
  );
}

module.exports = {
  SETTINGS_FIELDS,
  copyWorkData,
  runWorkCopyFlow,
  registerWorkCopyCommand,
  resolveMappedLink,
};
