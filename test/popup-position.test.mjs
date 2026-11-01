import assert from "node:assert/strict";
import test from "node:test";
import { editorPopupPosition } from "../web/lib/popup-position.mjs";

test("歯車が左寄りでも操作ポップアップを左右の画面端へ収める", () => {
  for (const width of [240, 320, 375, 600, 840, 1440]) {
    for (const right of [35, 175, width - 12]) {
      const viewport = { left: 0, top: 0, width, height: 700 };
      const position = editorPopupPosition({ right, top: 17, bottom: 51 }, viewport, 280, 260);
      assert.ok(position.left >= 8);
      assert.ok(position.left + position.width <= width - 8);
      assert.ok(position.top >= 8);
      assert.ok(position.top + Math.min(260, position.maxHeight) <= 692);
    }
  }
});

test("拡大・キーボード・セーフエリアを含む表示領域に収める", () => {
  const viewport = { left: 80, top: 30, width: 250, height: 240 };
  const position = editorPopupPosition({ right: 270, top: 145, bottom: 180 }, viewport, 280, 300,
    { left: 20, right: 25, top: 10, bottom: 20 });
  assert.ok(position.left >= 100);
  assert.ok(position.left + position.width <= 305);
  assert.ok(position.top >= 40);
  assert.ok(position.top + position.maxHeight <= 250);
});

test("下側が足りない場合は上側を使い、長いメニューはスクロールする", () => {
  const position = editorPopupPosition({ right: 200, top: 220, bottom: 254 },
    { left: 0, top: 0, width: 320, height: 300 }, 220, 500);
  assert.equal(position.top, 8);
  assert.equal(position.maxHeight, 205);
});
