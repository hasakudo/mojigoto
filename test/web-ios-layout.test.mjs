import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GoogleDrivePicker } from "../web/storage/google-drive-picker.mjs";

const readWebFile = (name) => readFile(new URL(`../web/${name}`, import.meta.url), "utf8");

test("iPhoneとiPadのSafe Areaと動的画面高へ対応する", async () => {
  const [html, css] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
  ]);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-mobile-web-app-status-bar-style/);
  assert.match(css, /--safe-area-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /--topbar-height: calc\(54px \+ var\(--safe-area-top\)\)/);
  assert.match(css, /\.work-context \.global-work-nav \{ top: var\(--safe-area-top\); \}/);
});

test("タッチ端末の入力欄を16px以上にしてSafariの自動拡大を防ぐ", async () => {
  const [html, css, app] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("styles.css"),
    readWebFile("app.mjs"),
  ]);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\), textarea, select \{ font-size: 16px; \}/);
  assert.match(css, /button, summary, label \{ -webkit-tap-highlight-color: transparent; \}/);
  assert.match(css, /\.folder-row-with-shortcuts:active > \.manuscript-folder-shortcuts \{[^}]*background: var\(--hover-surface\)/);
  assert.match(css, /\.settings-dialog\[open\][^{]*\{[^}]*100dvh[^}]*overflow: auto/);
  assert.match(html, /id="conceptFolderFilterLabel">すべて<\/strong>/);
  assert.match(app, /conceptFolderFilterOptions\.replaceChildren/);
  assert.match(css, /\.section-heading > \.secondary-button, \.note-list-actions \.secondary-button, \.manuscript-list-actions button \{[^}]*font-size: \.82rem/);
  assert.match(css, /\.breadcrumbs \.crumb, \.manuscript-breadcrumbs \.crumb \{[^}]*font-size: \.78rem/);
});

test("Google PickerはiOSのVisual Viewportへ追従する", () => {
  const dialogStyle = {};
  const dialog = {
    style: dialogStyle,
    querySelector: (selector) => selector === ".picker-dialog-title" ? { offsetHeight: 24 } : null,
    querySelectorAll: () => [],
  };
  const picker = new GoogleDrivePicker({
    apiKey: "api-key",
    appId: "123456",
    documentRef: { querySelectorAll: () => [dialog] },
    viewport: {
      innerWidth: 1024,
      innerHeight: 768,
      visualViewport: { width: 744, height: 500, offsetLeft: 12, offsetTop: 48 },
    },
  });
  picker.fitToViewport();
  assert.equal(dialogStyle.left, "384px");
  assert.equal(dialogStyle.top, "298px");
  assert.equal(dialogStyle.width, "566px");
});
