const fs = require('node:fs');
const path = require('node:path');
const { renderGuide, login } = require('./web-guide-content.cjs');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
function update(name, transform) {
  const file = path.join(root, 'web', name), before = fs.readFileSync(file, 'utf8'), after = transform(before);
  if (check && before !== after) throw new Error(`${name}: run node scripts/sync-web-guide.cjs`);
  if (!check && before !== after) fs.writeFileSync(file, after);
}
update('index.html', html => {
  const start = html.indexOf('    <dialog id="guideDialog"'), end = html.indexOf('    <dialog id="newFileDialog"', start);
  if (start < 0 || end < 0) throw new Error('Guide dialog boundary not found');
  return html.slice(0,start) + `    <dialog id="guideDialog" class="settings-dialog guide-dialog" aria-labelledby="guideTitle">
      <div class="dialog-content guide-content"><div class="dialog-heading guide-heading"><div><p class="section-label">GUIDE</p><h2 id="guideTitle">もじごとガイド</h2></div><button id="closeGuideButton" class="icon-button" type="button" aria-label="ガイドを閉じる">閉じる</button></div>
        <div class="guide-scroll-content"><div id="loginGuideContent" hidden>${login}</div><div id="appGuideContent">${renderGuide()}</div></div>
      </div>
    </dialog>

` + html.slice(end);
});
update('guide.html', html => {
  const start = html.indexOf('<main class="guide-page">'), end = html.indexOf('</main>',start);
  if (start < 0 || end < 0) throw new Error('Guide page boundary not found');
  return html.slice(0,start) + `<main class="guide-page"><p id="guideCloseStatus" class="field-help" role="status" hidden></p><section class="guide-page-header"><p class="section-label">GUIDE</p><h1>もじごとガイド</h1></section>${renderGuide(true)}</main>` + html.slice(end+7);
});
console.log(check ? 'Guide content is synchronized.' : 'Updated both Web guides.');
