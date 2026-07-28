const vscode = require("vscode");
const fs = require("fs/promises");
const { isSingleMode } = require("../core/mojigoto-context");
const {
  getMojigotoDirForSingle,
  getMojigotoDirForWork,
  getSettingsPathForSingle,
  getSettingsPathForWork,
  listWorkDirectories,
} = require("../core/mojigoto-paths");

async function ensureDir(dirPath) {
  if (!dirPath) return;
  await fs.mkdir(dirPath, { recursive: true });
}

const WORK_STATUS_OPTIONS = [
  { value: "", label: "未設定" },
  { value: "planning", label: "構想中" },
  { value: "draft", label: "執筆中" },
  { value: "revision", label: "改稿中" },
  { value: "hold", label: "保留" },
  { value: "complete", label: "完結" },
];

function normalizeWorkStatus(value) {
  const v = String(value || "").trim();
  return WORK_STATUS_OPTIONS.some((item) => item.value === v) ? v : "";
}

function getWorkStatusLabel(value) {
  const normalized = normalizeWorkStatus(value);
  return (
    WORK_STATUS_OPTIONS.find((item) => item.value === normalized)?.label ||
    "未設定"
  );
}

const DEFAULT_GENRE_OPTIONS = [
  "ファンタジー",
  "恋愛",
  "現代ドラマ",
  "青春",
  "ミステリー",
  "ホラー",
  "SF",
  "歴史",
  "異世界",
  "ライト文芸",
  "児童文学",
  "その他",
];

const HIDDEN_GENRE_OPTIONS_KEY = "mojigoto.hiddenGenreOptions";

function normalizeGenreText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeGenres(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\n、，/／]+/);

  const seen = new Set();
  const result = [];

  for (const item of source) {
    const genre = normalizeGenreText(item);
    if (!genre) continue;

    const key = genre.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(genre);
  }

  return result;
}

function getGenreTextFromGenres(genres) {
  return normalizeGenres(genres).join(", ");
}

function getGenresFromSettingsData(data) {
  const explicit = normalizeGenres(data?.genres);
  if (explicit.length) return explicit;

  return normalizeGenres(data?.genre);
}

function getGenreDisplayText(data) {
  return getGenreTextFromGenres(getGenresFromSettingsData(data));
}

function getHiddenGenreOptions(context) {
  const values = context?.workspaceState?.get(HIDDEN_GENRE_OPTIONS_KEY, []);
  return normalizeGenres(values);
}

function isDefaultGenreOption(value) {
  const key = normalizeGenreText(value).toLowerCase();
  return DEFAULT_GENRE_OPTIONS.some(
    (option) => normalizeGenreText(option).toLowerCase() === key,
  );
}

async function hideCustomGenreOptions(context, values) {
  const requested = normalizeGenres(values).filter(
    (value) => !isDefaultGenreOption(value),
  );
  if (typeof context?.workspaceState?.update !== "function") {
    return { hidden: [], deleted: requested };
  }

  const linkedKeys = new Set(
    (await collectLinkedGenreOptions()).map((value) => value.toLowerCase()),
  );
  const additions = requested.filter((value) =>
    linkedKeys.has(value.toLowerCase()),
  );
  const deleted = requested.filter(
    (value) => !linkedKeys.has(value.toLowerCase()),
  );
  const retainedHidden = getHiddenGenreOptions(context).filter(
    (value) => linkedKeys.has(value.toLowerCase()),
  );
  const next = normalizeGenres([...retainedHidden, ...additions]);
  await context.workspaceState.update(HIDDEN_GENRE_OPTIONS_KEY, next);
  return { hidden: additions, deleted };
}

async function restoreGenreOptions(context, values) {
  if (typeof context?.workspaceState?.update !== "function") return;

  const restoreKeys = new Set(
    normalizeGenres(values).map((value) => value.toLowerCase()),
  );
  const next = getHiddenGenreOptions(context).filter(
    (value) => !restoreKeys.has(value.toLowerCase()),
  );
  await context.workspaceState.update(HIDDEN_GENRE_OPTIONS_KEY, next);
}

function createDefaultSettings(item) {
  return {
    schemaVersion: 1,
    folderName: item?.workName || "",
    title: item?.workName || "",
    genre: "",
    genres: [],
    status: "",
    targetChars: 0,
    deadline: "",
    summary: "",
    memo: "",
    updatedAt: "",
    exportOptions: {
      includeFolderName: false,
      includeGenre: true,
      includeTargetChars: true,
      includeDeadline: true,
      includeMemo: false,
      includeUpdatedAt: false,
    },
  };
}

async function readSettingsFile(targetPath, item) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    const merged = {
      ...createDefaultSettings(item),
      ...parsed,
    };

    const genres = getGenresFromSettingsData(merged);

    return {
      ...merged,
      genres,
      genre: getGenreTextFromGenres(genres),
    };
  } catch {
    return createDefaultSettings(item);
  }
}

async function writeSettingsFile(targetPath, data) {
  const genres = normalizeGenres(
    Array.isArray(data.genres) && data.genres.length ? data.genres : data.genre,
  );
  const payload = {
    schemaVersion: 1,
    folderName: String(data.folderName || "").trim(),
    title: String(data.title || "").trim(),
    genre: getGenreTextFromGenres(genres),
    genres,
    status: normalizeWorkStatus(data.status),
    targetChars: Number(data.targetChars || 0) || 0,
    deadline: String(data.deadline || "").trim(),
    summary: String(data.summary || "").trim(),
    memo: String(data.memo || "").trim(),
    updatedAt: new Date().toISOString(),
    exportOptions: {
      includeFolderName: !!data.exportOptions?.includeFolderName,
      includeGenre:
        typeof data.exportOptions?.includeGenre === "boolean"
          ? data.exportOptions.includeGenre
          : true,
      includeTargetChars: !!data.exportOptions?.includeTargetChars,
      includeDeadline: !!data.exportOptions?.includeDeadline,
      includeMemo: !!data.exportOptions?.includeMemo,
      includeUpdatedAt: !!data.exportOptions?.includeUpdatedAt,
    },
  };

  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function syncExportOptionsToWorkspace(exportOptions) {
  if (!exportOptions || typeof exportOptions !== "object") return;

  const config = vscode.workspace.getConfiguration("mojigoto");

  await Promise.all([
    config.update(
      "exportIncludeFolderName",
      !!exportOptions.includeFolderName,
      vscode.ConfigurationTarget.Workspace,
    ),
    config.update(
      "exportIncludeGenre",
      typeof exportOptions.includeGenre === "boolean"
        ? exportOptions.includeGenre
        : true,
      vscode.ConfigurationTarget.Workspace,
    ),
    config.update(
      "exportIncludeTargetChars",
      !!exportOptions.includeTargetChars,
      vscode.ConfigurationTarget.Workspace,
    ),
    config.update(
      "exportIncludeDeadline",
      !!exportOptions.includeDeadline,
      vscode.ConfigurationTarget.Workspace,
    ),
    config.update(
      "exportIncludeMemo",
      !!exportOptions.includeMemo,
      vscode.ConfigurationTarget.Workspace,
    ),
    config.update(
      "exportIncludeUpdatedAt",
      !!exportOptions.includeUpdatedAt,
      vscode.ConfigurationTarget.Workspace,
    ),
  ]);
}

async function resolveSettingsTarget(item) {
  if (isSingleMode()) {
    const dir = getMojigotoDirForSingle();
    await ensureDir(dir);
    return {
      dir,
      path: getSettingsPathForSingle(),
      readPath: getSettingsPathForSingle(),
      mode: "single",
    };
  }

  const workDir = item?.fsPath || "";
  const dir = getMojigotoDirForWork(workDir);
  await ensureDir(dir);

  return {
    dir,
    path: getSettingsPathForWork(workDir),
    readPath: getSettingsPathForWork(workDir),
    mode: "multi",
  };
}

async function collectLinkedGenreOptions() {
  const values = [];
  if (isSingleMode()) {
    try {
      const data = await readSettingsFile(getSettingsPathForSingle(), null);
      values.push(...getGenresFromSettingsData(data));
    } catch {}
  } else {
    for (const work of listWorkDirectories()) {
      if (!work?.fsPath) continue;

      try {
        const data = await readSettingsFile(
          getSettingsPathForWork(work.fsPath),
          work,
        );
        values.push(...getGenresFromSettingsData(data));
      } catch {}
    }
  }

  return normalizeGenres(values);
}

async function collectGenreOptions(extraGenres = [], context = null) {
  const linkedGenres = await collectLinkedGenreOptions();
  const linkedKeys = new Set(linkedGenres.map((value) => value.toLowerCase()));
  const hiddenGenres = getHiddenGenreOptions(context);
  const retainedHidden = hiddenGenres.filter((value) =>
    linkedKeys.has(value.toLowerCase()),
  );

  if (
    typeof context?.workspaceState?.update === "function" &&
    retainedHidden.length !== hiddenGenres.length
  ) {
    await context.workspaceState.update(
      HIDDEN_GENRE_OPTIONS_KEY,
      retainedHidden,
    );
  }

  const hiddenKeys = new Set(
    retainedHidden.map((value) => value.toLowerCase()),
  );

  return normalizeGenres([
    ...DEFAULT_GENRE_OPTIONS,
    ...normalizeGenres(extraGenres),
    ...linkedGenres,
  ])
    .filter(
      (value) =>
        isDefaultGenreOption(value) || !hiddenKeys.has(value.toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b, "ja"));
}

module.exports = {
  ensureDir,
  createDefaultSettings,
  readSettingsFile,
  writeSettingsFile,
  syncExportOptionsToWorkspace,
  resolveSettingsTarget,
  WORK_STATUS_OPTIONS,
  normalizeWorkStatus,
  getWorkStatusLabel,
  DEFAULT_GENRE_OPTIONS,
  HIDDEN_GENRE_OPTIONS_KEY,
  normalizeGenres,
  getGenresFromSettingsData,
  getGenreDisplayText,
  getHiddenGenreOptions,
  isDefaultGenreOption,
  hideCustomGenreOptions,
  restoreGenreOptions,
  collectLinkedGenreOptions,
  collectGenreOptions,
};
