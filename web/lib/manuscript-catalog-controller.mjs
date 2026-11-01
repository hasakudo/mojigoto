import { manuscriptCatalogLocation } from './preview-manuscript-navigation.mjs';
import { createWholeManuscriptReader } from './whole-manuscript-reader.mjs';
import { manuscriptBodyKey } from './whole-manuscript-body.mjs';
import { createManuscriptCatalogJob } from './manuscript-catalog.mjs';
const PAGE_SIZE = 50;
export function createManuscriptCatalogController({ state, elements: e, document, scopeKey, notify, onSettingChange, openManuscript, beginMeasurement = () => () => {}, createJob = createManuscriptCatalogJob }) {
  let owner = null, job = null, generation = 0, result = null, page = 0, pending = false, finishMeasurement = null;
  let inputSnapshot = null;
  const body = e.wholeBodyPane ? createWholeManuscriptReader({ elements: e, document, current: () => Boolean(current()), state, beginMeasurement, onSettingChange,
    onOpenManuscript: openManuscript ? async ({row, isCurrent}) => {
      const originalOwner = owner;
      const location = manuscriptCatalogLocation(result?.rows || [], owner.work.manuscript, row.key);
      const opened = await openManuscript({...location, isCurrent: () => current() && isCurrent()});
      if (opened) { if (owner === originalOwner) close(); e.readerContent?.focus?.({preventScroll:true}); }
      return opened;
    } : undefined }) : null;
  function layout(reading = false) {
    (e.wholeManuscriptDialog.dataset ||= {}).reading = String(reading);
    if (e.wholeBodyNavigation) e.wholeBodyNavigation.hidden = !reading;
    e.wholeManuscriptList.hidden = reading;
    if (e.wholeManuscriptPagination) e.wholeManuscriptPagination.hidden = reading;
    if (e.wholeManuscriptToolbar) e.wholeManuscriptToolbar.hidden = reading;
    if (e.wholeManuscriptHelp) e.wholeManuscriptHelp.hidden = reading;
    if (e.wholeBodyBack) e.wholeBodyBack.hidden = !reading;
  }
  function readFile(index = 0, resume = false) {
    if (!current() || pending || !body) return;
    const files = (result?.rows || []).filter(row => row.kind === 'file' && row.status === 'listed');
    if (!files.length) return;
    layout(true);
    e.wholeManuscriptNotice.hidden = Boolean(result.complete);
    e.wholeManuscriptNotice.textContent = result.complete ? '' : '目次が一部未取得のため、取得できた原稿だけを表示します。';
    return body.open({ provider: owner.provider, rows: files, snapshot: inputSnapshot, index, resume });
  }
  const view = () => !e.filesSection.hidden ? `list:${state.manuscriptFolder?.id || ''}` : !e.readerSection.hidden ? `reader:${state.currentFile?.id || ''}` : '';
  const rootKey = () => JSON.stringify([state.selectedWork?.manuscript?.id || "", state.selectedWork?.manuscript?.parentReference?.driveId || ""]);
  const current = () => owner && state.provider === owner.provider && state.selectedWork === owner.work && scopeKey() === owner.scope && rootKey() === owner.rootId && view() === owner.view;
  const make = (tag, text, cls = '') => { const el = document.createElement(tag); el.textContent = text; el.className = cls; return el; };
  function record(data, outcome) {
    if (!finishMeasurement) return;
    const finish = finishMeasurement; finishMeasurement = null;
    finish({ files: data.files, folders: data.checked, lists: data.calls, result: outcome || (data.complete ? "complete" : "partial") });
  }
  function stop() { generation++; if (job) { const partial = job.cancel(); record(partial, "cancelled"); job = null; return partial; } }
  function close() { body?.leave(); inputSnapshot = null; layout(); stop(); owner = null; pending = false; result = null; if (e.wholeManuscriptDialog.open) e.wholeManuscriptDialog.close(); }
  function controls() {
    if (e.wholeBodyOpen) e.wholeBodyOpen.disabled = pending || !result?.files;
    e.stopWholeManuscriptButton.hidden = !pending;
    e.refreshWholeManuscriptButton.disabled = pending;
    e.retryWholeManuscriptButton.hidden = pending || !result?.issues.some(issue => issue.retryable);
    e.wholeManuscriptPrev.disabled = pending || page === 0;
    e.wholeManuscriptNext.disabled = pending || !result || (page + 1) * PAGE_SIZE >= result.rows.length;
  }
  function render() {
    const finishRender = beginMeasurement("全体目次・項目生成", { page: page + 1 });
    e.wholeManuscriptList.replaceChildren();
    const rows = result?.rows || [], pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1); e.wholeManuscriptPage.textContent = `${page + 1} / ${pages}`;
    for (const row of rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const item = make('li', '', `whole-manuscript-row ${row.kind}`);
      const heading = make('div', '', 'whole-manuscript-row-heading');
      heading.append(make('span', row.kind === 'folder' ? '章' : '原稿', 'whole-manuscript-kind'), make('strong', row.name));
      item.append(heading, make('small', row.path, 'muted'));
      if (body && row.kind === 'file' && row.status === 'listed') {
        const button = make('button', '読む', 'text-button'); button.type = 'button';
        button.addEventListener('click', () => readFile(result.rows.filter(r => r.kind === 'file' && r.status === 'listed').findIndex(r => r.key === row.key), true));
        heading.append(button);
      }
      if (row.status === 'pending' || row.status === 'loading') item.append(make('p', 'この章の原稿は未取得です。', 'muted'));
      if (row.message) item.append(make('p', row.message, 'muted'));
      e.wholeManuscriptList.append(item);
    }
    if (!rows.length) e.wholeManuscriptList.append(make('li', result?.complete ? '原稿ファイルがありません。' : '取得できた項目はありません。', 'muted'));
    const rowKeys = new Set(rows.map(row => row.key));
    const rootIssue = result?.issues.find(issue => !rowKeys.has(issue.key));
    e.wholeManuscriptNotice.hidden = !rootIssue;
    e.wholeManuscriptNotice.textContent = rootIssue ? `原稿ルート：${rootIssue.message}` : '';
    controls();
    finishRender({ rows: Math.min(PAGE_SIZE, rows.length - page * PAGE_SIZE) });
  }
  function status(data, loading = false) {
    const prefix = loading ? '目次を読み込んでいます…' : data.cancelled ? '読み込みを中止しました。' : data.complete ? '目次を取得しました。' : '一部を取得できませんでした。';
    e.wholeManuscriptStatus.textContent = `${prefix} 原稿 ${data.files}件・確認済みフォルダ ${data.checked}件${data.excluded ? `・対象外 ${data.excluded}件` : ''}（${(data.elapsedMs / 1000).toFixed(1)}秒）`;
  }
  async function start(retry = false) {
    if (!current()) { close(); return; }
    const cachedListings = retry ? result?.listings : undefined;
    body?.leave(); layout(); stop(); const token = generation; pending = true; result = null; page = 0;
    e.wholeManuscriptStatus.textContent = '目次を読み込んでいます…'; e.wholeManuscriptNotice.hidden = true;
    e.wholeManuscriptList.replaceChildren(); controls();
    finishMeasurement = beginMeasurement("全体目次・取得", { source: retry ? "retry" : "fresh" });
    job = createJob({ provider: owner.provider, root: owner.work.manuscript, cachedListings, current: () => token === generation && current(), onProgress: data => { if (token === generation && current()) status(data, true); } });
    try {
      const data = await job.promise;
      if (token !== generation) return;
      if (!current()) { close(); return; }
      record(data); result = data; job = null; pending = false; status(data); render();
    } catch (error) { if (token === generation && current()) { record({files:0,checked:0,calls:0}, "error"); pending = false; job = null; e.wholeManuscriptStatus.textContent = error.message || '目次を取得できませんでした。'; controls(); } }
  }
  function open() {
    if (!state.provider || !state.selectedWork?.manuscript?.id || !view()) { notify('作品の原稿フォルダを開いてから利用してください。', true); return; }
    close();
    owner = { provider: state.provider, work: state.selectedWork, scope: scopeKey(), rootId: rootKey(), view: view() };
    inputSnapshot = !e.readerSection.hidden && state.currentFile?.id ? { key: manuscriptBodyKey(state.currentFile), text: String(e.readerContent?.value ?? ''), dirty: Boolean(state.dirty) } : null;
    e.wholeManuscriptTitle.textContent = `${state.selectedWork.title || '作品'} / 全体プレビュー`;
    if (e.readerPreviewLauncher) e.readerPreviewLauncher.open = false;
    e.wholeManuscriptDialog.showModal(); start();
  }
  e.openWholeManuscriptButton.addEventListener('click', open);
  e.readerWholeManuscriptButton.addEventListener('click', open);
  e.closeWholeManuscriptButton.addEventListener('click', close);
  e.wholeManuscriptDialog.addEventListener('close', () => { body?.leave(); inputSnapshot = null; stop(); owner = null; result = null; });
  e.stopWholeManuscriptButton.addEventListener('click', () => { const partial = stop(); if (partial) { pending = false; result = partial; status(partial); render(); } });
  e.refreshWholeManuscriptButton.addEventListener('click', () => start());
  e.retryWholeManuscriptButton.addEventListener('click', () => start(true));
  e.wholeManuscriptPrev.addEventListener('click', () => { if (!pending && page > 0) { page--; render(); e.wholeManuscriptList.scrollTop = 0; } });
  e.wholeManuscriptNext.addEventListener('click', () => { if (!pending && result && (page + 1) * PAGE_SIZE < result.rows.length) { page++; render(); e.wholeManuscriptList.scrollTop = 0; } });
  e.wholeBodyOpen?.addEventListener('click', () => readFile());
  e.wholeBodyBack?.addEventListener('click', () => { body?.leave({remember:true}); layout(); render(); });
  return { open, close, settingsChanged: () => body?.settingsChanged(), changed: () => { if (owner && !current()) close(); } };
}

