const { createEscaper } = require("./stats-utils");
const fs = require("fs");
const path = require("path");
const { makeStatsStyles } = require("./stats-html/stats-html-styles");
const { renderBody } = require("./stats-html/stats-html-layout");
const { makeStatsScript } = require("./stats-html/stats-html-script");

let progressLogoDataUri = "";

function getProgressLogoDataUri() {
  if (progressLogoDataUri) return progressLogoDataUri;
  try {
    const logoPath = path.join(__dirname, "..", "..", "images", "logo.png");
    progressLogoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  } catch {
    progressLogoDataUri = "";
  }
  return progressLogoDataUri;
}

function makeStatsHtml(state) {
  const esc = createEscaper();
  const viewState = {
    ...(state || {}),
    progressShareLogoDataUri: getProgressLogoDataUri(),
  };

  return `<!doctype html>
  <html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>もじごと: Dashboard</title>
    <style>${makeStatsStyles()}</style>
  </head>
  <body data-stats-render-id="${esc(viewState.statsRenderId || "")}" data-hide-zero-groups="${typeof viewState.hideZeroGroups === "boolean" ? String(viewState.hideZeroGroups) : ""}">
    <div id="statsToast" class="statsToast" aria-live="polite"></div>
    ${renderBody(viewState, esc)}
    <script>${makeStatsScript()}</script>
  </body>
  </html>`;
}

module.exports = { makeStatsHtml };
