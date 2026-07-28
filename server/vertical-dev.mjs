// server/vertical-dev.mjs
// Vertical manuscript DEV server (chapter selector)
// - Root folder fixed (default: C:\your-folder\manuscript\)
// - Browser dropdown selects chapter folder (direct child)
// - Auto rebuild on save (watch)
// Node 18+ recommended (Node 20/22/24 OK)

// ===============================
// 0) Imports / Const / Config / State
// ===============================

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { URL, fileURLToPath } from "node:url";
import crypto from "node:crypto";
import verticalLayoutCore from "../src/preview/vertical-layout-core.js";

const {
  splitTextIntoDisplayLines,
  getEffectiveCharsPerLine,
  renderDisplayLineHtml,
} = verticalLayoutCore;

const DEFAULT_ROOT = process.env.Mojigoto_ROOT ?? process.cwd();
const ROOT = normalizePath(process.argv[2] ?? DEFAULT_ROOT);
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 0); // 0なら自動割当
const HOST = String(process.env.HOST ?? "127.0.0.1");

const DEBUG = process.env.Mojigoto_DEBUG === "1";
const dlog = (...args) => {
  if (DEBUG) console.log(...args);
};

// ===============================
// Utils
// ===============================
function splitGraphemes(str) {
  const seg = new Intl.Segmenter("ja", { granularity: "grapheme" });
  return Array.from(seg.segment(str), (s) => s.segment);
}

function normalizePath(p) {
  // Accept quotes
  p = String(p).replace(/^"(.*)"$/, "$1");
  // Normalize slashes
  return path.resolve(p);
}

function resolvePreviewImagePath(fileName) {
  const candidates = [
    path.join(path.dirname(SERVER_DIR), "images", fileName),
    path.join(process.cwd(), "images", fileName),
    path.join(ROOT, "images", fileName),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
}

function sendPreviewImage(res, filePath, contentType) {
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.end(fs.readFileSync(filePath));
}

function sha1(s) {
  return crypto.createHash("sha1").update(s, "utf8").digest("hex");
}

function escapeHtml(s) {
  s = String(s ?? "");
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fileKey(p){
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

function escapeAttr(s){
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const ROOT_CFG_FILE = ".mojigoto.json";
const SETTINGS_PATH = path.join(ROOT, ROOT_CFG_FILE);

function readRootConfig() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return null;
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (e) {
    console.warn("[mojigoto] read .mojigoto.json failed:", e?.message ?? String(e));
    return null;
  }
}

function writeRootConfig(obj) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (e) {
    console.warn("[mojigoto] write .mojigoto.json failed:", e?.message ?? String(e));
    return false;
  }
}

ensureRoot(ROOT);

// =============== Config / Typesetting ===============
const DEFAULT_COLS  = Number(process.env.Mojigoto_COLS  ?? 42); // 字数
const DEFAULT_LINES = Number(process.env.Mojigoto_LINES ?? 16); // 行数

const LIMITS = {
  fontSizePx: { min: 10, max: 20 },
  charsPerLine: { min: 1, max: 65 },
  linesPerPage: { min: 1, max: 60 },
  lineAdvanceEm: { min: 0.9, max: 1.6 },
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(value, min, max, fallback) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

const CFG = {
  charsPerLine: DEFAULT_COLS,
  linesPerPage: DEFAULT_LINES,

  basePt: 10.0,
  fontSizePx: 16,
  colGapPx: 6,
  pagePaddingPx: 22,
  pageGapPx: 28,
  lineAdvanceEm: 1.1,
  theme: "light",
  verticalPunctuationLayout: "hanging",
  useTypographyAdjustments: false,

  fontFamily: `"Source Han Serif JP","Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif`,

  // 禁則処理
  kinsokuLineStart: new Set(
    splitGraphemes("、。，．？！）〕］｝〉》」』】､｡,.?!)]}｣ﾞﾟ〟〵」"),
  ),
  kinsokuLineEnd: new Set(splitGraphemes("（〔［｛〈《「『【([{｢〝〳〴")),

  joinAfterNewline: new Set(
    splitGraphemes("、。，．）〕］｝〉》」』】､｡,.?!)]}｣ﾞﾟ〟〵」"),
  ),
  exclaimLike: new Set(splitGraphemes("？！?!")),

  // ぶら下げ
  hangOutSet: new Set(
    splitGraphemes("、。，．）〕］｝〉》」』】､｡,.?!)]}｣ﾞﾟ〟〵」』）】"),
  ),

  // 見出し
  heading: {
    h1: {
      pt: 12,
      bold: true,
      beforeP: 2,
      afterP: 10,
      indentP: 0,
      pageBreakBefore: true,
    },
    h2: {
      pt: 10,
      bold: false,
      beforeP: 10,
      afterP: 10,
      indentP: 10,
      pageBreakBefore: false,
    },
    h3: {
      pt: 9,
      bold: false,
      beforeP: 15,
      afterP: 15,
      indentP: 10,
      pageBreakBefore: false,
    },
  },
};

const CHAP_ROOT = "（章なし）";

// =============== State ===============
const state = {
  root: ROOT,
  selectedChapter: "", // folder name
  chapters: [],
  lastBuildAt: 0,
  lastHash: "",
  buildSeq: 0,
  sseClients: new Set(), // res objects
};

// --- load persisted config ---
const saved = readRootConfig();

if (saved?.layout) {
  const c = Number(saved.layout.charsPerLine);
  const l = Number(saved.layout.linesPerPage);

  if (Number.isFinite(c)) {
    CFG.charsPerLine = clampInt(
      c,
      LIMITS.charsPerLine.min,
      LIMITS.charsPerLine.max,
      CFG.charsPerLine,
    );
  }

  if (Number.isFinite(l)) {
    CFG.linesPerPage = clampInt(
      l,
      LIMITS.linesPerPage.min,
      LIMITS.linesPerPage.max,
      CFG.linesPerPage,
    );
  }
}

if (saved?.font) {
  const s = Number(saved.font.sizePx);
  const f = String(saved.font.family ?? "").trim();

  if (Number.isFinite(s)) {
    CFG.fontSizePx = clampInt(
      s,
      LIMITS.fontSizePx.min,
      LIMITS.fontSizePx.max,
      CFG.fontSizePx,
    );
  }

  if (f) CFG.fontFamily = f;
}

if (saved?.spacing) {
  const v = Number(saved.spacing.lineAdvanceEm);
  if (Number.isFinite(v)) {
    CFG.lineAdvanceEm = clampNumber(
      v,
      LIMITS.lineAdvanceEm.min,
      LIMITS.lineAdvanceEm.max,
      CFG.lineAdvanceEm,
    );
  }
}

if (saved?.theme) CFG.theme = String(saved.theme);

if (saved?.verticalPunctuationLayout) {
  const mode = String(saved.verticalPunctuationLayout || "").trim();
  CFG.verticalPunctuationLayout = mode === "pushout" ? "pushout" : "hanging";
}

if (typeof saved?.useTypographyAdjustments === "boolean") {
  CFG.useTypographyAdjustments = saved.useTypographyAdjustments;
}

refreshChapters();
if (!state.selectedChapter && state.chapters.length)
  state.selectedChapter = state.chapters[0];

function ensureRoot(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Root folder not found: ${p}`);
  }
  if (!fs.statSync(p).isDirectory()) {
    throw new Error(`Root is not a directory: ${p}`);
  }
}

function setLayout(charsPerLine, linesPerPage) {
  const cIn = Number(charsPerLine);
  const lIn = Number(linesPerPage);

  let changed = false;

  if (Number.isFinite(cIn)) {
    const c = clampInt(
      cIn,
      LIMITS.charsPerLine.min,
      LIMITS.charsPerLine.max,
      CFG.charsPerLine,
    );

    if (CFG.charsPerLine !== c) {
      CFG.charsPerLine = c;
      changed = true;
    }
  }

  if (Number.isFinite(lIn)) {
    const l = clampInt(
      lIn,
      LIMITS.linesPerPage.min,
      LIMITS.linesPerPage.max,
      CFG.linesPerPage,
    );

    if (CFG.linesPerPage !== l) {
      CFG.linesPerPage = l;
      changed = true;
    }
  }

  if (!changed) return false;

  const cur = readRootConfig() || {};
  cur.layout = {
    charsPerLine: CFG.charsPerLine,
    linesPerPage: CFG.linesPerPage,
  };
  writeRootConfig(cur);
  return true;
}

function setFont(sizePx, family) {
  const sIn = Number(sizePx);
  const fam = String(family ?? "").trim();

  let changed = false;

  if (Number.isFinite(sIn)) {
    const s = clampInt(
      sIn,
      LIMITS.fontSizePx.min,
      LIMITS.fontSizePx.max,
      CFG.fontSizePx,
    );

    if (CFG.fontSizePx !== s) {
      CFG.fontSizePx = s;
      changed = true;
    }
  }

  if (fam) {
    if (CFG.fontFamily !== fam) {
      CFG.fontFamily = fam;
      changed = true;
    }
  }

  if (!changed) return false;

  const cur = readRootConfig() || {};
  cur.font = {
    sizePx: CFG.fontSizePx,
    family: CFG.fontFamily,
  };
  writeRootConfig(cur);
  return true;
}

function setLineAdvance(lineAdvanceEm) {
  const vIn = Number(lineAdvanceEm);
  if (!Number.isFinite(vIn)) return false;

  const v = clampNumber(
    vIn,
    LIMITS.lineAdvanceEm.min,
    LIMITS.lineAdvanceEm.max,
    CFG.lineAdvanceEm,
  );

  if (CFG.lineAdvanceEm === v) return false;

  CFG.lineAdvanceEm = v;

  const cur = readRootConfig() || {};
  cur.spacing = {
    ...(cur.spacing || {}),
    lineAdvanceEm: CFG.lineAdvanceEm,
  };
  writeRootConfig(cur);
  return true;
}

function setTheme(theme){
  const t = String(theme || "").trim();
  if (!t) return false;
  if (CFG.theme === t) return false;

  CFG.theme = t;
  const cur = readRootConfig() || {};
  cur.theme = CFG.theme;
  writeRootConfig(cur);
  return true;
}

function setVerticalPunctuationLayout(mode) {
  const next = String(mode || "").trim() === "pushout" ? "pushout" : "hanging";
  if (CFG.verticalPunctuationLayout === next) return false;

  CFG.verticalPunctuationLayout = next;
  const cur = readRootConfig() || {};
  cur.verticalPunctuationLayout = CFG.verticalPunctuationLayout;
  writeRootConfig(cur);
  return true;
}

function applySettingsPatch(data = {}) {
  const cur = readRootConfig() || {};

  let changed = false;

  const layout = data.layout || {};
  const font = data.font || {};
  const spacing = data.spacing || {};

  if (layout.charsPerLine || layout.linesPerPage) {
    const cIn = Number(layout.charsPerLine);
    const lIn = Number(layout.linesPerPage);

    if (Number.isFinite(cIn)) {
      const c = clampInt(
        cIn,
        LIMITS.charsPerLine.min,
        LIMITS.charsPerLine.max,
        CFG.charsPerLine,
      );

      if (CFG.charsPerLine !== c) {
        CFG.charsPerLine = c;
        changed = true;
      }
    }

    if (Number.isFinite(lIn)) {
      const l = clampInt(
        lIn,
        LIMITS.linesPerPage.min,
        LIMITS.linesPerPage.max,
        CFG.linesPerPage,
      );

      if (CFG.linesPerPage !== l) {
        CFG.linesPerPage = l;
        changed = true;
      }
    }

    cur.layout = {
      charsPerLine: CFG.charsPerLine,
      linesPerPage: CFG.linesPerPage,
    };
  }

  if (font.sizePx || font.family) {
    const sIn = Number(font.sizePx);
    const fam = String(font.family ?? "").trim();

    if (Number.isFinite(sIn)) {
      const s = clampInt(
        sIn,
        LIMITS.fontSizePx.min,
        LIMITS.fontSizePx.max,
        CFG.fontSizePx,
      );

      if (CFG.fontSizePx !== s) {
        CFG.fontSizePx = s;
        changed = true;
      }
    }

    if (fam) {
      if (CFG.fontFamily !== fam) {
        CFG.fontFamily = fam;
        changed = true;
      }
    }

    cur.font = {
      sizePx: CFG.fontSizePx,
      family: CFG.fontFamily,
    };
  }

  if (spacing.lineAdvanceEm) {
    const vIn = Number(spacing.lineAdvanceEm);

    if (Number.isFinite(vIn)) {
      const v = clampNumber(
        vIn,
        LIMITS.lineAdvanceEm.min,
        LIMITS.lineAdvanceEm.max,
        CFG.lineAdvanceEm,
      );

      if (CFG.lineAdvanceEm !== v) {
        CFG.lineAdvanceEm = v;
        changed = true;
      }

      cur.spacing = {
        ...(cur.spacing || {}),
        lineAdvanceEm: CFG.lineAdvanceEm,
      };
    }
  }

  if (data.theme) {
    const t = String(data.theme || "").trim();
    if (t) {
      if (CFG.theme !== t) {
        CFG.theme = t;
        changed = true;
      }
      cur.theme = CFG.theme;
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, "verticalPunctuationLayout")) {
    const next =
      String(data.verticalPunctuationLayout || "").trim() === "pushout"
        ? "pushout"
        : "hanging";

    if (CFG.verticalPunctuationLayout !== next) {
      CFG.verticalPunctuationLayout = next;
      changed = true;
    }
    cur.verticalPunctuationLayout = CFG.verticalPunctuationLayout;
  }

  if (Object.prototype.hasOwnProperty.call(data, "useTypographyAdjustments")) {
    const next = data.useTypographyAdjustments !== false;
    if (CFG.useTypographyAdjustments !== next) {
      CFG.useTypographyAdjustments = next;
      changed = true;
    }
    cur.useTypographyAdjustments = CFG.useTypographyAdjustments;
  }

  writeRootConfig(cur);

  console.log("[settings applied]", {
    verticalPunctuationLayout: CFG.verticalPunctuationLayout,
    useTypographyAdjustments: CFG.useTypographyAdjustments,
    configPath: SETTINGS_PATH,
  });
  return changed;
}

// ===============================
// A) Chapter Model (chapters & input)
// ===============================

function hasRootTextFiles() {
  const exts = new Set([".txt", ".md"]);
  try {
    return fs.readdirSync(state.root, { withFileTypes: true })
      .some(d => d.isFile() && exts.has(path.extname(d.name).toLowerCase()));
  } catch {
    return false;
  }
}

function refreshChapters() {
  const dirs = fs.readdirSync(state.root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" }));

  const chaps = [];
  if (hasRootTextFiles()) chaps.push(CHAP_ROOT);
  chaps.push(...dirs);

  state.chapters = chaps;
}

function chapterFromFile(filePath) {
  try {
    const abs = normalizePath(filePath);
    const rel = path.relative(state.root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return "";

    const first = rel.split(path.sep)[0] || "";
    // root直下のファイルなら擬似章へ
    if (first && /\.[a-z0-9]+$/i.test(first)) {
      return hasRootTextFiles() ? CHAP_ROOT : "";
    }
    return first;
  } catch {
    return "";
  }
}

function getSelectedChapterPath() {
  if (!state.selectedChapter) return "";

  if (state.selectedChapter === CHAP_ROOT) {
    return state.root; // root直下を章として扱う
  }

  const p = path.join(state.root, state.selectedChapter);
  if (!fs.existsSync(p)) return "";
  if (!fs.statSync(p).isDirectory()) return "";
  return p;
}

function listTextFiles(dir) {
  const exts = new Set([".txt", ".md"]);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && exts.has(path.extname(d.name).toLowerCase()))
    .map(d => path.join(dir, d.name))
    .sort((a, b) => a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" }));
}

function readText(p) {
  return fs.readFileSync(p, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function readChapterInput(chapterDir) {
  const files = listTextFiles(chapterDir);
  if (!files.length) return "";

  const chunks = files.map((f) => {
    const name = path.basename(f);
    const body = readText(f).trimEnd(); // ファイル末尾の余計な改行だけ落とす

    // ★ marker は必ず「単独1行」 + 本文はその次行から
    return `<<FILE:${f}||${name}>>\n${body}`;
  });

  // ★ファイル間は「改行1つ」で連結（空行は増やさない）
  return chunks.join("\n");
}

// ===============================
// B) Server (routes & SSE)
// ===============================

// =============== Server ===============
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const pathname = url.pathname;

    // local fetch 向け（なくてもOK）
    res.setHeader("Cache-Control", "no-store");

    // ---------- preview icons ----------
    if (pathname === "/images/mojigoto.png") {
      sendPreviewImage(res, resolvePreviewImagePath("mojigoto.png"), "image/png");
      return;
    }

    if (pathname === "/favicon.ico" || pathname === "/images/mojigoto.ico") {
      const icoPath = resolvePreviewImagePath("mojigoto.ico");
      const iconPath = icoPath || resolvePreviewImagePath("mojigoto.png");
      sendPreviewImage(res, iconPath, icoPath ? "image/x-icon" : "image/png");
      return;
    }

    // ---------- pages ----------
    if (pathname === "/" || pathname === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderIndexHtml());
      return;
    }

    if (pathname === "/vertical-preview.html") {
      const outPath = path.join(state.root, "vertical-preview.html");
      let html = "";
      try {
        html = buildSelectedChapterHtml();
        if (html) {
          try { fs.writeFileSync(outPath, html, "utf8"); } catch {}
        }
      } catch (e) {
        console.warn("[vertical-preview render on demand]", e?.message ?? String(e));
      }
      if (!html && fs.existsSync(outPath)) {
        try { html = fs.readFileSync(outPath, "utf8"); } catch {}
      }
      if (!html) {
        res.statusCode = 404;
        res.end("vertical-preview.html not found yet");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    } 

    // ---------- api ----------
    if (pathname === "/api/live-preview") {
      const chapPath = getSelectedChapterPath();
      if (!chapPath) {
        res.statusCode = 404;
        res.end("no chapter");
        return;
      }

      const combined = readChapterInput(chapPath);
      const html = buildVerticalPreviewHtml(combined);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    if (pathname === "/api/chapters") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          root: state.root,
          chapters: state.chapters,
          selected: state.selectedChapter,
          lastBuildAt: state.lastBuildAt,
          buildSeq: state.buildSeq,
          theme: CFG.theme,
          verticalPunctuationLayout: CFG.verticalPunctuationLayout,
          useTypographyAdjustments: CFG.useTypographyAdjustments,
          layout: {
            charsPerLine: CFG.charsPerLine,
            linesPerPage: CFG.linesPerPage,
          },
          font: {
            sizePx: CFG.fontSizePx,
            family: CFG.fontFamily,
          },
          spacing: {
            lineAdvanceEm: CFG.lineAdvanceEm,
          },
        }),
      );
      return;
    }

    if (pathname === "/api/layout" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body) || {};

      const changed = setLayout(data.charsPerLine, data.linesPerPage);

      if (changed) {
        state.lastHash = "";
        await buildSelectedChapter();
        notifyReload({
          reason: "layout-changed",
          layout: { charsPerLine: CFG.charsPerLine, linesPerPage: CFG.linesPerPage },
          seq: state.buildSeq
        });
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok: changed,
        layout: { charsPerLine: CFG.charsPerLine, linesPerPage: CFG.linesPerPage },
      }));
      return;
    }

    if (pathname === "/api/settings" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body) || {};

      console.log("[settings body]", data);

      const changed = applySettingsPatch(data);

      if (changed) {
        state.lastHash = "";
        await buildSelectedChapter();
        notifyReload({
          reason: "settings-changed",
          layout: {
            charsPerLine: CFG.charsPerLine,
            linesPerPage: CFG.linesPerPage,
          },
          font: { sizePx: CFG.fontSizePx, family: CFG.fontFamily },
          spacing: { lineAdvanceEm: CFG.lineAdvanceEm },
          theme: CFG.theme,
          verticalPunctuationLayout: CFG.verticalPunctuationLayout,
          useTypographyAdjustments: CFG.useTypographyAdjustments,
          seq: state.buildSeq,
        });
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          changed,
          theme: CFG.theme,
          verticalPunctuationLayout: CFG.verticalPunctuationLayout,
          useTypographyAdjustments: CFG.useTypographyAdjustments,
          layout: {
            charsPerLine: CFG.charsPerLine,
            linesPerPage: CFG.linesPerPage,
          },
          font: { sizePx: CFG.fontSizePx, family: CFG.fontFamily },
          spacing: { lineAdvanceEm: CFG.lineAdvanceEm },
        }),
      );
      return;
    }

    // VSCode: open file -> auto chapter switch
    if (pathname === "/api/vscode/open" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body);
      const filePath = String(data?.file ?? "");
      const chap = chapterFromFile(filePath);

      dlog("[vscode/open]", filePath);
      dlog("[vscode/open] -> chap:", chap);
      dlog("[vscode/open] selected before:", state.selectedChapter);

      if (chap && state.chapters.includes(chap) && chap !== state.selectedChapter) {
        state.selectedChapter = chap;
        setupChapterWatcher();
        state.lastHash = "";
        await buildSelectedChapter();
        notifyReload({ reason: "vscode-open", chapter: state.selectedChapter, seq: state.buildSeq });
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
         ok: true, selected: state.selectedChapter ,
        layout: { charsPerLine: CFG.charsPerLine, linesPerPage: CFG.linesPerPage },
        font: { sizePx: CFG.fontSizePx, family: CFG.fontFamily }
      }));
      return;
    }

    // VSCode: cursor move -> notify only
    if (pathname === "/api/vscode/cursor" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body);
      const filePath = String(data?.file ?? "");
      const line = Math.max(1, Number(data?.line ?? 1));

      notifyReload({ reason: "vscode-cursor", file: filePath, line });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // VSCode: editor scroll -> notify only
    if (pathname === "/api/vscode/scroll" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body);
      const filePath = String(data?.file ?? "");
      const line = Math.max(1, Number(data?.line ?? 1));

      notifyReload({ reason: "vscode-scroll", file: filePath, line });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Browser: chapter select (dropdown)
    if (pathname === "/api/select" && req.method === "POST") {
      const body = await readBody(req);
      const data = safeJson(body);
      const name = String(data?.chapter ?? "");

      if (!name || !state.chapters.includes(name)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "Invalid chapter" }));
        return;
      }

      state.selectedChapter = name;
      setupChapterWatcher();
      state.lastHash = "";
      await buildSelectedChapter();

      notifyReload({ reason: "chapter-selected", chapter: state.selectedChapter, seq: state.buildSeq });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, selected: state.selectedChapter }));
      return;
    }

    // ---------- sse ----------
    if (pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      state.sseClients.add(res);
      req.on("close", () => state.sseClients.delete(res));
      return;
    }

    // ---------- fallback ----------
    res.statusCode = 404;
    res.end("Not found");
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(String(e?.stack || e));
  }
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const realPort = (addr && typeof addr === "object") ? addr.port : PORT;

  // ★拡張が拾う1行（これが重要）
  console.log(`[mojigoto] ready http://${HOST}:${realPort}/`);

  dlog(`Vertical DEV: http://${HOST}:${realPort}/`);
  dlog(`ROOT: ${state.root}`);
  dlog(`Selected: ${state.selectedChapter || "(none)"}`);
});

// =============== UI ===============
function renderIndexHtml() {
  // Minimal shell that loads the preview in an iframe and provides chapter dropdown
  return `<!doctype html>
    <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <link rel="icon" type="image/png" href="/images/mojigoto.png" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <title>もじごと：縦書きプレビュー</title>
      <style>
        :root {
          color-scheme: light;
          --ui-bg: #f4f4f4;
          --ui-panel: #ffffff;
          --ui-panel-2: #fafafa;
          --ui-text: #222;
          --ui-muted: #666;
          --ui-border: #ddd;
          --ui-shadow: rgba(0,0,0,.10);
          --ui-overlay: rgba(20,20,20,.75);
        }

        body[data-theme="light"]{
          --ui-bg: #f4f4f4;
          --ui-panel: #ffffff;
          --ui-panel-2: #fafafa;
          --ui-text: #222;
          --ui-muted: #666;
          --ui-border: #ddd;
          --ui-shadow: rgba(0,0,0,.10);
          --ui-overlay: rgba(20,20,20,.75);
        }

        body[data-theme="soft-paper"]{
          --ui-bg: #f5f2eb;
          --ui-panel: #fffdf7;
          --ui-panel-2: #f3efe6;
          --ui-text: #2d2a24;
          --ui-muted: #736b5d;
          --ui-border: #d8cfbf;
          --ui-shadow: rgba(72,58,38,.13);
          --ui-overlay: rgba(52,43,30,.36);
        }

        body[data-theme="dark"]{
          --ui-bg: #2a2b2e;
          --ui-panel: #111214;
          --ui-panel-2: #1a1b1e;
          --ui-text: #f0f0ed;
          --ui-muted: #b7b7b1;
          --ui-border: #34363a;
          --ui-shadow: rgba(0,0,0,.45);
          --ui-overlay: rgba(0,0,0,.58);
        }

        body[data-theme="navy"]{
          --ui-bg: #071426;
          --ui-panel: #0b2038;
          --ui-panel-2: #102b48;
          --ui-text: #e7f0ff;
          --ui-muted: #adc4df;
          --ui-border: #244a70;
          --ui-shadow: rgba(0,0,0,.34);
          --ui-overlay: rgba(3,10,20,.58);
        }

        body[data-theme="green"]{
          --ui-bg: #e7efe4;
          --ui-panel: #fbfff8;
          --ui-panel-2: #eef6ea;
          --ui-text: #253126;
          --ui-muted: #657563;
          --ui-border: #c6d7c0;
          --ui-shadow: rgba(40,70,45,.13);
          --ui-overlay: rgba(28,52,32,.34);
        }

        body[data-theme="deep-green"]{
          --ui-bg: #0d1c17;
          --ui-panel: #13251f;
          --ui-panel-2: #1b332a;
          --ui-text: #e5f2e5;
          --ui-muted: #b2c9b4;
          --ui-border: #315845;
          --ui-shadow: rgba(0,0,0,.38);
          --ui-overlay: rgba(0,10,6,.58);
        }

        body[data-theme="deep-brown"]{
          --ui-bg: #2d241f;
          --ui-panel: #221915;
          --ui-panel-2: #362820;
          --ui-text: #eadfce;
          --ui-muted: #c2aa90;
          --ui-border: #5a4030;
          --ui-shadow: rgba(0,0,0,.42);
          --ui-overlay: rgba(28,18,12,.62);
        }

        body[data-theme="lavender"]{
          --ui-bg: #eeeaf5;
          --ui-panel: #fbf9ff;
          --ui-panel-2: #f1edf8;
          --ui-text: #30293b;
          --ui-muted: #706780;
          --ui-border: #d6cde4;
          --ui-shadow: rgba(70,50,95,.13);
          --ui-overlay: rgba(42,32,58,.35);
        }

        body[data-theme="beige"]{
          --ui-bg: #efe7d8;
          --ui-panel: #fff8ea;
          --ui-panel-2: #f7efdf;
          --ui-text: #2a241b;
          --ui-muted: #6b6254;
          --ui-border: #d5c5a8;
          --ui-shadow: rgba(0,0,0,.12);
          --ui-overlay: rgba(40,30,10,.38);
        }

        body[data-embedded="1"] header{
          padding-right: 112px;
        }

        body[data-embedded="1"] .headerActions{
          padding-right: 8px;
        }

        @media (max-width: 900px){
          body[data-embedded="1"] header{
            padding-right: 96px;
          }
        }

        @media (max-width: 720px){
          body[data-embedded="1"] header{
            padding-right: 82px;
          }
        }

        html, body { height: 100%; }

        body{
          margin:0;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
          background: var(--ui-bg);
          color: var(--ui-text);
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        header{
          position: sticky;
          top:0;
          z-index:10;
          display:flex;
          flex-wrap: wrap;
          align-items:center;
          gap:8px 10px;
          padding:8px 10px;
          background: var(--ui-panel);
          border-bottom:1px solid var(--ui-border);
          box-shadow: 0 1px 0 rgba(0,0,0,.02);
        }

        .title{
          font-weight:700;
          margin-right: 4px;
        }

        .pill{
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:2px 10px;
          border:1px solid var(--ui-border);
          border-radius:999px;
          background: var(--ui-panel-2);
          color: var(--ui-text);
          font-size:12px;
          line-height: 1.6;
          white-space: nowrap;
        }

        .meta{
          font-size:12px;
          color: var(--ui-muted);
          white-space: nowrap;
        }

        .headerSpacer{
          flex:1 1 auto;
          min-width: 0;
        }

        #now{
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 0 1 auto;
        }

        .headerActions{
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap: wrap;
          justify-content:flex-end;
          margin-left:auto;
        }

        #copyUrl,
        #open,
        details.settings > summary{
          white-space: nowrap;
        }

        select, button, input{
          font: inherit;
          color: var(--ui-text);
        }

        select, button{
          padding:6px 10px;
          border:1px solid var(--ui-border);
          border-radius:8px;
          background: var(--ui-panel);
        }

        button{
          cursor:pointer;
          font-size:12px;
        }

        .btn{
          padding:6px 8px;
          border:1px solid var(--ui-border);
          border-radius:8px;
          font-size:12px;
          background: var(--ui-panel);
        }

        #resetNumbers{
          margin-right:auto;
        }

        main{
          flex: 1 1 auto;
          padding-bottom: 0.25em;
          min-height: 0;
        }

        iframe{
          width: 100%;
          height: 100%;
          border: none;
          background: transparent;
        }

        details.settings {
          position: relative;
        }

        details.settings > summary{
          cursor:pointer;
          user-select:none;
          list-style:none;
        }

        details.settings > summary::-webkit-details-marker{
          display:none;
        }

        details.settings[open] .settings-grid{
          position: fixed;
          top: 56px;
          right: 12px;
          left: auto;
          width: min(720px, calc(100vw - 24px));
          max-height: calc(100vh - 72px);
          overflow: auto;
          background: var(--ui-panel);
          color: var(--ui-text);
          border:1px solid var(--ui-border);
          border-radius: 12px;
          box-shadow: 0 8px 24px var(--ui-shadow);
          padding: 10px;
          z-index: 9999;
        }

        .settings-grid{
          margin-top:8px;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
        }

        .settings-grid .pill{
          display:flex;
          gap:6px;
          align-items:center;
        }

        .settings-grid input,
        .settings-grid select{
          font: inherit;
          padding:6px 8px;
          border:1px solid var(--ui-border);
          border-radius:8px;
          background: var(--ui-panel);
          color: var(--ui-text);
          width: 100%;
          min-width: 0;
        }

        .settings-panel-head{
          width:100%;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding:2px 2px 8px;
          border-bottom:1px solid var(--ui-border);
          margin-bottom:2px;
        }

        .settings-panel-head strong{
          font-size:13px;
          color:var(--ui-text);
        }

        #closeSettings{
          flex:0 0 auto;
        }

        .settings-actions{
          width:100%;
          display:flex;
          justify-content:flex-end;
          gap:8px;
        }

        .settings-notes{
          margin-top: 6px;
          font-size: 12px;
          color: var(--ui-muted);
          line-height: 1.4;
          width:100%;
        }

        .settings-notes .note{
          margin-top: 4px;
        }

        .settings-row-break{
          flex-basis: 100%;
          height: 0;
        }

        .settings-wide{
          flex: 1 1 320px;
        }

        #fontFamily{
          width: 380px;
          max-width: 60vw;
        }

        .preview-wrap{
          position:relative;
        }

        #frame{
          width:100%;
          height:100%;
          border:0;
        }

        #preview-loading{
          position:absolute;
          inset:0;
          display:flex;
          align-items:center;
          justify-content:center;
          background: var(--ui-overlay);
          color:#fff;
          font-size:14px;
          opacity:0;
          pointer-events:none;
          backdrop-filter: blur(2px);
          transition:opacity .15s;
        }

        #preview-loading.is-active{
          opacity:1;
        }

        @media (max-width: 900px){
          .title{
            display:none;
          }

          #fontFamily{
            max-width: 100%;
            width: 100%;
          }

          details.settings[open] .settings-grid{
            left: 12px;
            right: 12px;
            width: auto;
          }
        }

        @media (max-width: 720px){
          header{
            display:grid;
            grid-template-columns: auto 1fr auto;
            grid-template-areas:
              "chapter . meta"
              "now . actions";
            align-items:center;
            column-gap:10px;
            row-gap:8px;
          }

          .headerSpacer{
            display:none;
          }

          .chapterWrap{
            grid-area: chapter;
            justify-self:start;
            align-self:center;
            min-width: 0;
          }

          .meta{
            grid-area: meta;
            justify-self:end;
            align-self:center;
            width:auto;
            margin-right: 8px;
            white-space: nowrap;
          }

          #now{
            grid-area: now;
            justify-self:start;
            align-self:center;
            width: fit-content;
            max-width: 420px;
            min-width: 0;
          }

          .headerActions{
            grid-area: actions;
            justify-self:end;
            align-self:center;
            width:auto;
            margin-left:0;
            justify-content:flex-end;
            flex-wrap:nowrap;
          }
        }

        @media (max-width: 600px){
          header{
            display:grid;
            grid-template-columns: 1fr auto;
              "chapter . meta"
              "now . actions";
            gap:8px;
          }

          .chapterWrap {
            min-width: 0;
            max-width: 250px;
          }

          .chapterWrap select{
            max-width: min(100%, 220px);
          }

          .meta{
            grid-area: meta;
            width:auto;
            justify-self: end;
            white-space: nowrap;
          }

          #now{
            grid-area: now;
            width: auto;
            min-width: 0;
            justify-self: start;
          }

          .headerActions{
            grid-area: actions;
            width: 100%;
            justify-content:flex-end;
            flex-wrap: wrap;
          }

          #open{
            padding:6px 8px;
          }
        }
      </style>
    </head>
    <body>
      <header>
        <div class="title">縦書きプレビュー</div>

        <label class="pill chapterWrap">章：
          <select id="chapter"></select>
        </label>

        <span class="pill" id="now"></span>
        <span class="meta" id="meta"></span>

        <div class="headerSpacer"></div>

        <div class="headerActions">
          <details class="settings">
            <summary class="btn">設定</summary>
            <div class="settings-grid">
              <div class="settings-panel-head">
                <strong>プレビュー設定</strong>
                <button id="closeSettings" class="btn" type="button">閉じる</button>
              </div>
              <label class="pill">字数：
                <input id="chars" type="number" min="1" max="65" step="1">
              </label>

              <label class="pill">行数：
                <input id="lines" type="number" min="1" max="60" step="1">
              </label>

              <label class="pill">フォントサイズ(px)：
                <input id="fontSize" type="number" min="10" max="20" step="1">
              </label>

              <label class="pill">行送り(em)：
                <input id="lineAdvance" type="number" min="0.9" max="1.6" step="0.01">
              </label>

              <div class="settings-row-break"></div>

              <label class="pill">フォント：
                <select id="fontPreset">
                  <option value="">（プリセット）</option>
                  <option value='"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","Source Han Serif JP",serif'>明朝（標準）</option>
                  <option value='"Noto Serif JP","Source Han Serif JP",serif'>Noto Serif 優先</option>
                  <option value='serif'>serif（汎用）</option>
                  <option value='"Yu Gothic","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif'>ゴシック（標準）</option>
                  <option value='sans-serif'>sans-serif（汎用）</option>
                </select>
              </label>

              <label class="pill">自由入力：
                <input id="fontFamily" type="text" placeholder='"Yu Mincho", serif'>
              </label>
              
              <label class="pill">体裁調整を使う：
                <input id="useTypographyAdjustments" type="checkbox">
              </label>

              <label class="pill">体裁：
                <select id="verticalPunctuationLayout">
                  <option value="hanging">ぶら下げ</option>
                  <option value="pushout">追い込み</option>
                </select>
              </label>

              <label class="pill">配色：
                <select id="theme">
                  <option value="light">白</option>
                  <option value="soft-paper">やわらかい紙色</option>
                  <option value="green">グリーン</option>
                  <option value="lavender">淡いパープル</option>
                  <option value="beige">ベージュ</option>
                  <option value="dark">黒</option>
                  <option value="navy">ダークブルー</option>
                  <option value="deep-green">深緑</option>
                  <option value="deep-brown">濃茶</option>
                </select>
              </label>

              <div class="settings-notes">
                <div class="note">禁則：行頭/行末 + 句読点の枠外ぶら下げ</div>
                <div class="note">体裁：閉じ記号 + ！？ ぶら下げは 追い出し / 追い込みは前行末</div>
                <div class="note">見出し：# は改ページ / ## 後ろに空行1つ / ### 前後に空行1行ずつ</div>
                <div class="note">設定：Esc またはヘッダークリックでも閉じる</div>
              </div>
              <div class="settings-actions">
                <button id="resetNumbers" type="button">数値をリセット</button>
                <button id="apply" type="button">反映</button>
              </div>
            </div>
          </details>
          <button id="copyUrl">URLをコピー</button>
          <button id="open">新規タブで開く</button>
        </div>
      </header>
      <main class="preview-wrap">

        <iframe id="frame" src="/vertical-preview.html"></iframe>

        <div id="preview-loading">
          更新中…
        </div>

      </main>
      <script>
        (function(){
          if (window !== window.top) {
            document.body.setAttribute("data-embedded", "1");
          } else {
            document.body.setAttribute("data-embedded", "0");
          }

          var $loading = document.getElementById("preview-loading");
          let reloadTimer = null;

          function reloadFrame(){

            if (reloadTimer) clearTimeout(reloadTimer);

            reloadTimer = setTimeout(()=>{

              if ($loading) {
                $loading.classList.add("is-active");
              }

              const url = "/vertical-preview.html?ts=" + Date.now();

              const onLoad = () => {

                $frame.removeEventListener("load", onLoad);

                // 初回起動時は、カーソル通知が本文iframeの読込完了より
                // 先に届くことがある。読込後に最後の同期位置を再送する。
                if (lastCursor) {
                  setTimeout(function(){ postCursorToFrame(lastCursor); }, 0);
                } else if (lastEditorScroll) {
                  setTimeout(function(){ postEditorScrollToFrame(lastEditorScroll); }, 0);
                }

                setTimeout(()=>{
                  if ($loading) $loading.classList.remove("is-active");
                },1200);

              };

              $frame.addEventListener("load", onLoad);

              $frame.src = url;

            },150);

          }
          // --- settings: click outside to close ---
          var $settings = document.querySelector("details.settings");
          document.addEventListener("click", function (e) {
            if (!$settings) return;
            if (!$settings.open) return;
            if ($settings.contains(e.target)) return; // inside -> keep open
            $settings.open = false; // outside -> close
          }, true);

          // Escでも閉じる（任意）
          document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && $settings && $settings.open) $settings.open = false;
          });

          var $chapter = document.getElementById("chapter");
          var $frame   = document.getElementById("frame");
          var $meta    = document.getElementById("meta");
          var $open    = document.getElementById("open");
          var $copyUrl = document.getElementById("copyUrl");

          function api(path, opts){
            return fetch(path, opts).then(function(res){
              if(!res.ok) return res.text().then(function(t){ throw new Error(t); });
              return res.json();
            });
          }

          function setMeta(data){
            var dt = data.lastBuildAt ? new Date(data.lastBuildAt) : null;
            $meta.textContent = dt ? ("更新: " + dt.toLocaleString()) : "";
          }

          let metaFlashTimer = null;

          function flashMeta(message, ms = 2200){
            if (metaFlashTimer) clearTimeout(metaFlashTimer);
            $meta.textContent = message;
            metaFlashTimer = setTimeout(function(){
              refresh().catch(function(){});
            }, ms);
          }

          function applyIndexTheme(theme){
            const t = String(theme || "light").trim();
            document.body.setAttribute("data-theme", t || "light");
          }

          function applyDefaultNumberSettings() {
            $chars.value = 42;
            $lines.value = 16;
            $fontSize.value = 17;
            $lineAdvance.value = 1.1;
          }

          var $chars = document.getElementById("chars");
          var $lines = document.getElementById("lines");
          var $fontSize = document.getElementById("fontSize");
          var $lineAdvance = document.getElementById("lineAdvance");
          var $fontFamily = document.getElementById("fontFamily");
          var $theme = document.getElementById("theme");
          var $verticalPunctuationLayout = document.getElementById("verticalPunctuationLayout");
          var $useTypographyAdjustments = document.getElementById("useTypographyAdjustments");
          var $resetNumbers = document.getElementById("resetNumbers");
          var $apply = document.getElementById("apply");

          var $closeSettings = document.getElementById("closeSettings");

          if ($closeSettings) {
            $closeSettings.addEventListener("click", function () {
              if ($settings) $settings.open = false;
            });
          }

          $apply.addEventListener("click", function(){
            var cols  = Number($chars.value || 0);
            var lines = Number($lines.value || 0);
            var size  = Number($fontSize.value || 0);
            var lineAdvance = Number($lineAdvance.value || 0);
            var fam   = String($fontFamily.value || "");
            var punctuationLayout = ($verticalPunctuationLayout && $verticalPunctuationLayout.value) || "hanging";
            var useTypographyAdjustments = !$useTypographyAdjustments || $useTypographyAdjustments.checked;

            api("/api/settings", {
              method:"POST",
              headers: {"Content-Type":"application/json"},
              body: JSON.stringify({
                layout: { charsPerLine: cols, linesPerPage: lines },
                font: { sizePx: size, family: fam },
                theme: ($theme && $theme.value) || "light",
                spacing: { lineAdvanceEm: lineAdvance },
                verticalPunctuationLayout: punctuationLayout,
                useTypographyAdjustments: useTypographyAdjustments,
              })
            }).then(function(){
              applyIndexTheme(($theme && $theme.value) || "light");

              if (window !== window.top) {
                try {
                  parent.postMessage({
                    type: "set-vertical-punctuation-layout",
                    value: punctuationLayout,
                  }, "*");
                  parent.postMessage({
                    type: "set-use-typography-adjustments",
                    value: useTypographyAdjustments,
                  }, "*");
                } catch (e) {}
              }

              if ($settings) $settings.open = false;
              refresh().catch(function(){});
              reloadFrame();
            }).catch(function(err){
              $meta.textContent = "API error: " + err.message;
            });
          });

          $resetNumbers.addEventListener("click", function(){
            applyDefaultNumberSettings();
            $apply.click();
          });

          var $now = document.getElementById("now");

          function refresh(){
            return api("/api/chapters").then(function(data){
              $chapter.innerHTML = "";
              for(var i=0;i<data.chapters.length;i++){
                var name = data.chapters[i];
                var opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                if(name === data.selected) opt.selected = true;
                $chapter.appendChild(opt);
              }

              // ★現在値を入力欄へ
              if (data.layout){
                $chars.value = data.layout.charsPerLine ?? "";
                $lines.value = data.layout.linesPerPage ?? "";
              }
              if (data.font){
                $fontSize.value = data.font.sizePx ?? "";
                $fontFamily.value = data.font.family ?? "";
              }
              if (data.spacing){
                $lineAdvance.value = data.spacing.lineAdvanceEm ?? "";
              }

              if ($theme && data.theme) $theme.value = data.theme;
              applyIndexTheme(data.theme || "light");

              if ($verticalPunctuationLayout && data.verticalPunctuationLayout) {
                $verticalPunctuationLayout.value = data.verticalPunctuationLayout;
              }
              if ($useTypographyAdjustments) {
                $useTypographyAdjustments.checked = data.useTypographyAdjustments === true;
              }

              // ★いまの設定を見える化（常時）
              var l = data.layout || {};
              var f = data.font || {};
              if ($now){
                var s = data.spacing || {};
                var fontLabel = f.family
                  ? f.family.split(",")[0].replace(/"/g,"").trim()
                  : "default";

                var layoutLabel =
                  data.verticalPunctuationLayout === "pushout"
                    ? "追い込み"
                    : "ぶら下げ";
                if (data.useTypographyAdjustments === false) {
                  layoutLabel = "体裁調整OFF";
                }

                $now.textContent =
                  (l.charsPerLine || "-") + "×" + (l.linesPerPage || "-") +
                  " / " + (f.sizePx || "-") + "px" +
                  " / " + (s.lineAdvanceEm || "-") + "em" +
                  " / " + layoutLabel;
              }

              setMeta(data);
            }).catch(function(err){
              $meta.textContent = "API error: " + err.message;
              console.error("[index] /api/chapters failed", err);
            });
          }

          var $fontPreset = document.getElementById("fontPreset");
          $fontPreset.addEventListener("change", function(){
            if ($fontPreset.value) $fontFamily.value = $fontPreset.value;
          });

          $chapter.addEventListener("change", function(){
            var chap = $chapter.value;

            // iframe側：章切替フラグ
            try {
              var w = $frame.contentWindow;
              if (w && w.sessionStorage) w.sessionStorage.setItem("mojigoto_scroll_reset", "1");
            } catch(e) {}

            api("/api/select", {
              method: "POST",
              headers: {"Content-Type":"application/json"},
              body: JSON.stringify({chapter: chap})
            }).then(function(){
              reloadFrame();
            }).catch(function(err){
              $meta.textContent = "API error: " + err.message;
            });
          });

          $open.addEventListener("click", function(){
          // VSCode WebViewなら拡張側に渡す
          if (window !== window.top) {
              try { parent.postMessage({ type:"open-external", url: location.origin + "/" }, "*"); } catch(e){}
              return;
          }
          window.open("/","_blank","noopener");
          });

          $copyUrl.addEventListener("click", async function(){
            var url = location.origin + "/";

            if (window !== window.top) {
              try {
                parent.postMessage({ type: "copy-preview-url", url: url }, "*");
                flashMeta("URLをコピーしました");
              } catch (e) {
                flashMeta("URLコピーに失敗しました");
              }
              return;
            }

            try {
              await navigator.clipboard.writeText(url);
              flashMeta("URLをコピーしました");
            } catch (e) {
              flashMeta("URLコピーに失敗しました");
            }
          });

          // iframe → 親へ「VSCodeで開いて」
          window.addEventListener("message", function(ev){
            var data = ev.data;
            if(!data || data.type !== "open-vscode") return;

            var p = String(data.path || "");
            if(!p) return;

            // ★埋め込み（VSCode webviewのiframe）なら「親(=webview)」へ投げる
            if (window !== window.top) {
              try {
                parent.postMessage({ type: "open-vscode", path: p }, "*"); // ★topではなく parent
              } catch(e){}
              return;
            }

            // ★通常ブラウザ単独表示だけ vscode://file
            var u = p.split(String.fromCharCode(92)).join("/");
            var uri = "vscode://file/" + encodeURI(u);
            location.href = uri;
          });

          // SSE hot reload
          var lastCursor = null;
          var lastEditorScroll = null;

          function postCursorToFrame(cursor){
            try {
              if (!$frame || !$frame.contentWindow) return;
              $frame.contentWindow.postMessage({
                type: "vscode-cursor",
                file: cursor.file,
                line: cursor.line
              }, "*");
            } catch (e) {}
          }

          function postEditorScrollToFrame(view){
            try {
              if (!$frame || !$frame.contentWindow) return;
              $frame.contentWindow.postMessage({
                type: "vscode-scroll",
                file: view.file,
                line: view.line
              }, "*");
            } catch (e) {}
          }

          var es = new EventSource("/events");
          es.addEventListener("message", function(e){
            try{
              var data = JSON.parse(e.data);
              if(!data || data.type !== "reload") return;

              if (data.reason === "vscode-cursor") {
                lastCursor = { file: data.file, line: data.line };
                postCursorToFrame(lastCursor);
                return;
              }

              if (data.reason === "vscode-scroll") {
                lastEditorScroll = { file: data.file, line: data.line };
                postEditorScrollToFrame(lastEditorScroll);
                return;
              }

              if (
                data.reason === "rebuilt" ||
                data.reason === "settings-changed" ||
                data.reason === "chapter-selected" ||
                data.reason === "vscode-open"
              ) {
                refresh()
                  .catch(function(){})
                  .finally(function(){
                    reloadFrame();
                  });
                return;
              }

            } catch (err) {}
          });

          // ★追加：初回ロードで章一覧を埋める
          refresh().catch(function(err){
            $meta.textContent = "API error: " + err.message;
            console.error("[index] init refresh failed", err);
          });

        })();
      </script>
    </body>
  </html>`;
}

function notifyReload(payload = {}) {
  const data = JSON.stringify({ type: "reload", ...payload });
  for (const res of state.sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch {}
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// ===============================
// Watchers
// ===============================

let rootWatcher = null;
let chapterWatcher = null;

setupRootWatcher();
setupChapterWatcher();

function setupRootWatcher() {
  try { rootWatcher?.close?.(); } catch {}

  try {
    rootWatcher = fs.watch(
      state.root,
      { persistent: true },
      debounce(() => {
        const before = state.chapters.join("|");
        refreshChapters();
        const after = state.chapters.join("|");

        if (before !== after) {
          if (!state.chapters.includes(state.selectedChapter)) {
            state.selectedChapter = state.chapters[0] ?? "";
          }
          notifyReload({ reason: "chapters-changed" });
          setupChapterWatcher();
          buildSelectedChapter().catch((e) => console.error("[build after chapters]", e));
        }
      }, 250)
    );
  } catch (e) {
    console.warn("[watch root] failed:", e?.message ?? String(e));
  }
}

function setupChapterWatcher() {
  try { chapterWatcher?.close?.(); } catch {}
  const chapPath = getSelectedChapterPath();
  if (!chapPath) return;

  try {
    chapterWatcher = fs.watch(chapPath, { persistent: true }, debounce((event, file) => {

      if (!file) return;

      // ★ preview 自体の更新は無視
      if (file === "vertical-preview.html") return;

      // ★ config 更新も無視
      if (file === ".mojigoto.json") return;

      buildSelectedChapter().catch((e) => console.error("[build on save]", e));

    }, 250));
  } catch (e) {
    console.warn("[watch chapter] failed:", e.message);
  }
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ===============================
// C) Build / Renderer
// ===============================

// =============== Build ===============
let building = false;

async function buildSelectedChapter() {

  if (building) return;
  building = true;

  try {

    refreshChapters();

    const chapPath = getSelectedChapterPath();
    if (!chapPath) return;

    const combined = readChapterInput(chapPath);

    const buildKey = [
      combined,
      `@layout=${CFG.charsPerLine}x${CFG.linesPerPage}`,
      `@font=${CFG.fontSizePx}|${CFG.fontFamily}`,
      `@spacing=${CFG.lineAdvanceEm}`,
      `@theme=${CFG.theme}`,
      `@punct=${CFG.verticalPunctuationLayout}`,
      `@typography=${CFG.useTypographyAdjustments}`,
    ].join("\n");

    const hash = sha1(buildKey);
    if (hash === state.lastHash) return;
    state.lastHash = hash;

    const html = buildVerticalPreviewHtml(combined);

    const outPath = path.join(state.root, "vertical-preview.html");
    fs.writeFileSync(outPath, html, "utf8");

    state.lastBuildAt = Date.now();
    state.buildSeq += 1;

    notifyReload({ reason: "rebuilt", chapter: state.selectedChapter, seq: state.buildSeq });

  } finally {
    building = false;
  }
}

buildSelectedChapter().catch((e) => console.error("[build init]", e));

function buildSelectedChapterHtml() {
  refreshChapters();
  const chapPath = getSelectedChapterPath();
  if (!chapPath) return "";
  const combined = readChapterInput(chapPath);
  return buildVerticalPreviewHtml(combined);
}

function buildVerticalPreviewPagesFromText(rawInput) {
  const layoutOptions = {
    charsPerLine: CFG.charsPerLine,
    punctuationLayoutMode: CFG.verticalPunctuationLayout,
    useTypographyAdjustments: CFG.useTypographyAdjustments,
  };

  const pageSize = Math.max(1, Number(CFG.linesPerPage || 16));
  const blocks = parsePreviewBlocks(rawInput);

  const pages = [];
  let currentPage = [];
  let pendingPageLinks = [];

  function isFlowItem(item) {
    return item && item.type !== "pageLink";
  }

  function countFlowItems(items) {
    return (Array.isArray(items) ? items : []).filter(isFlowItem).length;
  }

  function hasFlowItems(items) {
    return countFlowItems(items) > 0;
  }

  function pushPage() {
    if (!currentPage.length) return;

    // pageLink だけのページは作らない
    if (!hasFlowItems(currentPage)) {
      currentPage = [];
      return;
    }

    pages.push(currentPage);
    currentPage = [];
  }

  function makePageLinkFromFileBoundaryItem(item) {
    return {
      type: "pageLink",
      html: String(item?.html || "").replace(
        'class="file-boundary"',
        'class="file-boundary page-file-boundary"',
      ),
    };
  }

  for (const block of blocks) {
    if (block?.type === "fileBoundary") {
      const fileBoundaryItems = renderPreviewBlockToItems(block, layoutOptions);
      pendingPageLinks.push(
        ...fileBoundaryItems.map((item) =>
          makePageLinkFromFileBoundaryItem(item),
        ),
      );
      continue;
    }

    if (block?.type === "heading" && block.level === 1) {
      // プレビュー途中の見出し1は改ページ。
      // ただし、先頭や pageLink だけの場合は空ページを作らない。
      if (hasFlowItems(currentPage)) {
        pushPage();
      }
    }

    const items = renderPreviewBlockToItems(block, layoutOptions);

    if (pendingPageLinks.length && items.length) {
      currentPage.push(...pendingPageLinks);
      pendingPageLinks = [];
    }

    for (const item of items) {
      const lastItem =
        currentPage.length > 0 ? currentPage[currentPage.length - 1] : null;

      if (item?.type === "blank" && lastItem?.type === "blank") {
        continue;
      }

      currentPage.push(item);

      if (
        item?.type !== "pageLink" &&
        countFlowItems(currentPage) >= pageSize
      ) {
        pushPage();
      }
    }
  }

  if (currentPage.length || !pages.length) {
    pushPage();
  }

  if (!pages.length) {
    pages.push([]);
  }

  return pages;
}

function parsePreviewBlocks(rawInput) {
  const text = String(rawInput || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = text.split("\n");

  const blocks = [];
  let currentFile = "";
  let currentFileKey = "";
  let currentLineNo = 0;

  for (const line of lines) {
    const fileMatch = line.match(/^<<FILE:([^|>]+)\|\|(.+?)>>$/);

    if (fileMatch) {
      currentFile = fileMatch[1];
      currentFileKey = fileKey(currentFile);
      currentLineNo = 0;

      blocks.push({
        type: "fileBoundary",
        filePath: currentFile,
        fileLabel: fileMatch[2],
      });
      continue;
    }

    if (currentFile) currentLineNo += 1;

    const anchorHtml = currentFile
      ? `<span class="line-anchor" data-file="${escapeAttr(currentFile)}" data-filekey="${escapeAttr(currentFileKey)}" data-line="${currentLineNo}"></span>`
      : "";

    if (!line.trim()) {
      blocks.push({
        type: "blank",
        anchorHtml,
      });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2] || "",
        anchorHtml,
        highlightGroup: `preview-block-${blocks.length}`,
        isFileStart: currentLineNo === 1,
      });
      continue;
    }

    blocks.push({
      type: "paragraph",
      text: line,
      anchorHtml,
      highlightGroup: `preview-block-${blocks.length}`,
    });
  }

  return blocks;
}

function makeBlankItems(count = 0) {
  const n = Math.max(0, Number(count || 0));
  return Array.from({ length: n }, () => ({
    type: "blank",
    html: "",
  }));
}

function renderPreviewBlockToItems(block, layoutOptions = {}) {
  if (!block) return [];

  if (block.type === "blank") {
    return [{ type: "blank", html: block.anchorHtml || "" }];
  }

  if (block.type === "fileBoundary") {
    return [
      {
        type: "fileBoundary",
        html: `<div class="file-boundary" data-file="${escapeAttr(block.filePath)}">${escapeHtml(block.fileLabel)}</div>`,
      },
    ];
  }

  if (block.type === "heading") {
    const fontScale = block.level === 1 ? 1.4 : block.level === 2 ? 1.2 : 1.1;

    const baseCharsPerLine = getEffectiveCharsPerLine(layoutOptions);
    const headingCharsPerLine = Math.max(
      1,
      Math.floor(baseCharsPerLine / fontScale),
    );

    const headingOptions = {
      ...layoutOptions,
      charsPerLine: headingCharsPerLine,
    };

    const lines = splitTextIntoDisplayLines(block.text || "", headingOptions);

    const headingItems = lines.map((line, index) => {
      const lineHtml = renderDisplayLineHtml(line);
      return {
        type: "heading",
        level: block.level,
        highlightGroup: block.highlightGroup || "",
        html: `<div class="mjm-heading-${block.level}">${
          index === 0
            ? injectAnchorIntoLineHtml(lineHtml, block.anchorHtml || "")
            : lineHtml
        }</div>`,
      };
    });

    // h1: 改ページ + 後ろ1行
    // h2: 前後1行（ただしファイル先頭なら前なし）
    // h3: 前後1行
    if (block.level === 1) {
      return [...headingItems, ...makeBlankItems(1)];
    }

    if (block.level === 2) {
      return [
        ...(block.isFileStart ? [] : makeBlankItems(1)),
        ...headingItems,
        ...makeBlankItems(1),
      ];
    }

    if (block.level === 3) {
      return [...makeBlankItems(1), ...headingItems, ...makeBlankItems(1)];
    }

    return headingItems;
  }

  if (block.type === "paragraph") {
    const lines = splitTextIntoDisplayLines(block.text || "", layoutOptions);

    return lines.map((line, index) => {
      const lineHtml = renderDisplayLineHtml(line);
      return {
        type: "line",
        highlightGroup: block.highlightGroup || "",
        html:
          index === 0
            ? injectAnchorIntoLineHtml(lineHtml, block.anchorHtml || "")
            : lineHtml,
      };
    });
  }

  return [];
}

function injectAnchorIntoLineHtml(lineHtml, anchorHtml = "") {
  if (!anchorHtml) return lineHtml;

  const html = String(lineHtml || "");
  const nextHtml = html.replace(/<div class="mjm-line([^"]*)">/, (match) => {
    return `${match}${anchorHtml}`;
  });

  return nextHtml === html ? `${anchorHtml}${html}` : nextHtml;
}

function buildVerticalPreviewHtml(rawInput) {
  const pages = buildVerticalPreviewPagesFromText(rawInput);
  return buildHtmlFromRenderPages(pages);
}

function tokenCells(t) {
  return Math.max(0, Number(t?.cells ?? 1));
}

function colCells(arr) {
  return (arr || []).reduce((sum, t) => sum + tokenCells(t), 0);
}

function colsToHtml(cols) {
  const colsHtml = [];

  for (let c = 0; c < CFG.linesPerPage; c++) {
    const col = cols[c] ?? [];

    const filled = col.slice();
    let used = colCells(filled);

    while (used < CFG.charsPerLine) {
      filled.push({ g: "　", cls: "pad", cells: 1 });
      used++;
    }

    const outs = (cols._outs && cols._outs[c]) ? cols._outs[c] : [];

    // ★ outsを分離：アンカーは col-body に戻す
    const outAnchors = outs.filter(t =>
      typeof t.g === "string" && t.g.startsWith('<span class="line-anchor"')
    );

    const outRenders = outs.filter(t =>
      !(typeof t.g === "string" && t.g.startsWith('<span class="line-anchor"'))
    );

    const spans = [];
    for (const t of filled) {
      const cls = ["ch"];
      if (t.cls) cls.push(t.cls);

      const isInlineHtml =
        typeof t.g === "string" &&
        (t.g.startsWith("<ruby") ||
         t.g.startsWith('<span class="file-boundary"') ||
         t.g.startsWith('<span class="line-anchor"'));

      const content = isInlineHtml ? t.g : escapeHtml(t.g);
      spans.push(`<span class="${cls.join(" ")}">${content}</span>`);
    }

    // ★ outAnchors は “見た目ゼロ” で col-body 末尾に戻す
    const anchorHtml = outAnchors
      .map(t => (typeof t.g === "string" ? t.g : ""))
      .join("");

    const outSpans = outRenders.map((t) => {
      const isInlineHtml =
        typeof t.g === "string" &&
        (t.g.startsWith("<ruby") ||
         t.g.startsWith('<span class="file-boundary"') ||
         t.g.startsWith('<span class="line-anchor"'));

      // file-boundary はそのまま（hang-out扱いにしない）
      if (typeof t.g === "string" && t.g.startsWith('<span class="file-boundary"')) {
        return isInlineHtml ? t.g : escapeHtml(t.g);
      }

      const cls = ["ch", "hang-out"];
      if (t.cls) cls.push(t.cls);
      return `<span class="${cls.join(" ")}">${isInlineHtml ? t.g : escapeHtml(t.g)}</span>`;
    });

    colsHtml.push(
      `<div class="col">` +
        `<div class="col-body">${spans.join("")}${anchorHtml}</div>` +  // ★ここに戻す
        `<div class="hang-layer">${outSpans.join("")}</div>` +
      `</div>`
    );
  }

  return colsHtml.join("");
}

function buildHtmlFromRenderPages(pages) {
  const style = `
    :root{
      --fs:${CFG.fontSizePx}px;
      --colgap:${CFG.colGapPx}px;
      --pad:${CFG.pagePaddingPx}px;
      --pagegap:${CFG.pageGapPx}px;
      --cols:${CFG.linesPerPage};
      --rows:${CFG.charsPerLine};
      --lineAdvance:${CFG.lineAdvanceEm};

      --letterSpacing: 0.03em;
      --hangingLetterSpacing: 0.012em;
      --pushoutLetterSpacing: 0.055em;

      --colStep: calc(var(--fs) * var(--lineAdvance) * 1.08);
      --charStep: calc(var(--fs) * 1.06);

      --pageSidePad: calc(var(--pad) + (var(--fs) * 1.4));
      --pageTopBottomPad: calc(var(--pad) + 10px + (var(--fs) * 0.65));

      --gridW: calc((var(--cols) * var(--colStep)) + ((var(--cols) - 1) * var(--colgap)));
      --gridH: calc(var(--rows) * var(--charStep));

      --extraH: 0px;
      --extraW: calc(var(--fs) * 2);
    }
    :root[data-theme="light"]{
      --bg:#f4f4f4;
      --paper:#fff;
      --text:#222;
      --muted:#666;
      --fileBg:rgba(0,0,0,0.03);
      --fileBorder:#ddd;
      --active:rgba(255,180,0,.18);
      --shadow: rgba(0,0,0,.08);
    }

    :root[data-theme="soft-paper"]{
      --bg:#f5f2eb;
      --paper:#fffdf7;
      --text:#2d2a24;
      --muted:#756d60;
      --fileBg:rgba(130,105,68,.08);
      --fileBorder:#d8cfbf;
      --active:rgba(184,141,48,.20);
      --shadow: rgba(72,58,38,.13);
    }

    :root[data-theme="dark"]{
      --bg:#2a2b2e;
      --paper:#0f1012;
      --text:#f1f1ed;
      --muted:#9d9d98;
      --fileBg:rgba(255,255,255,.05);
      --fileBorder:#3a3b40;
      --active:rgba(206,166,74,.24);
      --shadow: rgba(0,0,0,.48);
    }

    :root[data-theme="navy"]{
      --bg:#071426;
      --paper:#0b1d33;
      --text:#e7f0ff;
      --muted:#9db5d1;
      --fileBg:rgba(110,165,220,.10);
      --fileBorder:#25486b;
      --active:rgba(95,145,205,.24);
      --shadow: rgba(0,0,0,.38);
    }

    :root[data-theme="green"]{
      --bg:#e7efe4;
      --paper:#fbfff8;
      --text:#253126;
      --muted:#657563;
      --fileBg:rgba(80,120,70,.08);
      --fileBorder:#c6d7c0;
      --active:rgba(150,180,84,.22);
      --shadow: rgba(40,70,45,.13);
    }

    :root[data-theme="deep-green"]{
      --bg:#0d1c17;
      --paper:#14251f;
      --text:#e5f2e5;
      --muted:#a9c4ac;
      --fileBg:rgba(170,210,160,.08);
      --fileBorder:#315845;
      --active:rgba(120,170,100,.22);
      --shadow: rgba(0,0,0,.42);
    }

    :root[data-theme="deep-brown"]{
      --bg:#2d241f;
      --paper:#211814;
      --text:#eadfce;
      --muted:#bda58b;
      --fileBg:rgba(214,169,112,.08);
      --fileBorder:#5a4030;
      --active:rgba(190,130,67,.24);
      --shadow: rgba(0,0,0,.46);
    }

    :root[data-theme="lavender"]{
      --bg:#eeeaf5;
      --paper:#fbf9ff;
      --text:#30293b;
      --muted:#746a84;
      --fileBg:rgba(120,95,150,.08);
      --fileBorder:#d6cde4;
      --active:rgba(145,110,190,.18);
      --shadow: rgba(70,50,95,.13);
    }

    :root[data-theme="beige"]{
      --bg:#efe7d8;
      --paper:#fff8ea;
      --text:#2a241b;
      --muted:#6b6254;
      --fileBg:rgba(125,90,40,.07);
      --fileBorder:#d5c5a8;
      --active:rgba(190,145,60,.20);
      --shadow: rgba(0,0,0,.12);
    }
    html, body { height: 100%; overflow: hidden; }
    body{
      margin:0;
      font-family:${CFG.fontFamily};
      background:var(--bg);
      color:var(--text);
    }
    .wrap{
      height:100vh;
      display:flex;
      gap:var(--pagegap);
      padding:10px;
      overflow-x:auto;
      overflow-y:auto;
      scroll-snap-type:x mandatory;
      flex-direction: row-reverse;
      align-items:flex-start;
    }
    .page{
      scroll-snap-align:start;
      flex:0 0 auto;
      background:var(--paper);
      box-shadow:0 2px 10px var(--shadow);
      border-radius:10px;
      padding-left: var(--pageSidePad);
      padding-right: var(--pageSidePad);
      padding-top: var(--pageTopBottomPad);
      padding-bottom: var(--pageTopBottomPad);
      position: relative;
      box-sizing: content-box;
      height: calc(var(--gridH) + var(--extraH));
      width: calc(var(--gridW) + var(--extraW));
    }
    .page-file-links {
      position: absolute;
      right: calc(var(--pageSidePad) * 0.1);
      bottom: calc(var(--pageTopBottomPad) * 0.45);
      z-index: 5;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      pointer-events: none;
    }

    .page-file-links .file-boundary {
      position: static;
      display: block;
      box-sizing: border-box;
      max-height: calc(var(--gridH) * 0.45);
      overflow: hidden;
      white-space: nowrap;
      text-wrap: nowrap;
      line-break: keep-all;
      opacity: 0.72;
      pointer-events: auto;
    }
    .pno{
      position:absolute; left:14px; top:10px;
      font-size:12px;
      color:var(--muted);
    }
    .grid{
      display:flex;
      flex-direction: row-reverse;
      gap: var(--colgap);
      font-size: var(--fs);
      overflow: visible;
      height: var(--gridH);
      width: var(--gridW);
      margin: 0 auto;
      justify-content: flex-start;
      align-items: flex-start;
    }
    .col{
      writing-mode: vertical-rl;
      text-orientation: upright;
      width: var(--colStep);
      height: var(--gridH);
      flex: 0 0 var(--colStep);
      overflow: visible;
      position: relative;
      white-space: nowrap;
      text-wrap: nowrap;
      border-radius: 4px;
    }
    .col::before{
      content:"";
      position:absolute;
      top:0;
      right:0;
      bottom:0;
      left:0;
      border-radius: inherit;
      pointer-events:none;
      z-index:0;
    }
    .col.is-active::before{
      background: linear-gradient(
        to bottom,
        var(--active),
        var(--active)
      );
    }
    .col-body{
      display:block;
      width:100%;
      height:100%;
      position:relative;
      z-index:1;
    }
    .col-fileBoundary .col-body{
      display:block;
      width:100%;
      height:100%;
      position:relative;
    }
    .col-fileBoundary .file-boundary{
      display:block;
      box-sizing:border-box;
      position:absolute;
      top:auto;
      right:0;
      bottom:0.35em;
      left:auto;
    }
    .wrap.is-syncing{
      scroll-snap-type: none !important;
    }
    .wrap.is-syncing .page{
      scroll-snap-align: none !important;
    }
    .line-anchor{
      position:absolute;
      inset:0 auto auto 0;
      width:1px;
      height:1px;
      overflow:hidden;
      opacity:0;
      pointer-events:none;
    }
    .mjm-token {
      display:inline;
    }
    .mjm-hanging {
      display:inline-block;
      transform: translateY(-0.06em);
      font-size:95%;
    }
    .mjm-line {
      display:block;
      white-space:nowrap;
      position:relative;
      letter-spacing: var(--letterSpacing);
    }
    .mjm-line-has-hanging-emphasis {
      letter-spacing: var(--hangingLetterSpacing);
    }
    .mjm-line-tail-pushed {
      letter-spacing: var(--pushoutLetterSpacing);
    }
    ruby.mjm-ruby {
      position: relative;
      display: inline-block;
      width: var(--rubyAdvance, calc(var(--rubyBaseLen, 1) * 1em));
      inline-size: var(
        --rubyBaseAdvance,
        calc(var(--rubyBaseLen, 1) * 1em)
      );
      overflow: visible;
      vertical-align: top;
      letter-spacing: var(--rubyLineTrack, 0em);
      padding-inline-start: 0;
      padding-inline-end: 0;
    }
    ruby.mjm-ruby rb {
      display: inline-block;
      width: var(--rubyBaseAdvance, calc(var(--rubyBaseLen, 1) * 1em));
      inline-size: var(--rubyBaseAdvance, calc(var(--rubyBaseLen, 1) * 1em));
      letter-spacing: calc(var(--rubyTrack, 0em) + var(--rubyLineTrack, 0em));
    }
    ruby.mjm-ruby-tail-pushed {
      margin-bottom: -0.04em;
    }
    ruby.mjm-ruby-short rt {
      position: absolute;
      top: 50%;
      left: 95%;
      transform: translate(-0.2em, -50%);
      transform-origin: left center;
      font-size: .48em;
      line-height: 1;
      white-space: nowrap;
      letter-spacing: -0.02em;
      pointer-events: none;
    }
    ruby.mjm-ruby-long rt {
      position: absolute;
      top: 50%;
      left: 100%;
      transform: translate(-0.3em, -50%);
      transform-origin: left center;
      font-size: .45em;
      line-height: 1;
      white-space: nowrap;
      letter-spacing: -0.01em;
      pointer-events: none;
    }
    .mjm-bouten {
      /* 本文は通常の一字位置に置き、ゴマだけをルビと同様に行外へ出す。 */
      position:relative;
      display:inline;
      line-height:inherit;
      overflow:visible;
      text-emphasis:none;
      -webkit-text-emphasis:none;
    }
    .mjm-bouten-base {
      display:inline;
      line-height:inherit;
    }
    .mjm-bouten::after {
      content:"﹅";
      position:absolute;
      inset-block-start:-0.52em;
      inset-inline-start:50%;
      transform:translateY(-50%);
      font-size:.36em;
      line-height:1;
      letter-spacing:0;
      white-space:nowrap;
      pointer-events:none;
    }
    .mjm-blank {
      display:block;
      width: calc(var(--lineAdvance) * 1em);
      height: 1em;
      opacity:0;
    }
    .file-boundary{
      white-space: nowrap;
      text-wrap: nowrap;
      line-break: keep-all;
      color:var(--muted);
      background:var(--fileBg);
      border-left:1px solid var(--fileBorder);
      border-right:1px solid var(--fileBorder);
      padding:0.2em 0.15em;
      border-radius:6px;
      pointer-events:auto;
      cursor:pointer;
    }
    .mjm-heading-1 .mjm-line { font-size: 1.2em; font-weight: 700; }
    .mjm-heading-2 .mjm-line { font-size: 1em; }
    .mjm-heading-3 .mjm-line { font-size: 0.9em; }
    .mjm-heading-2 .mjm-line,
    .mjm-heading-3 .mjm-line {
      text-indent: 1em;
    }
  `;

  const pagesHtml = (Array.isArray(pages) ? pages : [])
    .map((page, idx) => {
      const pageItems = Array.isArray(page) ? page : [];

      const pageLinksHtml = pageItems
        .filter((item) => item?.type === "pageLink")
        .map((item) => item?.html || "")
        .filter(Boolean)
        .join("");

      const colsHtml = pageItems
        .filter((item) => item?.type !== "pageLink")
        .map((item) => {
          if (item?.type === "blank") {
            return `<div class="col"><div class="col-body"><div class="mjm-blank">　</div></div></div>`;
          }

          const kindClass =
            item?.type === "fileBoundary"
              ? " col-fileBoundary"
              : item?.type === "heading"
                ? " col-heading"
                : " col-line";

          const highlightGroupAttr = item?.highlightGroup
            ? ` data-highlight-group="${escapeAttr(item.highlightGroup)}"`
            : "";

          return `<div class="col${kindClass}"${highlightGroupAttr}><div class="col-body">${item?.html || ""}</div></div>`;
        })
        .join("");

      return `
      <section class="page">
        <div class="pno">Page ${idx + 1}</div>
        ${
          pageLinksHtml
            ? `<div class="page-file-links">${pageLinksHtml}</div>`
            : ""
        }
        <div class="grid">${colsHtml}</div>
      </section>`;
    })
    .join("");

  return `
  <!doctype html>
  <html lang="ja" data-theme="${CFG.theme}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <link rel="icon" type="image/png" href="/images/mojigoto.png" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <title>Vertical Preview</title>
      <style>${style}</style>
    </head>
    <body>
      <main class="wrap">
        ${pagesHtml}
      </main>
    </body>
    <script>
      ;(() => {
        async function reloadPreview(){
          try{
            const state = snapshotViewState();
            const wrap = document.querySelector(".wrap");
            if (!wrap) return;

            // 再構築中は見せない
            wrap.style.visibility = "hidden";
            scroller.classList.add("is-syncing");

            await new Promise(requestAnimationFrame);

            const res = await fetch("/api/live-preview");
            const html = await res.text();

            wrap.innerHTML = html;

            restoreViewState(state);

            requestAnimationFrame(() => {
              wrap.style.visibility = "";
              scroller.classList.remove("is-syncing");
            });

          }catch(e){
            const wrap = document.querySelector(".wrap");
            if (wrap) wrap.style.visibility = "";
            console.error(e);
          }
        }
        // -----------------------------
        // 1) file-boundary click -> parentへ
        // -----------------------------
        document.addEventListener("click", (e) => {
            const el = e.target.closest(".file-boundary");
            if (!el) return;
            const p = el.dataset.file || "";
            if (!p) return;
            try { parent.postMessage({ type: "open-vscode", path: p }, "*"); } catch {}
        });

        // -----------------------------
        // 2) VSCode cursor sync
        // -----------------------------
        function keyOf(p){
            return String(p || "")
            .split(String.fromCharCode(92)).join("/")
            .toLowerCase();
        }

        function findAnchor(file, line){
            const k = keyOf(file);
            const n = Math.max(1, Number(line || 1));

            const list = Array.from(document.querySelectorAll(
            '.line-anchor[data-filekey="' + CSS.escape(k) + '"]'
            ));
            if (!list.length) return null;

            list.sort((a,b) => (Number(a.dataset.line||0) - Number(b.dataset.line||0)));

            // 「line <= n の中で最大」（床）
            let best = null;
            for (const a of list){
            const l = Number(a.dataset.line || 0);
            if (l <= n) best = a;
            else break;
            }
            return best || list[0];
        }

        const scroller =
            document.querySelector(".wrap") ||
            document.scrollingElement ||
            document.documentElement ||
            document.body;

        function scrollToAnchor(a){
          if (!a || !scroller) return;

          const page = a.closest(".page");
          const col = a.closest(".col");
          if (!page) return;

          scroller.classList.add("is-syncing");

          const apply = () => {
            const pageRect = page.getBoundingClientRect();
            const isWidePage = pageRect.width > scroller.clientWidth;

          if (isWidePage && col) {
            const pad = Math.max(20, Math.min(32, Math.floor(scroller.clientWidth * 0.03)));

            col.scrollIntoView({
              behavior: "instant",
              block: "nearest",
              inline: "nearest",
            });

            const scrollerRect = scroller.getBoundingClientRect();
            const colRect = col.getBoundingClientRect();

            const leftGap = colRect.left - scrollerRect.left;
            const rightGap = scrollerRect.right - colRect.right;

            if (leftGap < pad) {
              scroller.scrollBy({
                left: leftGap - pad,
                behavior: "instant",
              });
            } else if (rightGap < pad) {
              scroller.scrollBy({
                left: pad - rightGap,
                behavior: "instant",
              });
            }

            return;
          }

            // 通常はページ中央寄せ
            page.scrollIntoView({
              behavior: "instant",
              block: "nearest",
              inline: "center",
            });
          };

          apply();
          requestAnimationFrame(apply);
          setTimeout(() => {
            apply();
            scroller.classList.remove("is-syncing");
          }, 120);
        }

        let lastActiveColumns = [];
        
        function setActiveAnchor(el){
            const col = el?.closest(".col");
            if (!col) return;

            for (const activeCol of lastActiveColumns) {
              activeCol.classList.remove("is-active");
            }

            const highlightGroup = String(col.dataset.highlightGroup || "");
            lastActiveColumns = highlightGroup
              ? Array.from(document.querySelectorAll(
                  '.col[data-highlight-group="' + CSS.escape(highlightGroup) + '"]'
                ))
              : [col];

            for (const activeCol of lastActiveColumns) {
              activeCol.classList.add("is-active");
            }
        }

        function scrollToCursor(file, line){
          const a = findAnchor(file, line);
          if (!a) return;
          setActiveAnchor(a);
          scrollToAnchor(a);
        }

        function scrollToEditorViewport(file, line){
          const a = findAnchor(file, line);
          if (!a) return;

          // カーソルの強調表示は変更せず、表示位置だけを同期する。
          scrollToAnchor(a);
        }

        function currentVisiblePage() {
          const pages = Array.from(document.querySelectorAll(".page"));
          if (!pages.length) return null;

          const wrapRect = scroller.getBoundingClientRect();
          const wrapCenter = wrapRect.left + wrapRect.width / 2;

          let best = null;
          let bestDist = Infinity;

          for (const page of pages) {
            const r = page.getBoundingClientRect();
            const center = r.left + r.width / 2;
            const dist = Math.abs(center - wrapCenter);
            if (dist < bestDist) {
              bestDist = dist;
              best = page;
            }
          }
          return best;
        }

        function snapshotViewState() {
          const last = loadCursor();
          return {
            scrollLeft: scroller.scrollLeft,
            cursor: last && last.file && last.line ? last : null,
          };
        }

        function restoreViewState(state) {
          if (!state) return;

          if (state.cursor) {
            const a = findAnchor(state.cursor.file, state.cursor.line);
            if (a) {
              setActiveAnchor(a);
              scrollToAnchor(a);
              return;
            }
          }

          const applyScroll = () => {
            scroller.scrollLeft = state.scrollLeft || 0;
          };

          applyScroll();
          requestAnimationFrame(applyScroll);
          setTimeout(applyScroll, 20);
        }

        let lastKey = "";
        let lastScrollKey = "";

        window.addEventListener("message", (ev) => {
            const d = ev.data;
            if (!d) return;

            const file = String(d.file || "");
            const line = Number(d.line || 0);

            // ★無効イベントは捨てる（先頭ジャンプ防止）
            if (!file || !Number.isFinite(line) || line < 1) return;

            if (d.type === "vscode-scroll") {
              const scrollKey = keyOf(file) + ":" + line;
              if (scrollKey === lastScrollKey) return;
              lastScrollKey = scrollKey;
              scrollToEditorViewport(file, line);
              return;
            }

            if (d.type !== "vscode-cursor") return;

            const k = keyOf(file) + ":" + line;
            if (k === lastKey) return; // ★連打で暴れない
            lastKey = k;

            saveCursor(file, line);
            scrollToCursor(file, line);
        });

        const CURSOR_KEY = "mojigoto_last_cursor";

        function saveCursor(file, line){
            try { sessionStorage.setItem(CURSOR_KEY, JSON.stringify({file, line})); } catch {}
        }
        function loadCursor(){
            try { return JSON.parse(sessionStorage.getItem(CURSOR_KEY) || "null"); } catch { return null; }
        }

        // -----------------------------
        // 3) 横スクロール位置の保存/復元
        // -----------------------------
        const params = new URLSearchParams(location.search);
        const chapter = params.get("chapter") || "default";
        const layoutKey = "${CFG.charsPerLine}x${CFG.linesPerPage}";
        const KEY = "mojigoto_scroll_left:" + chapter + ":" + layoutKey;
        const RESET_FLAG = "mojigoto_scroll_reset";

        function readSaved() {
            try {
            if (sessionStorage.getItem(RESET_FLAG) === "1") return 0;
            const v = sessionStorage.getItem(KEY);
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
            } catch { return 0; }
        }

        function save(val){
            try { sessionStorage.setItem(KEY, String(val|0)); } catch {}
        }

        function restore() {
          try {
            if (sessionStorage.getItem(RESET_FLAG) === "1") {
              sessionStorage.removeItem(KEY);
              sessionStorage.removeItem(RESET_FLAG);
            }
          } catch {}

          const last = loadCursor();
          if (last?.file && last?.line) {
            return;
          }

          const left = readSaved();
          const apply = () => { scroller.scrollLeft = left; };
          apply();
          requestAnimationFrame(apply);
          setTimeout(apply, 60);
        }

        let t = null;
        scroller.addEventListener("scroll", () => {
          if (scroller.classList.contains("is-syncing")) return;
          if (t) return;
          t = setTimeout(() => {
            t = null;
            if (scroller.classList.contains("is-syncing")) return;
            save(scroller.scrollLeft);
          }, 80);
        }, { passive: true });

        window.addEventListener("beforeunload", () => save(scroller.scrollLeft));
        
        if (!window.__mojigoto_restored__) {
          window.__mojigoto_restored__ = true;
          restore();
        }

        window.addEventListener("message",(ev)=>{
          const d = ev.data;
          if(!d) return;

          if(d.type==="mojigoto-reload"){
            reloadPreview();
          }
        });        

        // restore() の最後で
        const last = loadCursor();
        if (last?.file && last?.line) {
            // DOM描画＆スクロール復元が落ち着いてから付ける
            setTimeout(() => scrollToCursor(last.file, last.line), 80);
        }
      })();
    </script>
  </html>`;
}
