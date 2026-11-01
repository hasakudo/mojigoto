const path = require("path");

// Work selection metadata; switching and dirty-document handling remain in the service.
function createWorkSwitchCandidates({ vscode, fs, fsp, isDirectory }) {
  function getWorkRoot() {
    // 1) 設定があればそれを優先
    const v = String(
      vscode.workspace.getConfiguration("mojigoto").get("workRoot", "") || "",
    ).trim();
    if (v) return v;
  
    // 2) 無ければ manuscriptRoot の親を推測（.../_WORK/manuscript の root）
    const mr = String(
      vscode.workspace.getConfiguration("mojigoto").get("manuscriptRoot", "") ||
        "",
    ).trim();
    if (mr) {
      const workDir = path.dirname(mr);
      const root = path.dirname(workDir);
      return root;
    }
  
    return "";
  }
  
  function getExcludeList() {
    return (
      vscode.workspace.getConfiguration("mojigoto").get("workExclude", null) || [
        ".vscode",
        "CSS",
        "node_modules",
        "publish",
        "tools",
        "_WORK",
        "docs",
        "Doc",
        "Doc(s)",
        "temp",
        "tmp",
        "dist",
        ".git",
      ]
    );
  }
  
  function getManuscriptCandidates() {
    return (
      vscode.workspace
        .getConfiguration("mojigoto")
        .get("manuscriptCandidates", null) || ["manuscript", "原稿"]
    );
  }
  
  function getPickLimit() {
    const n = Number(
      vscode.workspace.getConfiguration("mojigoto").get("workPickLimit", 20),
    );
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  }
  
  async function collectWorkCandidates(root, exclude, manuNames) {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    const cands = [];
  
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name;
  
      if (exclude.includes(name)) continue;
  
      const base = path.join(root, name);
  
      for (const m of manuNames) {
        const manuPath = path.join(base, m);
        if (await isDirectory(manuPath)) {
          let title = "";
  
          try {
            const workJsonPath = path.join(base, ".mojigoto", "work.json");
            if (fs.existsSync(workJsonPath)) {
              const raw = JSON.parse(await fsp.readFile(workJsonPath, "utf8"));
              title = String(raw?.title || "").trim();
            }
          } catch {
            // noop
          }
  
          const displayTitle = title || name;
  
          cands.push({
            label: displayTitle,
            description:
              displayTitle !== name
                ? `フォルダ名: ${name}`
                : `原稿フォルダ: ${m}`,
            detail: displayTitle !== name ? `原稿フォルダ: ${m}` : "",
            workName: name,
            manuPath,
          });
          break;
        }
      }
    }
  
    cands.sort((a, b) =>
      String(a.label || "").localeCompare(String(b.label || ""), "ja", {
        numeric: true,
        sensitivity: "base",
      }),
    );
  
    return cands;
  }
  
  
  return { getWorkRoot, getExcludeList, getManuscriptCandidates, getPickLimit, collectWorkCandidates };
}

module.exports = { createWorkSwitchCandidates };
