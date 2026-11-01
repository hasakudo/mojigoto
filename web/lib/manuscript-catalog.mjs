import { isManuscriptFile, sortDriveItems, safeDriveItemSnapshot } from './work-discovery.mjs';

// Share the read budget across reopened jobs; a cancelled HTTP request may still be running.
const budgets = new WeakMap();
async function listWithBudget(provider, folderId, current) {
  let budget = budgets.get(provider);
  if (!budget) { budget = { active: 0, waiters: [] }; budgets.set(provider, budget); }
  if (budget.active >= 2) await new Promise(resolve => budget.waiters.push(resolve));
  else budget.active++;
  try { return current() ? await provider.listChildren(folderId) : null; }
  finally { const next = budget.waiters.shift(); if (next) next(); else budget.active--; }
}
const keyFor = (item, drive = '') => JSON.stringify([item?.parentReference?.driveId || drive, String(item?.id || '')]);
const excludedFolder = item => ['.mojigoto', '.git', '_work'].includes(String(item.name || '').toLowerCase());

export function createManuscriptCatalogJob({ provider, root, current = () => true, onProgress = () => {}, cachedListings = new Map(), maxFolders = 300, maxEntries = 10000, maxDepth = 32, now = () => Date.now() }) {
  const started = now(), drive = root.parentReference?.driveId || '';
  const listings = new Map(cachedListings), visited = new Set([keyFor(root, drive)]);
  const rootNode = { key: keyFor(root, drive), name: root.name || '原稿', path: '', depth: 0, kind: 'folder', item: safeDriveItemSnapshot(root), children: [], status: 'pending' };
  const queue = [rootNode]; let stopped = false, finished = false, entries = 0, folders = 1, calls = 0, checked = 0;
  const active = () => !stopped && current();
  function snapshot() {
    const rows = [], issues = []; let files = 0, excluded = 0;
    function visit(node) {
      if (node !== rootNode) rows.push({ key: node.key, name: node.name, path: node.path, depth: node.depth - 1, kind: node.kind, item: node.item, status: node.status, message: node.message || '', retryable: node.status === 'error' && node.retryable === true });
      if (node.kind === 'file' && node.status === 'listed') files++;
      if (node.status === 'excluded') excluded++;
      if (node.status === 'error') issues.push({ key: node.key, path: node.path || '原稿', message: node.message, retryable: Boolean(node.retryable) });
      for (const child of node.children || []) visit(child);
    }
    visit(rootNode);
    return { rows, issues, files, folders, checked, calls, excluded, elapsedMs: Math.max(0, now() - started), cancelled: stopped || !current(), complete: finished && !stopped && current() && issues.length === 0, listings };
  }
  function fail(node, message, retryable = false) { node.status = 'error'; node.message = message; node.retryable = retryable; }
  async function load(node) {
    if (!active()) return;
    node.status = 'loading';
    try {
      let items = listings.get(node.key);
      if (!items) {
        calls++;
        items = await listWithBudget(provider, node.item.id, active);
        if (!active()) return;
        if (!Array.isArray(items)) throw new Error('フォルダの一覧を確認できません。');
        // Store metadata only, with an explicit truncation marker instead of retaining a huge result.
        const truncated = items.length > maxEntries;
        items = { items: items.slice(0, maxEntries).map(item => ({ ...(safeDriveItemSnapshot(item) || {name:String(item?.name || ''), ...(item?.file ? {file:{}} : {}), ...(item?.folder ? {folder:{}} : {})}), remoteLink: Boolean(item?.remoteItem || item?.mimeType === 'application/vnd.google-apps.shortcut') })), truncated };
        listings.set(node.key, items);
      }
      if (!active()) return;
      checked++; node.status = 'loaded';
      const stableItems = [...items.items].sort((a, b) => keyFor(a, drive) < keyFor(b, drive) ? -1 : keyFor(a, drive) > keyFor(b, drive) ? 1 : 0);
      for (const item of sortDriveItems(stableItems)) {
        if (!active()) return;
        if (!item?.folder && !isManuscriptFile(item)) continue;
        if (entries >= maxEntries) { fail(node, '項目数が多いため、一部を取得できませんでした。'); break; }
        entries++;
        const child = { key: keyFor(item, drive), item, name: item.name || '名称未設定', path: node.path ? `${node.path} / ${item.name}` : item.name, depth: node.depth + 1, kind: item.folder ? 'folder' : 'file', children: [], status: item.folder ? 'pending' : 'listed' };
        node.children.push(child);
        if (!item.id) { fail(child, '項目のIDを確認できません。'); continue; }
        if (item.remoteLink || (item.folder && excludedFolder(item)) || String(item.name).startsWith('.__mojigoto_tmp__')) { child.status = 'excluded'; child.message = '参照リンク・管理用の項目は対象外です。'; continue; }
        const parent = item.parentReference?.id || item.parents?.[0];
        if (parent && String(parent) !== String(node.item.id)) { fail(child, '親フォルダを確認できません。'); continue; }
        if (visited.has(child.key)) { child.status = 'excluded'; child.message = '重複する項目は一度だけ表示します。'; continue; }
        visited.add(child.key);
        if (child.kind === 'folder') {
          folders++;
          if (child.depth > maxDepth || folders > maxFolders) fail(child, 'フォルダ数または階層が多いため、取得を停止しました。');
          else queue.push(child);
        }
      }
      if (items.truncated) fail(node, '項目数が多いため、一部を取得できませんでした。');
    } catch (error) { if (active()) fail(node, error.message || 'フォルダを読み込めませんでした。', true); }
    if (active()) onProgress(snapshot());
  }
  const promise = (async () => {
    while (queue.length && active() && entries < maxEntries) await Promise.all(queue.splice(0, 2).map(load));
    if (queue.length && active() && entries >= maxEntries) {
      for (const node of queue) fail(node, "項目数が多いため、未取得の章があります。");
      queue.length = 0;
    }
    finished = active();
    return snapshot();
  })();
  return { promise, cancel: () => { stopped = true; return snapshot(); } };
}
