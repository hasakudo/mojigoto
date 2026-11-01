import assert from "node:assert/strict";
import test from "node:test";
import { createEditorPopupLayout } from "../web/lib/editor-popup-layout.mjs";

function fixture() {
  function target(rect = {}) {
    const handlers = new Map();
    return { open: true, rect, handlers, styles: {},
      style: { removeProperty(key) { delete this.owner.styles[key]; }, owner: null },
      getBoundingClientRect() { return this.rect; },
      addEventListener(type, callback) {
        handlers.set(type, [...(handlers.get(type) || []), callback]);
      },
      emit(type) { for (const callback of handlers.get(type) || []) callback(); },
    };
  }
  const preview = target({ left: 250, right: 300 });
  const previewPopup = { style: {} };
  preview.querySelector = () => previewPopup;
  const count = target({ left: 10, right: 60 });
  let nested = false;
  count.closest = () => nested;
  const countPopup = target();
  countPopup.style.owner = countPopup;
  const panel = { style: {}, scrollHeight: 500 };
  const toggle = target({ left: 20, right: 55, top: 210, bottom: 240 });
  const options = target({ left: 10, top: 180 });
  options.querySelector = selector => selector === ".editor-options-panel" ? panel : toggle;
  options.closest = () => true;
  const viewport = target();
  Object.assign(viewport, { offsetLeft: 30, offsetTop: 20, width: 260, height: 270 });
  const window = target();
  Object.assign(window, { innerWidth: 900, innerHeight: 800, visualViewport: viewport,
    requestAnimationFrame: callback => callback(),
    getComputedStyle: element => ({ display: element.contents ? "contents" : "block",
      getPropertyValue: () => "12px" }),
  });
  const elements = { readerPreviewLauncher: preview, readerCountModeDetails: count,
    readerCountMode: { closest: () => countPopup } };
  const document = { documentElement: {}, querySelectorAll: () => [options] };
  const layout = createEditorPopupLayout({ window, document, elements });
  return { window, viewport, preview, previewPopup, count, countPopup, panel, options, layout,
    nestCount() { nested = true; },
  };
}

test("表示領域が狭く移動しても文字数・プレビュー設定は左右へはみ出さない", () => {
  const f = fixture();
  for (const width of [240, 375, 900]) {
    f.viewport.width = width;
    f.window.emit("resize");
    for (const [popup, anchor] of [[f.previewPopup, f.preview], [f.countPopup, f.count]]) {
      const left = parseFloat(popup.style.left) + anchor.rect.left;
      assert.ok(left >= f.viewport.offsetLeft + 12);
      assert.ok(left + parseFloat(popup.style.width) <= f.viewport.offsetLeft + width - 12);
    }
  }
});

test("閉じた設定は再配置せず、歯車内へ入った文字数設定の古い座標を解除する", () => {
  const f = fixture();
  f.preview.open = false;
  f.window.emit("resize");
  assert.deepEqual(f.previewPopup.style, {});
  f.countPopup.styles.width = "200px";
  f.countPopup.styles.left = "30px";
  f.nestCount();
  f.count.emit("toggle");
  assert.deepEqual(f.countPopup.styles, {});
});

test("歯車は変形されたツールバーの座標を補正し、縦横の可視範囲に収める", () => {
  const f = fixture();
  f.viewport.emit("scroll");
  const left = parseFloat(f.panel.style.left) + f.options.rect.left;
  const top = parseFloat(f.panel.style.top) + f.options.rect.top;
  assert.ok(left >= 42);
  assert.ok(left + parseFloat(f.panel.style.width) <= 278);
  assert.ok(top >= 32);
  assert.ok(top + parseFloat(f.panel.style.maxHeight) <= 278);
  assert.equal(f.panel.style.position, "absolute");
  assert.equal(f.panel.style.overflowY, "auto");
  f.panel.contents = true;
  f.panel.style = {};
  f.layout.positionEditorOptionsPanels();
  assert.deepEqual(f.panel.style, {});
});
