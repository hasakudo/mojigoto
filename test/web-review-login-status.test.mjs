import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../web/review-login/review-login.js', import.meta.url), 'utf8');

function page(fetch) {
  const elements = { reviewLoginStatus: { textContent: '' }, reviewLoginAvailable: { hidden: true } };
  let refresh;
  vm.runInNewContext(script, {
    document: { getElementById: (id) => elements[id] },
    window: { addEventListener: (event, handler) => { assert.equal(event, 'pageshow'); refresh = handler; } },
    AbortSignal,
    fetch,
  });
  return { elements, refresh: () => refresh() };
}

test('審査ログインは有効時だけ表示し、戻る操作でも停止設定を再確認する', async () => {
  let enabled = true;
  const { elements, refresh } = page(async (url, options) => {
    assert.equal(url, '../api/auth/review-status/');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ enabled }) };
  });
  assert.equal(elements.reviewLoginAvailable.hidden, true);
  await refresh();
  assert.equal(elements.reviewLoginAvailable.hidden, false);
  enabled = false;
  const pending = refresh();
  assert.equal(elements.reviewLoginAvailable.hidden, true);
  await pending;
  assert.match(elements.reviewLoginStatus.textContent, /現在停止中/);
});

for (const [name, fetch] of [
  ['通信失敗', async () => { throw new Error('offline'); }],
  ['API未配置', async () => ({ ok: false })],
  ['不正な状態値', async () => ({ ok: true, json: async () => ({ enabled: 'true' }) })],
]) {
  test(`審査ログインは${name}時にボタンを隠し、停止と通信エラーを区別する`, async () => {
    const { elements, refresh } = page(fetch);
    await refresh();
    assert.equal(elements.reviewLoginAvailable.hidden, true);
    assert.match(elements.reviewLoginStatus.textContent, /確認できませんでした/);
    assert.doesNotMatch(elements.reviewLoginStatus.textContent, /現在停止中/);
  });
}
