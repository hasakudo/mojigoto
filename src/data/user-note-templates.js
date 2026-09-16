const fs = require("fs/promises");
const path = require("path");
const vscode = require("vscode");

async function ensureDir(dirPath) {
  if (!dirPath) return;
  await fs.mkdir(dirPath, { recursive: true });
}

function getWorkspaceRoot() {
  const wf = vscode.workspace.workspaceFolders?.[0];
  return wf?.uri?.fsPath || "";
}

function slugify(input) {
  const s = String(input || "")
    .trim()
    .toLowerCase();
  if (!s) return "template";
  return (
    s
      .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}

async function getUserTemplateDir(type, options = {}) {
  const scope = options?.scope === "work" ? "work" : "global";
  const workDir = String(options?.workDir || "").trim();
  const base = scope === "work" && workDir ? workDir : getWorkspaceRoot();
  if (!base) return "";
  const dir = path.join(
    base,
    ".mojigoto",
    "templates",
    type === "plot" ? "plot" : "reference",
  );
  await ensureDir(dir);
  return dir;
}

async function saveUserGroupTemplate(note, group, templateName, saveMode, options = {}) {
  const templateNote = {
    ...note,
    groups: group ? [group] : [],
  };

  return saveUserTemplate(templateNote, templateName, saveMode, options);
}

function buildTemplatePayload(note, templateName, saveMode) {
  const groups = Array.isArray(note?.groups) ? note.groups : [];

  const keepGroupTitle =
    saveMode === "structureWithDividers" ||
    saveMode === "structureWithHeadings" ||
    saveMode === "full";

  const keepDividerLabel =
    saveMode === "structureWithDividers" ||
    saveMode === "structureWithHeadings" ||
    saveMode === "full";

  const keepDividerValue = saveMode === "full";

  const keepEntryHeading =
    saveMode === "structureWithHeadings" || saveMode === "full";

  const keepEntryBody = saveMode === "full";

  const mappedGroups = groups.map((group) => ({
    title: keepGroupTitle ? String(group?.title || "") : "",
    items: Array.isArray(group?.items)
      ? group.items
          .filter((item) => {
            const kind = String(item?.kind || "entry");
            if (saveMode === "structureWithDividers" && kind === "entry") {
              return false;
            }
            return true;
          })
          .map((item) => {
            const kind = String(item?.kind || "entry");

            if (kind === "divider") {
              return {
                kind: "divider",
                label: keepDividerLabel ? String(item?.label || "") : "",
                value: keepDividerValue ? String(item?.value || "") : "",
              };
            }

            return {
              kind: "entry",
              heading: keepEntryHeading ? String(item?.heading || "") : "",
              headingRuby: keepEntryHeading
                ? String(item?.headingRuby || "")
                : "",
              body: keepEntryBody ? String(item?.body || "") : "",
            };
          })
      : [],
  }));

  return {
    schemaVersion: 1,
    type: String(note?.type || "plot"),
    templateName: String(templateName || "").trim(),
    saveMode,
    groups: mappedGroups,
    updatedAt: new Date().toISOString(),
  };
}

async function saveUserTemplate(note, templateName, saveMode, options = {}) {
  const type = String(note?.type || "plot");
  const scope = options?.scope === "work" ? "work" : "global";
  const dir = await getUserTemplateDir(type, { ...options, scope });
  if (!dir) {
    throw new Error("テンプレート保存先を作成できませんでした。");
  }

  const base = slugify(templateName || "template");
  let fileName = `${base}.json`;
  let filePath = path.join(dir, fileName);
  let index = 2;

  while (true) {
    try {
      await fs.access(filePath);
      fileName = `${base}-${index}.json`;
      filePath = path.join(dir, fileName);
      index += 1;
    } catch {
      break;
    }
  }

  const payload = buildTemplatePayload(note, templateName, saveMode);
  payload.scope = scope;
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    filePath,
    payload,
  };
}

async function listTemplatesInDir(type, dir, scope, idPrefix) {
  if (!dir) return [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter(
      (e) => e.isFile() && e.name.toLowerCase().endsWith(".json"),
    );

    const results = [];
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        results.push({
          label: String(
            parsed?.templateName || file.name.replace(/\.json$/i, ""),
          ),
          description: scope === "work" ? "自作テンプレート（この作品）" : "自作テンプレート（全体）",
          templateId: `${idPrefix}${file.name}`,
          type,
          scope,
          saveMode: String(parsed?.saveMode || ""),
          groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
        });
      } catch {
        // noop
      }
    }

    return results.sort((a, b) =>
      a.label.localeCompare(b.label, "ja", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  } catch {
    return [];
  }
}

async function listUserTemplates(type, options = {}) {
  const globalDir = await getUserTemplateDir(type, { scope: "global" });
  const workDir = await getUserTemplateDir(type, {
    scope: "work",
    workDir: options?.workDir,
  });
  const globalTemplates = await listTemplatesInDir(
    type,
    globalDir,
    "global",
    "user:global:",
  );
  const sameDirectory = globalDir && workDir && path.resolve(globalDir) === path.resolve(workDir);
  const workTemplates = sameDirectory
    ? []
    : await listTemplatesInDir(type, workDir, "work", "user:work:");
  return [...workTemplates, ...globalTemplates].sort((a, b) =>
    a.label.localeCompare(b.label, "ja", { numeric: true, sensitivity: "base" }),
  );
}

function parseTemplateId(templateId) {
  const value = String(templateId || "");
  if (value.startsWith("user:work:")) {
    return { scope: "work", fileName: value.slice("user:work:".length) };
  }
  if (value.startsWith("user:global:")) {
    return { scope: "global", fileName: value.slice("user:global:".length) };
  }
  if (value.startsWith("user:")) {
    return { scope: "global", fileName: value.slice("user:".length) };
  }
  return null;
}

async function getUserTemplateById(type, templateId, options = {}) {
  const parsedId = parseTemplateId(templateId);
  if (!parsedId) return null;
  const fileName = parsedId.fileName;
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) return null;
  const dir = await getUserTemplateDir(type, { ...options, scope: parsedId.scope });
  if (!dir) return null;

  const filePath = path.join(dir, fileName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

async function deleteUserTemplateById(type, templateId, options = {}) {
  const parsedId = parseTemplateId(templateId);
  if (!parsedId) return false;
  const fileName = parsedId.fileName;
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return false;
  }

  const dir = await getUserTemplateDir(type, { ...options, scope: parsedId.scope });
  if (!dir) return false;

  const filePath = path.join(dir, fileName);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  saveUserTemplate,
  saveUserGroupTemplate,
  listUserTemplates,
  getUserTemplateById,
  deleteUserTemplateById,
};
