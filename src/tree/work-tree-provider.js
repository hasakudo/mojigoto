const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { getWarehousePath } = require("../core/export-root");
const {
  isSingleMode,
  getResolvedManuscriptRoot,
  getCurrentWorkName,
  getWorkRoot,
} = require("../core/mojigoto-context");
const {
  listWorkDirectories,
  listManuscriptChildren,
  getWorkManuscriptRoot,
} = require("../core/mojigoto-paths");
const { listNotesWithMeta } = require("../data/note-store");
const {
  getTrashDirForSingle,
  getTrashDirForWork,
  listTrashEntries,
  countTrashEntries,
} = require("../core/mojigoto-trash");
const {
  getWorkStatusLabel,
  normalizeWorkStatus,
  WORK_STATUS_OPTIONS,
  getGenresFromSettingsData,
  getGenreDisplayText,
} = require("../data/settings-store");
const { getCurrentWorkDisplayName } = require("../work/work-settings");
const { getDisplayChapterLabel } = require("../core/chapter-labels");
const {
  readDisplayNamesSync,
  getDisplayNameFromData,
} = require("../reorder/reorder-display-names");
const { MOJIGOTO_ICONS } = require("../ui/mojigoto-icons");

const GENRE_EMPTY_FILTER = "__empty__";
const WORK_STATUS_EMPTY_FILTER = "__empty__";
const WORK_STATUS_NOT_HOLD_COMPLETE_FILTER = "__not_hold_complete__";
const MANUSCRIPT_FOLDER_NAMES = new Set(["manuscript", "原稿"]);
const WAREHOUSE_FILE_PRESENTATIONS = [
  {
    extensions: new Set([
      ".xls",
      ".xlsx",
      ".xlsm",
      ".xlsb",
      ".xlt",
      ".xltx",
      ".xltm",
    ]),
    iconId: "table",
    typeLabel: "Excelファイル",
  },
  {
    extensions: new Set([".csv", ".tsv"]),
    iconId: "table",
    typeLabel: "表データファイル",
  },
  {
    extensions: new Set([".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm", ".rtf"]),
    iconId: "book",
    typeLabel: "Word文書",
  },
  {
    extensions: new Set([".pdf"]),
    iconId: "file-pdf",
    typeLabel: "PDFファイル",
  },
  {
    extensions: new Set([".html", ".htm", ".xhtml"]),
    iconId: "file-code",
    typeLabel: "HTMLファイル",
  },
  {
    extensions: new Set([
      ".avif",
      ".bmp",
      ".gif",
      ".heic",
      ".heif",
      ".ico",
      ".jpeg",
      ".jpg",
      ".png",
      ".svg",
      ".tif",
      ".tiff",
      ".webp",
    ]),
    iconId: "file-media",
    typeLabel: "画像ファイル",
  },
];

function getWarehouseFilePresentation(fileName) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  return (
    WAREHOUSE_FILE_PRESENTATIONS.find((item) =>
      item.extensions.has(extension),
    ) || { iconId: "file", typeLabel: "ファイル" }
  );
}

function normalizeComparablePath(value) {
  const normalized = path.normalize(String(value || "").trim());
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getWarehouseRoot() {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const exportRoot = getWarehousePath(
    cfg, vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "",
  );
  if (!exportRoot || !fs.existsSync(exportRoot)) return "";
  try {
    if (!fs.statSync(exportRoot).isDirectory()) return "";
  } catch {
    return "";
  }

  return exportRoot;
}

function getWorkStatusFromDir(workDir) {
  const dir = String(workDir || "").trim();
  if (!dir) return "";

  const workJsonPath = path.join(dir, ".mojigoto", "work.json");
  const settings = readJsonFileSafe(workJsonPath);

  return normalizeWorkStatus(settings?.status);
}

function getWorkStatusFromWorkEntry(work) {
  return normalizeWorkStatus(
    work?.status || getWorkStatusFromDir(work?.fsPath),
  );
}

function normalizeWorkStatusFilters(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const available = new Set(
    WORK_STATUS_OPTIONS.map((item) => item.value).filter(Boolean),
  );
  const values = [];

  for (const rawValue of rawValues) {
    const text = String(rawValue || "").trim();
    const candidates = text === WORK_STATUS_NOT_HOLD_COMPLETE_FILTER
      ? [
          WORK_STATUS_EMPTY_FILTER,
          ...[...available].filter((status) => status !== "hold" && status !== "complete"),
        ]
      : text === WORK_STATUS_EMPTY_FILTER
        ? [WORK_STATUS_EMPTY_FILTER]
        : [normalizeWorkStatus(text)];

    for (const status of candidates) {
      if (
        status &&
        (status === WORK_STATUS_EMPTY_FILTER || available.has(status)) &&
        !values.includes(status)
      ) {
        values.push(status);
      }
    }
  }

  return values;
}

function getWorkStatusFilterLabel(value) {
  const filters = normalizeWorkStatusFilters(value);
  if (!filters.length) return "すべて";
  return filters
    .map((filter) => filter === WORK_STATUS_EMPTY_FILTER ? "未設定" : getWorkStatusLabel(filter))
    .join("、");
}

function workMatchesStatusFilter(work, filterValue) {
  const filters = normalizeWorkStatusFilters(filterValue);
  if (!filters.length) return true;

  const status = getWorkStatusFromWorkEntry(work);
  return filters.includes(status || WORK_STATUS_EMPTY_FILTER);
}

function normalizeWorkGenreFilters(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  return [...new Set(rawValues.map((item) => String(item || "").trim()).filter(Boolean))];
}

function getWorkSettingsFromDir(workDir) {
  const dir = String(workDir || "").trim();
  if (!dir) return null;

  const workJsonPath = path.join(dir, ".mojigoto", "work.json");
  return readJsonFileSafe(workJsonPath);
}

function getWorkGenresFromDir(workDir) {
  const settings = getWorkSettingsFromDir(workDir);
  return getGenresFromSettingsData(settings);
}

function getWorkGenresFromWorkEntry(work) {
  if (Array.isArray(work?.genres) && work.genres.length) {
    return getGenresFromSettingsData(work);
  }

  if (work?.genre) {
    return getGenresFromSettingsData(work);
  }

  return getWorkGenresFromDir(work?.fsPath);
}

function getWorkGenreDisplayFromWorkEntry(work) {
  const genres = getWorkGenresFromWorkEntry(work);
  return getGenreDisplayText({ genres });
}

function getWorkGenreFilterLabel(value) {
  const filters = normalizeWorkGenreFilters(value);
  if (!filters.length) return "すべて";
  return filters
    .map((filter) => filter === GENRE_EMPTY_FILTER ? "未設定" : filter)
    .join("、");
}

function workMatchesGenreFilter(work, filterValue) {
  const filters = normalizeWorkGenreFilters(filterValue);
  if (!filters.length) return true;

  const genres = getWorkGenresFromWorkEntry(work);
  return filters.some((filter) =>
    filter === GENRE_EMPTY_FILTER ? genres.length === 0 : genres.includes(filter),
  );
}

function collectWorkGenres(works = []) {
  const genres = [];
  let hasEmpty = false;

  for (const work of works) {
    const workGenres = getWorkGenresFromWorkEntry(work);

    if (!workGenres.length) {
      hasEmpty = true;
      continue;
    }

    for (const genre of workGenres) {
      if (!genres.includes(genre)) {
        genres.push(genre);
      }
    }
  }

  genres.sort((a, b) =>
    String(a).localeCompare(String(b), "ja", {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return {
    genres,
    hasEmpty,
  };
}

class MojigotoTreeItem extends vscode.TreeItem {
  constructor(label, collapsibleState, options = {}) {
    super(label, collapsibleState);
    this.kind = options.kind || "unknown";
    this.fsPath = options.fsPath || "";
    this.workName = options.workName || "";
    this.workDir = options.workDir || "";
    this.contextValue = options.contextValue || this.kind;
    this.command = options.command;
    this.tooltip = options.tooltip || label;
    this.title = options.title || "";
    this.noteType = options.noteType || "";
    this.description = options.description || "";
    this.currentViewManuscriptItem = null;
    this.parent = options.parent || null;
    this.currentViewRootItem = null;

    if (options.iconId) {
      this.iconPath = new vscode.ThemeIcon(options.iconId);
    }
  }
}

class MojigotoWorkTreeProvider {
  constructor(context) {
    this.context = context;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.currentViewRootItem = null;
    this.currentViewManuscriptItem = null;
    this.singleViewRootItem = null;
    this._itemCache = new Map();
    this._nestedManuscriptWarnings = new Set();

    const savedStatusFilters = context.globalState.get("mojigoto.workStatusFilters");
    const savedGenreFilters = context.globalState.get("mojigoto.workGenreFilters");
    const legacyStatusFilter = context.globalState.get("mojigoto.workStatusFilter", "");
    const legacyGenreFilter = context.globalState.get("mojigoto.workGenreFilter", "");

    this.workStatusFilters = normalizeWorkStatusFilters(
      Array.isArray(savedStatusFilters) ? savedStatusFilters : legacyStatusFilter,
    );
    this.workGenreFilters = normalizeWorkGenreFilters(
      Array.isArray(savedGenreFilters) ? savedGenreFilters : legacyGenreFilter,
    );

    if (!Array.isArray(savedStatusFilters) && legacyStatusFilter) {
      void context.globalState.update("mojigoto.workStatusFilters", this.workStatusFilters);
    }
    if (!Array.isArray(savedGenreFilters) && legacyGenreFilter) {
      void context.globalState.update("mojigoto.workGenreFilters", this.workGenreFilters);
    }
  }

  refresh(element = undefined) {
    this._emitter.fire(element);
  }

  getWorkStatusFilter() {
    return normalizeWorkStatusFilters(this.workStatusFilters);
  }

  getAllWorksForFilter() {
    return listWorkDirectories();
  }

  getAvailableWorkGenres() {
    return collectWorkGenres(listWorkDirectories());
  }

  async setWorkStatusFilter(value) {
    this.workStatusFilters = normalizeWorkStatusFilters(value);

    try {
      await this.context.globalState.update(
        "mojigoto.workStatusFilters",
        this.workStatusFilters,
      );
      await this.context.globalState.update("mojigoto.workStatusFilter", undefined);
    } catch {
      // noop
    }

    this.refresh();
  }

  getWorkGenreFilter() {
    return normalizeWorkGenreFilters(this.workGenreFilters);
  }

  async setWorkGenreFilter(value) {
    this.workGenreFilters = normalizeWorkGenreFilters(value);

    try {
      await this.context.globalState.update(
        "mojigoto.workGenreFilters",
        this.workGenreFilters,
      );
      await this.context.globalState.update("mojigoto.workGenreFilter", undefined);
    } catch {
      // noop
    }

    this.refresh();
  }

  createWorkGenreFilterItem(works = [], visibleWorks = []) {
    const filter = this.getWorkGenreFilter();
    const label = getWorkGenreFilterLabel(filter);

    return new MojigotoTreeItem(
      `ジャンルで絞り込み: ${label}`,
      vscode.TreeItemCollapsibleState.None,
      {
        kind: "workGenreFilterAction",
        contextValue: "workGenreFilterAction",
        iconId: filter.length ? "filter-filled" : "filter",
        description: `${visibleWorks.length}/${works.length}`,
        tooltip: "作品一覧をジャンルで絞り込みます",
        command: {
          command: "mojigoto.filterWorksByGenre",
          title: "作品一覧をジャンルで絞り込み",
        },
      },
    );
  }

  createWorkStatusFilterItem(works = [], visibleWorks = []) {
    const filter = this.getWorkStatusFilter();
    const label = getWorkStatusFilterLabel(filter);

    return new MojigotoTreeItem(
      `状態で絞り込み: ${label}`,
      vscode.TreeItemCollapsibleState.None,
      {
        kind: "workStatusFilterAction",
        contextValue: "workStatusFilterAction",
        iconId: filter.length ? "filter-filled" : "filter",
        description: `${visibleWorks.length}/${works.length}`,
        tooltip: "作品一覧を状態で絞り込みます",
        command: {
          command: "mojigoto.filterWorksByStatus",
          title: "作品一覧を状態で絞り込み",
        },
      },
    );
  }

  getTreeItem(element) {
    if (element.kind === "trashRoot") {
      return countTrashEntries(element).then((count) => {
        element.description = `${count}件`;
        element.tooltip = `ゴミ箱: ${count}件\nフォルダーも1件として数えます。`;
        return element;
      }).catch(() => {
        element.description = "件数不明";
        element.tooltip = "ゴミ箱の件数を取得できませんでした。";
        return element;
      });
    }
    return element;
  }

  _getItemCacheKey(kind, fsPath = "", extra = "") {
    return [
      kind,
      path.normalize(String(fsPath || "")),
      String(extra || ""),
    ].join("::");
  }

  _upsertTreeItem(label, collapsibleState, options = {}) {
    const key = this._getItemCacheKey(
      options.kind || "unknown",
      options.fsPath || "",
      options.contextValue || "",
    );

    let item = this._itemCache.get(key);
    if (!item) {
      item = new MojigotoTreeItem(label, collapsibleState, options);
      this._itemCache.set(key, item);
      return item;
    }

    item.label = label;
    item.collapsibleState = collapsibleState;
    item.kind = options.kind || "unknown";
    item.fsPath = options.fsPath || "";
    item.workName = options.workName || "";
    item.workDir = options.workDir || "";
    item.contextValue = options.contextValue || item.kind;
    item.command = options.command;
    item.tooltip = options.tooltip || label;
    item.title = options.title || "";
    item.noteType = options.noteType || "";
    item.description = options.description || "";
    item.parent = options.parent || null;

    if (options.iconId) {
      item.iconPath = new vscode.ThemeIcon(options.iconId);
    } else {
      item.iconPath = undefined;
    }

    return item;
  }

  async getChildren(element) {
    if (!element) {
      if (!this.isSetupReady()) {
        return this.getSetupGuideItems();
      }

      return isSingleMode()
        ? this.getSingleRootItems()
        : this.getMultiRootItems();
    }

    switch (element.kind) {
      case "singleViewRoot":
        return this.getSingleSections();

      case "currentViewRoot":
        return this.getCurrentViewSections();

      case "work":
        return this.getWorkSections(element);

      case "manuscriptRoot":
        return this.getManuscriptChildren(
          element.fsPath,
          element.workName,
          element.workDir || "",
          element,
        );

      case "chapterFolder":
        return this.getManuscriptChildren(
          element.fsPath,
          element.workName,
          element.workDir || "",
          element,
        );

      case "plotRoot":
        return this.getNoteChildren("plot", element);

      case "referenceRoot":
        return this.getNoteChildren("reference", element);

      case "trashRoot":
        return this.getTrashChildren(element);

      case "warehouseRoot":
      case "warehouseFolder":
        return this.getWarehouseChildren(element);

      default:
        return [];
    }
  }

  getCurrentViewManuscriptItem() {
    return this.currentViewManuscriptItem || null;
  }

  getParent(element) {
    return element?.parent || null;
  }

  async findItemByFsPath(targetPath) {
    const normalizedTarget = path.normalize(String(targetPath || ""));
    if (!normalizedTarget) return null;

    const expandableKinds = new Set([
      "singleViewRoot",
      "currentViewRoot",
      "work",
      "manuscriptRoot",
      "chapterFolder",
      "plotRoot",
      "referenceRoot",
      "trashRoot",
      "warehouseRoot",
      "warehouseFolder",
    ]);

    const walk = async (parent) => {
      const children = await this.getChildren(parent);

      for (const child of children) {
        const childPath = path.normalize(String(child?.fsPath || ""));
        if (childPath && childPath === normalizedTarget) {
          return child;
        }
      }

      for (const child of children) {
        if (!expandableKinds.has(child?.kind)) continue;
        if (child.kind === "warehouseRoot" || child.kind === "warehouseFolder") {
          const relative = path.relative(child.fsPath, normalizedTarget);
          if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
        }
        const found = await walk(child);
        if (found) return found;
      }

      return null;
    };

    return await walk(undefined);
  }

  async revealByFsPath(workTreeView, targetPath, options = {}) {
    if (!workTreeView || !targetPath) return false;

    const item = await this.findItemByFsPath(targetPath);
    if (!item) return false;

    await workTreeView.reveal(item, {
      expand: options.expand ?? true,
      focus: options.focus ?? true,
      select: options.select ?? true,
    });

    return true;
  }

  createSeparator(label) {
    return new MojigotoTreeItem(label, vscode.TreeItemCollapsibleState.None, {
      kind: "separator",
      contextValue: "separator",
    });
  }

  createWarehouseRootItem() {
    const warehouseRoot = getWarehouseRoot();
    if (!warehouseRoot) return null;

    return new MojigotoTreeItem(
      `倉庫: ${path.basename(warehouseRoot)}`,
      vscode.TreeItemCollapsibleState.Collapsed,
      {
        kind: "warehouseRoot",
        contextValue: "warehouseRoot",
        fsPath: warehouseRoot,
        iconId: "archive",
        tooltip: warehouseRoot,
      },
    );
  }

  getWarehouseRootItems() {
    const warehouse = this.createWarehouseRootItem();
    return warehouse
      ? [this.createSeparator("────── 倉庫 ──────"), warehouse]
      : [];
  }

  getWarehouseChildren(parentItem) {
    const dirPath = String(parentItem?.fsPath || "").trim();
    if (!dirPath) return [];

    let entries = [];
    try {
      // Junctions back to an ancestor must not cause unbounded tree traversal.
      const realPath = normalizeComparablePath(fs.realpathSync(dirPath));
      for (let ancestor = parentItem.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.fsPath && normalizeComparablePath(fs.realpathSync(ancestor.fsPath)) === realPath) return [];
      }
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .map((entry) => {
        const fsPath = path.join(dirPath, entry.name);
        let isDirectory = entry.isDirectory();
        if (!isDirectory && entry.isSymbolicLink()) {
          try {
            isDirectory = fs.statSync(fsPath).isDirectory();
          } catch {}
        }
        const filePresentation = getWarehouseFilePresentation(entry.name);

        return new MojigotoTreeItem(
          entry.name,
          isDirectory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          {
            kind: isDirectory ? "warehouseFolder" : "warehouseFile",
            contextValue: isDirectory ? "warehouseFolder" : "warehouseFile",
            fsPath,
            iconId: isDirectory ? "folder" : filePresentation.iconId,
            parent: parentItem,
            tooltip: isDirectory
              ? fsPath
              : `${filePresentation.typeLabel}\n${fsPath}`,
            command: isDirectory
              ? undefined
              : {
                  command: "vscode.open",
                  title: "ファイルを開く",
                  arguments: [vscode.Uri.file(fsPath)],
                },
          },
        );
      })
      .sort((a, b) => {
        const aFolder = a.kind === "warehouseFolder" ? 0 : 1;
        const bFolder = b.kind === "warehouseFolder" ? 0 : 1;
        if (aFolder !== bFolder) return aFolder - bFolder;
        return String(a.label).localeCompare(String(b.label), "ja", {
          numeric: true,
          sensitivity: "base",
        });
      });
  }

  createConceptMemosItem(options = {}) {
    const parent = options.parent || null;
    const workName = options.workName || "";
    const workDir = options.workDir || "";
    const fsPath = options.fsPath || "";

    return new MojigotoTreeItem(
      "構想メモ",
      vscode.TreeItemCollapsibleState.None,
      {
        kind: "conceptMemosEntry",
        contextValue: "conceptMemosEntry",
        workName,
        workDir,
        fsPath,
        iconId: MOJIGOTO_ICONS.conceptMemo,
        parent,
        tooltip: "構想メモを開く",
        command: {
          command: "mojigoto.createEmptyConceptMemos",
          title: "構想メモを開く",
          arguments: [
            {
              workName,
              workDir,
              fsPath,
              kind: "conceptMemosEntry",
            },
          ],
        },
      },
    );
  }

  isSetupReady() {
    const cfg = vscode.workspace.getConfiguration("mojigoto");
    const mode = String(cfg.get("mode", "single") || "single").trim();

    const manuscriptRoot = String(cfg.get("manuscriptRoot", "") || "").trim();
    const workRoot = String(cfg.get("workRoot", "") || "").trim();

    if (!manuscriptRoot) return false;

    if (mode === "multi" && !workRoot) return false;

    return true;
  }

  getSetupGuideItems() {
    return [
      this.createSeparator("────── Guide ──────"),
      new MojigotoTreeItem(
        "セットアップが必要です",
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "setupGuideMessage",
          contextValue: "setupGuideMessage",
          iconId: "warning",
          description: "初回セットアップを行ってください",
          tooltip: "もじごとを使い始めるには初回セットアップが必要です。",
        },
      ),
      new MojigotoTreeItem(
        "初回セットアップを開く",
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "openSetupAction",
          contextValue: "openSetupAction",
          iconId: "tools",
          tooltip: "初回セットアップを開く",
          command: {
            command: "mojigoto.openInitialSetup",
            title: "初回セットアップを開く",
          },
        },
      ),
    ];
  }

  getSingleRootItems() {
    const displayName = String(
      getCurrentWorkDisplayName(this.context) || "",
    ).trim();

    const viewLabel = displayName || "現在の作品";

    const viewRootItem = new MojigotoTreeItem(
      "View",
      vscode.TreeItemCollapsibleState.Expanded,
      {
        kind: "singleViewRoot",
        contextValue: "singleViewRoot",
        iconId: "eye",
        description: viewLabel,
        tooltip: `Mojigoto View - ${viewLabel}`,
      },
    );

    this.singleViewRootItem = viewRootItem;

    return [
      this.createSeparator("────── View ──────"),
      viewRootItem,
      ...this.getWarehouseRootItems(),
    ];
  }

  getSingleSections() {
    const manuscriptRoot = getResolvedManuscriptRoot();
    const trashDir = getTrashDirForSingle();
    const parent = this.singleViewRootItem || null;
    const viewManuscriptItem = this._upsertTreeItem(
      "原稿",
      vscode.TreeItemCollapsibleState.Collapsed,
      {
        kind: "manuscriptRoot",
        contextValue: "currentViewManuscriptRoot",
        fsPath: manuscriptRoot,
        iconId: MOJIGOTO_ICONS.manuscript,
        parent,
      },
    );

    this.currentViewManuscriptItem = viewManuscriptItem;

    return [
      viewManuscriptItem,
      new MojigotoTreeItem(
        "プロット",
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          kind: "plotRoot",
          contextValue: "plotRoot",
          iconId: MOJIGOTO_ICONS.plot,
          parent,
        },
      ),
      new MojigotoTreeItem("資料", vscode.TreeItemCollapsibleState.Collapsed, {
        kind: "referenceRoot",
        contextValue: "referenceRoot",
        iconId: MOJIGOTO_ICONS.reference,
        parent,
      }),
      this.createConceptMemosItem({
        parent,
      }),
      new MojigotoTreeItem("作品設定", vscode.TreeItemCollapsibleState.None, {
        kind: "settingsEntry",
        contextValue: "settingsEntry",
        iconId: MOJIGOTO_ICONS.settings,
        parent,
        command: {
          command: "mojigoto.treeOpenSettings",
          title: "作品設定を開く",
          arguments: [null],
        },
      }),
      new MojigotoTreeItem(
        "ゴミ箱",
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          kind: "trashRoot",
          contextValue: "trashRoot",
          fsPath: trashDir,
          iconId: "trash",
          parent,
        },
      ),
    ];
  }

  getMultiRootItems() {
    const works = listWorkDirectories();
    const current = this.resolveCurrentViewWork();
    const currentWorkFolderName = current.workName;
    const currentSettings = getWorkSettingsFromDir(current.workDir);
    const currentViewDisplayName = String(
      currentSettings?.title || currentSettings?.folderName || "",
    ).trim();

    const currentViewLabel =
      currentViewDisplayName || currentWorkFolderName || "現在のプレビュー対象";

    const statusFilter = this.getWorkStatusFilter();
    const genreFilter = this.getWorkGenreFilter();

    const visibleWorks = works.filter((work) => {
      const statusOk = workMatchesStatusFilter(work, statusFilter);

      const genreOk = workMatchesGenreFilter(work, genreFilter);

      return statusOk && genreOk;
    });

    const viewTooltip =
      currentWorkFolderName && currentViewLabel !== currentWorkFolderName
        ? `Mojigoto View\n表示名: ${currentViewLabel}\nフォルダ名: ${currentWorkFolderName}`
        : `Mojigoto View - ${currentViewLabel}`;

    const viewRootItem = new MojigotoTreeItem(
      "View",
      vscode.TreeItemCollapsibleState.Expanded,
      {
        kind: "currentViewRoot",
        contextValue: "currentViewRoot",
        iconId: "eye",
        description: currentViewLabel,
        tooltip: viewTooltip,
        fsPath: current.workDir || "",
        workName: current.workName || "",
      },
    );

    this.currentViewRootItem = viewRootItem;

    const items = [
      this.createSeparator("────── View ──────"),
      viewRootItem,
      this.createSeparator("────── 作品一覧 ──────"),
    ];

    items.push(this.createWorkStatusFilterItem(works, visibleWorks));
    items.push(this.createWorkGenreFilterItem(works, visibleWorks));

    const workItems = visibleWorks.map((work) => {
      const baseLabel = work.title || work.name;
      const isCurrent =
        !!currentWorkFolderName && currentWorkFolderName === work.name;

      const status = getWorkStatusFromWorkEntry(work);
      const statusLabel = getWorkStatusLabel(status);
      const genreLabel = getWorkGenreDisplayFromWorkEntry(work) || "未設定";

      const tooltipBase =
        work.title && work.title !== work.name
          ? `作品名: ${work.title}\nフォルダ名: ${work.name}`
          : `フォルダ名: ${work.name}`;

      const tooltip = `${tooltipBase}\nジャンル: ${genreLabel}\n状態: ${statusLabel}`;

      return new MojigotoTreeItem(
        baseLabel,
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          kind: "work",
          contextValue: isCurrent ? "workCurrent" : "work",
          fsPath: work.fsPath,
          workName: work.name,
          iconId: isCurrent ? "target" : "book",
          tooltip: isCurrent
            ? `${tooltip}\nView連携中のためフォルダ名変更はできません`
            : tooltip,
        },
      );
    });

    if (!workItems.length) {
      items.push(
        new MojigotoTreeItem(
          "該当する作品がありません",
          vscode.TreeItemCollapsibleState.None,
          {
            kind: "empty",
            contextValue: "empty",
            iconId: "info",
            description: [
              statusFilter.length ? `状態: ${getWorkStatusFilterLabel(statusFilter)}` : "",
              genreFilter.length
                ? `ジャンル: ${getWorkGenreFilterLabel(genreFilter)}`
                : "",
            ]
              .filter(Boolean)
              .join(" / "),
          },
        ),
      );
    } else {
      items.push(...workItems);
    }

    items.push(
      new MojigotoTreeItem("新規作品", vscode.TreeItemCollapsibleState.None, {
        kind: "createWorkAction",
        contextValue: "createWorkAction",
        iconId: "add",
        command: {
          command: "mojigoto.treeCreateWork",
          title: "新規作品を作成",
        },
      }),
    );

    items.push(...this.getWarehouseRootItems());

    return items;
  }

  resolveCurrentViewWork() {
    const workRoot = getWorkRoot();
    const manuscriptRoot = getResolvedManuscriptRoot();

    // globalState is shared by every VS Code window. The junction target is
    // workspace-specific, so use it as the source of truth for the View tree.
    if (manuscriptRoot && fs.existsSync(manuscriptRoot)) {
      try {
        const real = fs.realpathSync(manuscriptRoot);
        const inferredWorkDir = path.dirname(real);
        const inferredWorkName = path.basename(inferredWorkDir);

        if (
          inferredWorkName &&
          inferredWorkName.toLowerCase() !== "_work" &&
          (!workRoot ||
            normalizeComparablePath(path.dirname(inferredWorkDir)) ===
              normalizeComparablePath(workRoot))
        ) {
          return {
            workName: inferredWorkName,
            workDir: inferredWorkDir,
          };
        }
      } catch {
        // Fall back to the stored work name when the junction cannot be read.
      }
    }

    const currentWorkName = getCurrentWorkName(this.context);
    if (currentWorkName && workRoot) {
      const currentWorkDir = path.join(workRoot, currentWorkName);
      if (fs.existsSync(currentWorkDir)) {
        return {
          workName: currentWorkName,
          workDir: currentWorkDir,
        };
      }
    }

    return {
      workName: "",
      workDir: "",
    };
  }

  getCurrentViewSections() {
    const manuscriptRoot = getResolvedManuscriptRoot();
    const current = this.resolveCurrentViewWork();

    const viewManuscriptItem = this._upsertTreeItem(
      "原稿",
      vscode.TreeItemCollapsibleState.Collapsed,
      {
        kind: "manuscriptRoot",
        contextValue: "currentViewManuscriptRoot",
        fsPath: manuscriptRoot,
        workName: current.workName,
        workDir: current.workDir,
        iconId: MOJIGOTO_ICONS.manuscript,
        parent: this.currentViewRootItem || null,
      },
    );

    this.currentViewManuscriptItem = viewManuscriptItem;

    const items = [viewManuscriptItem];

    if (current.workDir) {
      items.push(
        new MojigotoTreeItem(
          "プロット",
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            kind: "plotRoot",
            contextValue: "plotRoot",
            workName: current.workName,
            fsPath: current.workDir,
            iconId: MOJIGOTO_ICONS.plot,
            parent: this.currentViewRootItem || null,
          },
        ),
      );

      items.push(
        new MojigotoTreeItem(
          "資料",
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            kind: "referenceRoot",
            contextValue: "referenceRoot",
            workName: current.workName,
            fsPath: current.workDir,
            iconId: MOJIGOTO_ICONS.reference,
            parent: this.currentViewRootItem || null,
          },
        ),
      );

      items.push(
        this.createConceptMemosItem({
          parent: this.currentViewRootItem || null,
          workName: current.workName,
          workDir: current.workDir,
          fsPath: current.workDir,
        }),
      );

      items.push(
        new MojigotoTreeItem("作品設定", vscode.TreeItemCollapsibleState.None, {
          kind: "settingsEntry",
          contextValue: "settingsEntry",
          workName: current.workName,
          fsPath: current.workDir,
          iconId: MOJIGOTO_ICONS.settings,
          parent: this.currentViewRootItem || null,
          command: {
            command: "mojigoto.treeOpenSettings",
            title: "作品設定を開く",
            arguments: [
              {
                fsPath: current.workDir,
                workName: current.workName,
              },
            ],
          },
        }),
      );

      items.push(
        new MojigotoTreeItem(
          "ゴミ箱",
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            kind: "trashRoot",
            contextValue: "trashRoot",
            workName: current.workName,
            workDir: current.workDir,
            fsPath: getTrashDirForWork(current.workDir),
            iconId: "trash",
            parent: this.currentViewRootItem || null,
          },
        ),
      );
    }

    items.push(
      new MojigotoTreeItem(
        "作品を切り替え",
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "switchWorkAction",
          contextValue: "switchWorkAction",
          iconId: "sync",
          parent: this.currentViewRootItem || null,
          command: {
            command: "mojigoto.switchWorkAndRestart",
            title: "作品を切り替え",
          },
        },
      ),
    );

    return items;
  }

  getWorkSections(workItem) {
    const manuscriptRoot = getWorkManuscriptRoot(workItem.fsPath);

    return [
      this._upsertTreeItem("原稿", vscode.TreeItemCollapsibleState.Collapsed, {
        kind: "manuscriptRoot",
        contextValue: "manuscriptRoot",
        fsPath: manuscriptRoot,
        workName: workItem.workName,
        workDir: workItem.fsPath,
        iconId: MOJIGOTO_ICONS.manuscript,
        parent: workItem,
      }),
      new MojigotoTreeItem(
        "プロット",
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          kind: "plotRoot",
          contextValue: "plotRoot",
          workName: workItem.workName,
          fsPath: workItem.fsPath,
          iconId: MOJIGOTO_ICONS.plot,
        },
      ),
      new MojigotoTreeItem("資料", vscode.TreeItemCollapsibleState.Collapsed, {
        kind: "referenceRoot",
        contextValue: "referenceRoot",
        workName: workItem.workName,
        fsPath: workItem.fsPath,
        iconId: MOJIGOTO_ICONS.reference,
      }),
      this.createConceptMemosItem({
        parent: workItem,
        workName: workItem.workName,
        workDir: workItem.fsPath,
        fsPath: workItem.fsPath,
      }),
      new MojigotoTreeItem("作品設定", vscode.TreeItemCollapsibleState.None, {
        kind: "settingsEntry",
        contextValue: "settingsEntry",
        workName: workItem.workName,
        fsPath: workItem.fsPath,
        iconId: MOJIGOTO_ICONS.settings,
        command: {
          command: "mojigoto.treeOpenSettings",
          title: "作品設定を開く",
          arguments: [workItem],
        },
      }),
      new MojigotoTreeItem(
        "ゴミ箱",
        vscode.TreeItemCollapsibleState.Collapsed,
        {
          kind: "trashRoot",
          contextValue: "trashRoot",
          workName: workItem.workName,
          workDir: workItem.fsPath,
          fsPath: getTrashDirForWork(workItem.fsPath),
          iconId: "trash",
        },
      ),
    ];
  }

  getManuscriptChildren(
    manuscriptRoot,
    workName = "",
    workDir = "",
    parentItem = null,
  ) {
    if (!manuscriptRoot || !fs.existsSync(manuscriptRoot)) {
      return [
        new MojigotoTreeItem(
          "manuscript が見つかりません",
          vscode.TreeItemCollapsibleState.None,
          {
            kind: "empty",
            contextValue: "empty",
            iconId: "warning",
          },
        ),
      ];
    }

    let displayNamesRoot = manuscriptRoot;
    let cursor = parentItem;
    while (cursor) {
      if (cursor.kind === "manuscriptRoot" && cursor.fsPath) {
        displayNamesRoot = cursor.fsPath;
        break;
      }
      cursor = cursor.parent || null;
    }
    const displayNamesData = readDisplayNamesSync(displayNamesRoot);
    const entries = listManuscriptChildren(manuscriptRoot);
    const nestedManuscriptFolders = parentItem?.kind === "manuscriptRoot"
      ? entries.filter((entry) =>
          entry.type === "dir" && MANUSCRIPT_FOLDER_NAMES.has(String(entry.name || "").toLowerCase()),
        )
      : [];

    for (const entry of nestedManuscriptFolders) {
      const warningKey = normalizeComparablePath(entry.fsPath);
      if (!warningKey || this._nestedManuscriptWarnings.has(warningKey)) continue;
      this._nestedManuscriptWarnings.add(warningKey);
      void vscode.window?.showWarningMessage?.(
        `もじごと: 原稿フォルダが二重になっています（内側: 「${entry.name}」）。内容は表示できますが、内側の原稿を外側の原稿フォルダ直下へ移動し、空になった内側のフォルダを削除してください。`,
      );
    }

    return entries.map((entry) => {
      const customDisplayName = getDisplayNameFromData(
        displayNamesData,
        displayNamesRoot,
        entry.fsPath,
      );

      if (entry.type === "dir") {
        const displayLabel = customDisplayName || getDisplayChapterLabel(entry.name);
        const nestedManuscript = nestedManuscriptFolders.some((item) =>
          normalizeComparablePath(item.fsPath) === normalizeComparablePath(entry.fsPath),
        );
        const tooltip = nestedManuscript
          ? `原稿フォルダが二重になっています。内側の原稿を外側へ移動してください。\n${entry.fsPath}`
          :
          displayLabel !== entry.name
            ? `${displayLabel}\n実フォルダ名: ${entry.name}`
            : entry.name;

        return this._upsertTreeItem(
          displayLabel,
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            kind: "chapterFolder",
            contextValue: "chapterFolder",
            fsPath: entry.fsPath,
            workName,
            workDir,
            iconId: "folder",
            description: nestedManuscript ? "⚠ 二重" : "",
            parent: parentItem,
            tooltip,
          },
        );
      }

      const displayLabel = customDisplayName || entry.name;
      const tooltip = customDisplayName
        ? `${displayLabel}\n実ファイル名: ${entry.name}`
        : entry.name;

      return this._upsertTreeItem(
        displayLabel,
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "manuscriptFile",
          contextValue: "manuscriptFile",
          fsPath: entry.fsPath,
          workName,
          workDir,
          iconId: MOJIGOTO_ICONS.manuscriptFile,
          parent: parentItem,
          tooltip,
          command: {
            command: "vscode.open",
            title: "ファイルを開く",
            arguments: [vscode.Uri.file(entry.fsPath)],
          },
        },
      );
    });
  }

  async getNoteChildren(type, rootItem) {
    const notes = await listNotesWithMeta(type, rootItem);

    const items = notes.map((note) => {
      return new MojigotoTreeItem(
        note.title,
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "noteFile",
          contextValue: "noteFile",
          fsPath: note.fsPath,
          workDir: rootItem.fsPath || "",
          workName: rootItem.workName || "",
          noteType: type,
          title: note.title,
          iconId:
            type === "plot"
              ? MOJIGOTO_ICONS.plot
              : MOJIGOTO_ICONS.reference,
          command: {
            command: "mojigoto.treeOpenNote",
            title: "ノートを開く",
            arguments: [
              {
                ...note,
                workDir: rootItem.fsPath || "",
                workName: rootItem.workName || "",
              },
            ],
          },
          tooltip: note.fsPath,
        },
      );
    });

    items.push(
      new MojigotoTreeItem(
        type === "plot" ? "新規プロット" : "新規資料",
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "noteCreateAction",
          contextValue: "noteCreateAction",
          workName: rootItem.workName || "",
          fsPath: rootItem.fsPath || "",
          noteType: type,
          iconId: "add",
          command: {
            command:
              type === "plot"
                ? "mojigoto.treeCreatePlot"
                : "mojigoto.treeCreateReference",
            title: type === "plot" ? "プロットを新規作成" : "資料を新規作成",
            arguments: [rootItem],
          },
        },
      ),
    );

    return items;
  }

  async getTrashChildren(rootItem) {
    const entries = await listTrashEntries(rootItem);

    if (!entries.length) {
      return [
        new MojigotoTreeItem(
          "ゴミ箱は空です",
          vscode.TreeItemCollapsibleState.None,
          {
            kind: "empty",
            contextValue: "empty",
            iconId: "trash",
          },
        ),
      ];
    }

    return entries.map((entry) => {
      const isDirectory = entry.itemType === "directory";

      return new MojigotoTreeItem(
        entry.label,
        vscode.TreeItemCollapsibleState.None,
        {
          kind: "trashEntry",
          contextValue: isDirectory ? "trashFolderEntry" : "trashFileEntry",
          fsPath: entry.fsPath,
          workName: entry.workName,
          workDir: entry.workDir,
          description: entry.description,
          tooltip: entry.tooltip,
          iconId: isDirectory ? "folder" : "file",
          originalPath: entry.originalPath,
          metaPath: entry.metaPath,
          command: isDirectory
            ? undefined
            : {
                command: "mojigoto.openTrashEntry",
                title: "ゴミ箱内ファイルを開く",
                arguments: [
                  {
                    label: entry.label,
                    fsPath: entry.fsPath,
                    metaPath: entry.metaPath,
                    originalPath: entry.originalPath,
                    workName: entry.workName,
                    workDir: entry.workDir,
                  },
                ],
              },
        },
      );
    });
  }
}

module.exports = {
  MojigotoWorkTreeProvider,
  getWorkStatusFilterLabel,
  WORK_STATUS_EMPTY_FILTER,
  WORK_STATUS_NOT_HOLD_COMPLETE_FILTER,
};
