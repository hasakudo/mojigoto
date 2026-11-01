import { parseManuscriptPreview } from './manuscript-preview.mjs';

// Reopened readers share this budget because provider reads cannot be aborted yet.
const budgets = new WeakMap();
async function read(provider, item, current) {
  let b = budgets.get(provider);
  if (!b) { b = { active: 0, waiters: [] }; budgets.set(provider, b); }
  if (b.active >= 2) await new Promise(resolve => b.waiters.push(resolve)); else b.active++;
  try { if (!current()) throw Error('閲覧を終了しました。'); return await provider.readText(item); }
  finally { const next = b.waiters.shift(); if (next) next(); else b.active--; }
}
export const manuscriptBodyKey = item => JSON.stringify([item?.parentReference?.driveId || '', item?.id || '']);

export function createWholeManuscriptBody({ provider, files, snapshot = null, current = () => true,
  beginMeasurement = () => () => {}, maxFileCharacters = 1000000, maxCacheCharacters = 2000000,
  maxCacheFiles = 3, maxLines = 60, chunkCharacters = 12000, maxLineCharacters = 24000 }) {
  const cache = new Map(); let characters = 0, stopped = false;
  const active = () => !stopped && current();
  async function load(index) {
    if (!active()) throw Error('閲覧を終了しました。');
    if (cache.has(index)) { const value = cache.get(index); cache.delete(index); cache.set(index, value); return value; }
    const row = files[index];
    const local = snapshot && manuscriptBodyKey(row.item) === snapshot.key;
    const finish = beginMeasurement('全体本文・取得', { file: index + 1, source: local ? 'input' : 'cloud' });
    let raw;
    try {
      raw = local ? snapshot.text : await read(provider, row.item, active);
      if (!active()) throw Error('閲覧を終了しました。');
      if (typeof raw !== 'string') throw Error('本文を確認できません。');
      if (raw.length > maxFileCharacters) throw Error('原稿が長いため全体表示の上限を超えました。この原稿は個別プレビューで確認してください。');
      const lines = raw.replace(/\r\n?/g, '\n').split('\n'), starts = [0];
      let count = 0, length = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > maxLineCharacters) throw Error('一行が長いため全体表示の上限を超えました。この原稿は個別プレビューで確認してください。');
        if (count && (count >= maxLines || length + lines[i].length + 1 > chunkCharacters)) { starts.push(i); count = 0; length = 0; }
        count++; length += lines[i].length + 1;
      }
      const value = { lines, starts, characters: raw.length, local: Boolean(local), dirty: Boolean(local && snapshot.dirty) };
      while (cache.size && (cache.size >= maxCacheFiles || characters + raw.length > maxCacheCharacters)) {
        const oldest = cache.keys().next().value; characters -= cache.get(oldest).characters; cache.delete(oldest);
      }
      cache.set(index, value); characters += raw.length;
      finish({ result: 'complete', characters: raw.length, parts: starts.length });
      return value;
    } catch (error) { finish({ result: active() ? 'error' : 'cancelled' }); throw error; }
  }
  return {
    async get(pointer) {
      const index = pointer.index, row = files[index];
      if (!row) throw Error('原稿を確認できません。');
      const data = await load(index);
      if (!active()) throw Error('閲覧を終了しました。');
      const part = pointer.part < 0 ? data.starts.length - 1 : Math.min(pointer.part || 0, data.starts.length - 1);
      const start = data.starts[part], end = data.starts[part + 1] ?? data.lines.length;
      return { row, index, part, parts: data.starts.length, local: data.local, dirty: data.dirty,
        startLine: start, blocks: parseManuscriptPreview(data.lines.slice(start, end).join('\n')),
        previous: part ? { index, part: part - 1 } : index ? { index: index - 1, part: -1 } : null,
        next: part + 1 < data.starts.length ? { index, part: part + 1 } : index + 1 < files.length ? { index: index + 1, part: 0 } : null };
    },
    cancel() { stopped = true; cache.clear(); characters = 0; },
    stats: () => ({ files: cache.size, characters }),
  };
}
