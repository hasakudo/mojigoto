import assert from "node:assert/strict";
import test from "node:test";
import { applyInputAssist } from "../web/lib/input-assist.mjs";

test("カーソル位置へ入力補助文字を挿入する", () => {
  assert.deepEqual(
    applyInputAssist("前後", 1, 1, { kind: "insert", text: "……" }),
    { value: "前……後", selectionStart: 3, selectionEnd: 3 },
  );
});

test("選択した本文を括弧で囲み、選択範囲を維持する", () => {
  assert.deepEqual(
    applyInputAssist("彼の言葉", 2, 4, { kind: "wrap", open: "「", close: "」" }),
    { value: "彼の「言葉」", selectionStart: 3, selectionEnd: 5 },
  );
});

test("選択がない場合は括弧の内側へカーソルを置く", () => {
  assert.deepEqual(
    applyInputAssist("本文", 2, 2, { kind: "wrap", open: "（", close: "）" }),
    { value: "本文（）", selectionStart: 3, selectionEnd: 3 },
  );
});

test("選択文字へルビ記法を挿入して読みの位置へカーソルを置く", () => {
  assert.deepEqual(
    applyInputAssist("東京へ", 0, 2, { kind: "ruby" }),
    { value: "|東京《》へ", selectionStart: 4, selectionEnd: 4 },
  );
});

test("選択文字へ傍点記法を挿入する", () => {
  assert.deepEqual(
    applyInputAssist("重要です", 0, 2, { kind: "emphasis" }),
    { value: "《《重要》》です", selectionStart: 6, selectionEnd: 6 },
  );
});

test("選択範囲のルビ・傍点・括弧記法を解除する", () => {
  assert.deepEqual(
    applyInputAssist("前|東京《とうきょう》後", 1, 11, { kind: "unwrap" }),
    { value: "前東京後", selectionStart: 1, selectionEnd: 3 },
  );
  assert.deepEqual(
    applyInputAssist("《《重要》》", 0, 6, { kind: "unwrap" }),
    { value: "重要", selectionStart: 0, selectionEnd: 2 },
  );
  assert.deepEqual(
    applyInputAssist("「台詞」", 0, 4, { kind: "unwrap" }),
    { value: "台詞", selectionStart: 0, selectionEnd: 2 },
  );
});
