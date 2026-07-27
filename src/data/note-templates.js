const {
  listUserTemplates,
  getUserTemplateById,
} = require("./user-note-templates");

function createGroup(title = "", items = []) {
  return {
    title,
    items,
  };
}

function createDivider(label = "", value = "") {
  return {
    kind: "divider",
    label,
    value,
  };
}

function createEntry(heading = "", body = "") {
  return {
    kind: "entry",
    heading,
    body,
  };
}

const PLOT_TEMPLATES = [
  {
    id: "kishotenketsu",
    label: "起承転結",
    type: "plot",
    groups: [
      createGroup("起"),
      createGroup("承"),
      createGroup("転"),
      createGroup("結"),
    ],
  },
  {
    id: "johakyu",
    label: "序破急",
    type: "plot",
    groups: [createGroup("序"), createGroup("破"), createGroup("急")],
  },
];

const REFERENCE_TEMPLATES = [
  {
    id: "character-basic",
    label: "キャラクター資料",
    type: "reference",
    groups: [
      createGroup("キャラクター", [
        createDivider("名前", ""),
        createEntry("概要", ""),
        createEntry("外見", ""),
        createEntry("性格", ""),
        createEntry("生い立ち", ""),
      ]),
    ],
  },
  {
    id: "world-basic",
    label: "世界観資料",
    type: "reference",
    groups: [
      createGroup("舞台", [createDivider("地名", "")]),
      createGroup("世界観"),
      createGroup("用語"),
    ],
  },
];

function getTemplatesByType(type) {
  return type === "plot" ? PLOT_TEMPLATES : REFERENCE_TEMPLATES;
}

async function getTemplateItems(type) {
  const builtIn = getTemplatesByType(type).map((tpl) => ({
    label: tpl.label,
    description: "内蔵テンプレート",
    templateId: tpl.id,
    type: tpl.type,
    groups: Array.isArray(tpl.groups) ? tpl.groups : [],
  }));

  const userTemplates = await listUserTemplates(type);

  return [...builtIn, ...userTemplates];
}

async function getTemplateById(type, templateId) {
  if (String(templateId || "").startsWith("user:")) {
    return await getUserTemplateById(type, templateId);
  }

  return getTemplatesByType(type).find((tpl) => tpl.id === templateId) || null;
}

module.exports = {
  getTemplateItems,
  getTemplateById,
};
