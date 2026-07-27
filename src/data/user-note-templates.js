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

async function getUserTemplateDir(type) {
  const ws = getWorkspaceRoot();
  if (!ws) return "";
  const dir = path.join(
    ws,
    ".mojigoto",
    "templates",
    type === "plot" ? "plot" : "reference",
  );
  await ensureDir(dir);
  return dir;
}

async function saveUserGroupTemplate(note, group, templateName, saveMode) {
  const templateNote = {
    ...note,
    groups: group ? [group] : [],
  };

  return saveUserTemplate(templateNote, templateName, saveMode);
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

async function saveUserTemplate(note, templateName, saveMode) {
  const type = String(note?.type || "plot");
  const dir = await getUserTemplateDir(type);
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
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    filePath,
    payload,
  };
}

async function listUserTemplates(type) {
  const dir = await getUserTemplateDir(type);
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
          description: "自作テンプレート",
          templateId: `user:${file.name}`,
          type,
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

async function getUserTemplateById(type, templateId) {
  if (!String(templateId || "").startsWith("user:")) return null;

  const fileName = String(templateId).slice("user:".length);
  const dir = await getUserTemplateDir(type);
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

async function deleteUserTemplateById(type, templateId) {
  if (!String(templateId || "").startsWith("user:")) {
    return false;
  }

  const fileName = String(templateId).slice("user:".length);
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return false;
  }

  const dir = await getUserTemplateDir(type);
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
