const { createEscaper } = require("./stats-utils");
const { makeStatsStyles } = require("./stats-html/stats-html-styles");
const { renderBody } = require("./stats-html/stats-html-layout");
const { makeStatsScript } = require("./stats-html/stats-html-script");

function makeStatsHtml(state) {
  const esc = createEscaper();

  return `<!doctype html>
  <html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>もじごと: Dashboard</title>
    <style>${makeStatsStyles()}</style>
  </head>
  <body>
    <div id="statsToast" class="statsToast" aria-live="polite"></div>
    ${renderBody(state, esc)}
    <script>${makeStatsScript()}</script>
  </body>
  </html>`;
}

module.exports = { makeStatsHtml };
