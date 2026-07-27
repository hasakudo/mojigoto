const fs = require("fs");
const path = require("path");

function normSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function detectChapterFromRoot(root, filePath) {
  const normalizedRoot = normSlash(root).toLowerCase().replace(/\/+$/, "");
  const normalizedFile = normSlash(filePath).toLowerCase();

  if (!normalizedRoot || !normalizedFile.startsWith(normalizedRoot + "/")) {
    return null;
  }

  const rest = normalizedFile.slice((normalizedRoot + "/").length);
  const first = rest.split("/")[0];

  if (first && /\.(txt|md)$/i.test(first)) {
    return "（章なし）";
  }

  return first || null;
}

function listTextFilesRecursive(dirPath, exts = [".txt"]) {
  const results = [];
  const stack = [dirPath];
  const extSet = new Set(
    (Array.isArray(exts) ? exts : [".txt"]).map((ext) =>
      String(ext || "").toLowerCase(),
    ),
  );

  while (stack.length) {
    const current = stack.pop();

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (extSet.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function safeReadTextFile(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  } catch {
    return "";
  }
}

function listTextFiles(dirPath) {
  return listTextFilesRecursive(dirPath, [".txt", ".md"]);
}

function safeRead(filePath) {
  return safeReadTextFile(filePath);
}

function detectChapter(root, filePath) {
  return detectChapterFromRoot(root, filePath);
}

module.exports = {
  normSlash,
  detectChapterFromRoot,
  listTextFilesRecursive,
  safeReadTextFile,
  listTextFiles,
  safeRead,
  detectChapter,
};
