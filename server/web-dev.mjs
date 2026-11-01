import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(SERVER_DIR, "..", "web");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function resolveRequestPath(urlString) {
  const url = new URL(urlString || "/", `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(WEB_ROOT, relative);
  if (candidate !== WEB_ROOT && !candidate.startsWith(`${WEB_ROOT}${path.sep}`)) return "";
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return path.join(candidate, "index.html");
  }
  return candidate;
}

const server = http.createServer((req, res) => {
  if (String(req.headers.host || "").startsWith("127.0.0.1")) {
    res.writeHead(307, { Location: `http://localhost:${PORT}${req.url || "/"}` });
    res.end();
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const headers = {
    "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

function checkExistingMojigotoServer() {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: HOST,
      port: PORT,
      path: "/",
      headers: { Host: `localhost:${PORT}` },
      timeout: 2000,
    }, (response) => {
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => {
        if (body.length < 8192) body += chunk;
      });
      response.on("end", () => resolve(body.includes("<title>もじごと</title>")));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

server.on("error", async (error) => {
  if (error?.code !== "EADDRINUSE") {
    console.error("もじごと Webを起動できませんでした:", error);
    process.exitCode = 1;
    return;
  }

  const isMojigoto = await checkExistingMojigotoServer();
  if (isMojigoto) {
    console.log(`もじごと Webはすでに起動しています: http://localhost:${PORT}`);
    console.log("終了する場合は、先に起動したターミナルで Ctrl+C を押してください。");
    return;
  }

  console.error(`ポート ${PORT} は別のアプリで使用されています。`);
  console.error("別のポートで起動する例: $env:PORT=4174; npm run web:dev");
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`もじごと Web: http://localhost:${PORT}`);
});
