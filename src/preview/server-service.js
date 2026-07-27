const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const net = require("net");
const http = require("http");
const https = require("https");

const HOST = "127.0.0.1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDebugFlag(options = {}) {
  if (typeof options.isDebug === "function") {
    try {
      return !!options.isDebug();
    } catch {
      return false;
    }
  }
  if (typeof options.isDebug === "boolean") {
    return options.isDebug;
  }
  return false;
}

function debugLog(options, ...args) {
  if (!getDebugFlag(options)) return;
  try {
    console.log("[mojigoto]", ...args);
  } catch {}
}

function ensureState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("preview state is required");
  }

  if (!Object.prototype.hasOwnProperty.call(state, "panel")) state.panel = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverPort"))
    state.serverPort = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverUrl"))
    state.serverUrl = null;
  if (!Object.prototype.hasOwnProperty.call(state, "serverOk"))
    state.serverOk = false;
  if (!Object.prototype.hasOwnProperty.call(state, "devProc"))
    state.devProc = null;
  if (!Object.prototype.hasOwnProperty.call(state, "pollingTimer"))
    state.pollingTimer = null;
  if (!Object.prototype.hasOwnProperty.call(state, "startedByUs"))
    state.startedByUs = false;

  return state;
}

function buildServerUrl(port) {
  return isValidPort(port) ? `http://${HOST}:${Number(port)}` : null;
}

function postJsonToUrl(url, payload, options = {}) {
  return new Promise((resolve) => {
    try {
      if (!url) return resolve(false);

      const u = new URL(url);
      const data = Buffer.from(JSON.stringify(payload ?? {}), "utf8");

      const isHttps = u.protocol === "https:";
      const mod = isHttps ? https : http;

      const req = mod.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: (u.pathname || "/") + (u.search || ""),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": data.length,
            "User-Agent": "Mojigoto",
          },
        },
        (res) => {
          let buf = "";
          res.on("data", (c) => {
            buf += String(c);
          });
          res.on("end", () => {
            const ok = res.statusCode >= 200 && res.statusCode < 400;
            if (!ok) {
              debugLog(
                options,
                "HTTP POST failed:",
                res.statusCode,
                buf.slice(0, 500),
              );
            }
            resolve(ok);
          });
        },
      );

      req.on("error", (e) => {
        debugLog(options, "HTTP POST error:", String(e));
        resolve(false);
      });

      req.write(data);
      req.end();
    } catch (e) {
      debugLog(options, "HTTP POST exception:", String(e));
      resolve(false);
    }
  });
}

function post(state, pathname, payload, options = {}) {
  ensureState(state);

  return new Promise((resolve) => {
    const p = Number(state.serverPort);
    if (!isValidPort(p)) return resolve(false);

    const data = Buffer.from(JSON.stringify(payload ?? {}), "utf8");
    const req = http.request(
      {
        host: HOST,
        port: p,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      },
    );

    req.on("error", (e) => {
      debugLog(options, "local POST error:", pathname, String(e));
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

function pingServer(state, options = {}) {
  ensureState(state);

  return new Promise((resolve) => {
    const p = Number(state.serverPort);
    if (!isValidPort(p)) return resolve(false);

    const req = http.request(
      { host: HOST, port: p, path: "/api/chapters", method: "GET" },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      },
    );

    req.on("error", (e) => {
      debugLog(options, "ping error:", String(e));
      resolve(false);
    });

    req.end();
  });
}

function getServerChaptersInfo(state, options = {}) {
  ensureState(state);

  return new Promise((resolve) => {
    const p = Number(state.serverPort);
    if (!isValidPort(p)) return resolve(null);

    const req = http.request(
      { host: HOST, port: p, path: "/api/chapters", method: "GET" },
      (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += String(c);
        });
        res.on("end", () => {
          if (!(res.statusCode >= 200 && res.statusCode < 300)) {
            return resolve(null);
          }
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            debugLog(options, "chapters JSON parse error:", String(e));
            resolve(null);
          }
        });
      },
    );

    req.on("error", (e) => {
      debugLog(options, "chapters fetch error:", String(e));
      resolve(null);
    });

    req.end();
  });
}

function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n > 0 && n <= 65535;
}

function normPath(p) {
  return String(p || "")
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLowerCase();
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    if (!isValidPort(port)) return resolve(false);

    const socket = new net.Socket();
    socket.setTimeout(600);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.connect(Number(port), HOST);
  });
}

async function waitPortClosed(port, timeoutMs = 8000) {
  if (!isValidPort(port)) return true;

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    const open = await isPortOpen(port);
    if (!open) return true;
    await sleep(200);
  }
  return false;
}

function killProcessByPortWin(port) {
  try {
    const out = cp.execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
    });

    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/\s+\d+$/);
      if (m) pids.add(m[0].trim());
    }

    for (const pid of pids) {
      if (!pid) continue;
      cp.spawnSync("taskkill", ["/PID", pid, "/T", "/F"], {
        windowsHide: true,
      });
    }

    return pids.size > 0;
  } catch {
    return false;
  }
}

function resolveVerticalDevPath(context) {
  const cfg = vscode.workspace.getConfiguration("mojigoto");
  const mode = String(cfg.get("mode", "") || "").trim();

  const workRoot = String(cfg.get("workRoot", "") || "").trim();
  const mrSetting = String(cfg.get("manuscriptRoot", "") || "").trim();

  let manuscriptRoot = "";

  if (mode === "single") {
    manuscriptRoot = mrSetting;
  } else {
    if (workRoot) manuscriptRoot = path.join(workRoot, "_WORK", "manuscript");
    if (!manuscriptRoot && mrSetting) manuscriptRoot = mrSetting;
    if (!manuscriptRoot) {
      const wf = vscode.workspace.workspaceFolders?.[0];
      if (wf) manuscriptRoot = path.join(wf.uri.fsPath, "_WORK", "manuscript");
    }
  }

  const wf = vscode.workspace.workspaceFolders?.[0];
  const workspaceFsPath = wf?.uri?.fsPath || process.cwd();

  const candidates = [];

  // 1) 拡張に同梱された bundled server を最優先
  const bundled = context.asAbsolutePath(
    path.join("server", "vertical-dev.mjs"),
  );
  candidates.push({
    workspaceFsPath,
    scriptPath: bundled,
    manuscriptRoot,
    bundled: true,
  });

  // 2) multi 時の workRoot 配下
  if (workRoot) {
    candidates.push({
      workspaceFsPath: workRoot,
      scriptPath: path.join(workRoot, "tools", "vertical-dev.mjs"),
      manuscriptRoot,
      bundled: false,
    });
  }

  // 3) manuscriptRoot 設定から逆算
  if (mrSetting) {
    const root = path.dirname(path.dirname(mrSetting));
    candidates.push({
      workspaceFsPath: root,
      scriptPath: path.join(root, "tools", "vertical-dev.mjs"),
      manuscriptRoot: mrSetting,
      bundled: false,
    });
  }

  // 4) ワークスペース直下
  if (wf) {
    candidates.push({
      workspaceFsPath: wf.uri.fsPath,
      scriptPath: path.join(wf.uri.fsPath, "tools", "vertical-dev.mjs"),
      manuscriptRoot,
      bundled: false,
    });
  }

  for (const candidate of candidates) {
    try {
      if (candidate.scriptPath && fs.existsSync(candidate.scriptPath)) {
        return candidate;
      }
    } catch {}
  }

  // 見つからなかった場合でも、Doctor で診断しやすいように
  // 最有力候補を返す。候補すら無ければ null。
  return candidates[0] || null;
}

async function startVerticalDevIfNeeded(context, state, options = {}) {
  ensureState(state);

  const onLog = typeof options.onLog === "function" ? options.onLog : null;
  const appendLog = (line) => {
    if (onLog) onLog(line);
  };

  if (state.devProc && !state.devProc.killed && isValidPort(state.serverPort)) {
    return {
      ok: true,
      reused: true,
      warning: null,
      error: null,
      log: "",
    };
  }

  const info = resolveVerticalDevPath(context);
  if (!info) {
    state.serverOk = false;
    return {
      ok: false,
      reused: false,
      warning: null,
      error: "workspace not found (cannot resolve tools/vertical-dev.mjs)",
      log: "",
    };
  }

  if (isValidPort(state.serverPort) && (await isPortOpen(state.serverPort))) {
    const cur = await getServerChaptersInfo(state, options);
    const want = normPath(info.manuscriptRoot);
    const have = normPath(cur?.root);

    if (cur && have === want) {
      state.serverOk = true;
      state.serverUrl = buildServerUrl(state.serverPort);
      return {
        ok: true,
        reused: true,
        warning: null,
        error: null,
        log: "",
      };
    }

    await stopVerticalDevIfStartedByUs(state, options);
    await waitPortClosed(state.serverPort, 1200);

    if (await isPortOpen(state.serverPort)) {
      killProcessByPortWin(state.serverPort);
      await waitPortClosed(state.serverPort, 3000);
    }

    state.serverPort = null;
    state.serverUrl = null;
    state.serverOk = false;
  }

  let warning = null;
  if (!info.manuscriptRoot || !fs.existsSync(info.manuscriptRoot)) {
    warning =
      "manuscriptRoot が未設定/見つかりません。監視対象が広くなる可能性があります。設定 mojigoto.manuscriptRoot を指定してください。";
    debugLog(options, "manuscriptRoot not found:", info.manuscriptRoot);
  }

  if (!fs.existsSync(info.scriptPath)) {
    state.serverOk = false;
    return {
      ok: false,
      reused: false,
      warning,
      error: `vertical-dev.mjs not found: ${info.scriptPath}`,
      log: "",
    };
  }

  const devLog = [];

  try {
    const args = [info.scriptPath];
    if (info.manuscriptRoot) args.push(info.manuscriptRoot);

    const child = cp.spawn(process.execPath, args, {
      cwd: info.workspaceFsPath,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HOST,
        PORT: "0",
        MOJIGOTO_DEBUG: getDebugFlag(options) ? "1" : "0",
      },
    });

    state.devProc = child;
    state.startedByUs = true;
    state.serverOk = false;
    state.serverPort = null;
    state.serverUrl = null;

    const pushDevLog = (line) => {
      devLog.push(String(line));
      if (devLog.length > 80) devLog.shift();
      appendLog(String(line));
    };

    child.stderr?.on("data", (b) => {
      const s = String(b);
      pushDevLog(s);
      debugLog(options, "[dev stderr]", s);
    });

    child.stdout?.on("data", (b) => {
      const s = String(b);
      pushDevLog(s);
      debugLog(options, "[dev stdout]", s);

      const m = s.match(
        /\[(?:vp|Mojigoto)\]\s+ready\s+http:\/\/[^:]+:(\d+)\//i);
      if (m) {
        state.serverPort = Number(m[1]);
        state.serverUrl = buildServerUrl(state.serverPort);
      }
    });

    child.on("error", (e) => {
      pushDevLog(String(e));
      debugLog(options, "spawn error:", String(e));
      if (state.devProc === child) {
        state.devProc = null;
      }
      state.serverOk = false;
    });

    child.on("exit", (code, sig) => {
      debugLog(options, "dev exited:", code, sig);
      if (state.devProc === child) {
        state.devProc = null;
      }
      state.serverOk = false;
      state.serverPort = null;
      state.serverUrl = null;
      state.startedByUs = false;
    });
  } catch (e) {
    state.devProc = null;
    state.serverOk = false;
    state.serverPort = null;
    state.serverUrl = null;
    state.startedByUs = false;

    return {
      ok: false,
      reused: false,
      warning,
      error: `spawn exception: ${String(e)}`,
      log: devLog.join("").slice(-3000),
    };
  }

  const startAt = Date.now();
  while (Date.now() - startAt < 8000) {
    if (isValidPort(state.serverPort) && (await pingServer(state, options))) {
      state.serverOk = true;
      state.serverUrl = buildServerUrl(state.serverPort);
      return {
        ok: true,
        reused: false,
        warning,
        error: null,
        log: devLog.join("").slice(-3000),
      };
    }
    await sleep(250);
  }

  state.serverOk = false;

  return {
    ok: false,
    reused: false,
    warning,
    error: "server did not become ready (timeout)",
    log: devLog.join("").slice(-3000),
  };
}

async function stopVerticalDevIfStartedByUs(state, options = {}) {
  ensureState(state);

  if (!state.devProc || state.devProc.killed) {
    state.devProc = null;
    state.startedByUs = false;
    state.serverOk = false;
    state.serverPort = null;
    state.serverUrl = null;
    return true;
  }

  const pid = state.devProc.pid;
  if (!pid) return false;

  try {
    state.devProc.kill("SIGINT");
  } catch (e) {
    debugLog(options, "SIGINT failed:", String(e));
  }

  await sleep(700);

  if (state.devProc && !state.devProc.killed) {
    try {
      cp.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    } catch (e) {
      debugLog(options, "taskkill failed:", String(e));
    }
  }

  state.devProc = null;
  state.startedByUs = false;
  state.serverOk = false;
  state.serverPort = null;
  state.serverUrl = null;

  return true;
}

function startServerPolling(state, options = {}) {
  ensureState(state);

  const intervalMs =
    Number.isFinite(options.intervalMs) && options.intervalMs > 0
      ? Number(options.intervalMs)
      : 900;

  const onStateChange =
    typeof options.onStateChange === "function" ? options.onStateChange : null;

  stopServerPolling(state);

  state.pollingTimer = setInterval(async () => {
    try {
      const ok = await pingServer(state, options);
      if (ok !== state.serverOk) {
        state.serverOk = ok;
        if (!ok) {
          state.serverUrl = buildServerUrl(state.serverPort);
        }
        if (onStateChange) {
          onStateChange(ok, state);
        }
      }
    } catch (e) {
      debugLog(options, "polling error:", String(e));
    }
  }, intervalMs);

  return state.pollingTimer;
}

function stopServerPolling(state) {
  ensureState(state);

  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }
}

module.exports = {
  HOST,
  postJsonToUrl,
  post,
  pingServer,
  getServerChaptersInfo,
  isValidPort,
  isPortOpen,
  waitPortClosed,
  killProcessByPortWin,
  resolveVerticalDevPath,
  startVerticalDevIfNeeded,
  stopVerticalDevIfStartedByUs,
  startServerPolling,
  stopServerPolling,
};
