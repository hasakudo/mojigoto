import { manuscriptBodyKey } from './whole-manuscript-body.mjs';
import { captureReadingPosition, restoreReadingPosition } from './whole-manuscript-position.mjs';
import { createWholeManuscriptBody } from './whole-manuscript-body.mjs';

export function createWholeManuscriptReader({ elements: e, document, current, state,
  onSettingChange = (field, value) => { state['manuscriptPreview' + field] = value; },
  onOpenManuscript, beginMeasurement = () => () => {}, createBody = createWholeManuscriptBody }) {
  let session = null, files = [], window = [], generation = 0, busy = false, failed = null, editing = false, activeChunk = null;
  const make = (tag, text = '', cls = '') => { const el = document.createElement(tag); el.textContent = text; el.className = cls; return el; };
  const view = document.defaultView, bookmarks = new Map();
  let lastPosition = null, scheduled = false, layoutSize = null;
  const vertical = () => state.manuscriptPreviewMode === 'vertical';
  function checkpoint(force = false) {
    if (e.wholeBodyPane.hidden) return;
    const content = e.wholeBodyContent;
    // Resize can emit a scroll event before ResizeObserver. Keep the pre-resize anchor.
    if (!force && (scheduled || (layoutSize && (content.clientWidth !== layoutSize.width || content.clientHeight !== layoutSize.height)))) return;
    const position = captureReadingPosition(e.wholeBodyContent, vertical());
    if (position) {
      lastPosition = position; bookmarks.delete(position.key); bookmarks.set(position.key, position);
      if (bookmarks.size > 100) bookmarks.delete(bookmarks.keys().next().value);
    }
    return position;
  }
  function syncSettings(force = false) {
    for (const field of ['Mode','Font','FontSize','LineCharacters','LineHeight']) {
      const el = e['wholeBody' + field]; if (el && (force || document.activeElement !== el)) el.value = String(state['manuscriptPreview' + field] ?? ({Mode:'horizontal',Font:'mincho',FontSize:15,LineCharacters:40,LineHeight:1.9})[field]);
    }
    if (e.wholeBodyAutoFit) e.wholeBodyAutoFit.checked = state.manuscriptPreviewAutoFit !== false;
    if (e.wholeBodyLineCharacters) e.wholeBodyLineCharacters.disabled = state.manuscriptPreviewAutoFit !== false;
    if (e.wholeBodyVerticalSettings) e.wholeBodyVerticalSettings.hidden = !vertical();
  }
  function applyLayout() {
    const content = e.wholeBodyContent, isVertical = vertical();
    content.className = 'whole-body-content' + (isVertical ? ' vertical' : '');
    const available = Math.max(1, content.clientHeight || 400), padding = 24;
    const size = state.manuscriptPreviewFontSize || 15;
    const fontSize = isVertical && state.manuscriptPreviewAutoFit === false ? Math.min(size, Math.max(1, (available - padding) / (state.manuscriptPreviewLineCharacters || 40))) : size;
    content.style?.setProperty('--preview-font-size', fontSize + 'px');
    content.style?.setProperty('--whole-paper-height', (isVertical && state.manuscriptPreviewAutoFit === false ? Math.min(available, fontSize * (state.manuscriptPreviewLineCharacters || 40) + padding) : available) + 'px');
    content.style?.setProperty('--preview-line-height', String(state.manuscriptPreviewLineHeight || 1.9));
    for (const chunk of window) chunk.node.className = 'manuscript-preview-paper whole-body-part ' + (isVertical ? 'vertical' : 'horizontal');
    layoutSize = {width:content.clientWidth, height:content.clientHeight};
  }
  function settingsChanged() {
    syncSettings();
    if (scheduled || e.wholeBodyPane.hidden) return;
    scheduled = true; const token = generation;
    const work = () => {
      scheduled = false; if (token !== generation || !current() || e.wholeBodyPane.hidden) return;
      const finish = beginMeasurement('全体本文・表示調整', { mode: vertical() ? 'vertical' : 'horizontal' });
      const position = lastPosition; applyLayout();
      const restored = restoreReadingPosition(e.wholeBodyContent, position, vertical()); checkpoint(true);
      finish({ restored, retainedParts: window.length });
    };
    if (view?.requestAnimationFrame) view.requestAnimationFrame(work); else work();
  }
  function positionAt(node) {
    const content = e.wholeBodyContent;
    content.scrollTop = 0; content.scrollLeft = 0;
    if (node.getBoundingClientRect) {
      const r = node.getBoundingClientRect(), viewport = content.getBoundingClientRect();
      if (vertical()) content.scrollLeft += r.right - viewport.right;
      else content.scrollTop += r.top - viewport.top;
    }
    checkpoint(true);
  }
  async function editCurrent() {
    if (busy || editing || !onOpenManuscript || !current()) return;
    const position = checkpoint();
    const chunk = window.find(c => manuscriptBodyKey(c.row.item) === position?.key && (c.startLine || 0) <= position.line && (c.startLine || 0) + (c.blocks?.length || 0) > position.line) || activeChunk;
    if (!chunk) return;
    const token = generation; editing = true; controls(); e.wholeBodyStatus.textContent = '保存・読込中…';
    try {
      const opened = await onOpenManuscript({row:chunk.row, isCurrent:() => token === generation && current()});
      if (!opened && token === generation && current()) e.wholeBodyStatus.textContent = '移動できませんでした。もう一度お試しください。';
    } catch (error) { if (token === generation && current()) e.wholeBodyStatus.textContent = error.message || '原稿を開けませんでした。'; }
    finally { if (token === generation) { editing = false; controls(); } }
  }
  function controls() {
    if (e.wholeBodyEdit) { e.wholeBodyEdit.disabled = busy || editing || !activeChunk; e.wholeBodyEdit.hidden = !onOpenManuscript; }
    if (e.wholeBodyBack) e.wholeBodyBack.disabled = editing;
    e.wholeBodyPrevious.disabled = busy || editing || !session || !window[0]?.previous;
    e.wholeBodyNext.disabled = busy || editing || !session || !window.at(-1)?.next;
    e.wholeBodyRetry.hidden = !failed; e.wholeBodyRetry.disabled = busy;
    e.wholeBodyStop.hidden = !busy;
  }
  function leave({ remember = false } = {}) {
    if (remember) checkpoint(); else bookmarks.clear();
    lastPosition = null; scheduled = false;
    generation++; session?.cancel(); session = null; window = []; busy = false; failed = null; editing = false; activeChunk = null;
    e.wholeBodyPane.hidden = true; if (e.wholeBodySettings) e.wholeBodySettings.open = false; if (e.wholeBodySource) e.wholeBodySource.hidden = true; e.wholeBodyContent.replaceChildren(); controls();
  }
  function build(chunk) {
    const article = make('article', '', 'manuscript-preview-paper horizontal whole-body-part');
    article.setAttribute?.('aria-label', chunk.row.path);

    if (chunk.error) { article.append(make('p', chunk.error, 'field-help')); return article; }
    for (const [blockIndex, block] of chunk.blocks.entries()) {
      const node = make(block.type === 'heading' ? `h${block.level + 1}` : 'p', '', block.type === 'blank' ? 'manuscript-preview-blank' : '');
      Object.assign(node.dataset ||= {}, {wholeFile: manuscriptBodyKey(chunk.row.item), wholeLine: String((chunk.startLine || 0) + blockIndex), wholePart: String(chunk.part)});
      for (const token of block.tokens) {
        if (token.type === 'ruby') { const ruby = make('ruby'); ruby.append(document.createTextNode(token.text), make('rt', token.reading)); node.append(ruby); }
        else if (token.type === 'emphasis') node.append(make('span', token.text, 'manuscript-preview-emphasis'));
        else node.append(document.createTextNode(token.text));
      }
      if (block.type === 'blank') node.append(document.createTextNode('\u00a0'));
      article.append(node);
    }
    return article;
  }
  async function show(pointer, direction = 'replace', resumePosition = null) {
    if (busy || editing || !session || !current()) return;
    const token = generation, source = session;
    busy = true; failed = null; controls(); e.wholeBodyStatus.textContent = '読込中…';
    let chunk;
    try { chunk = await source.get(pointer); }
    catch (error) {
      if (token !== generation || !current()) return;
      failed = { pointer, direction };
      // Keep unreadable files in sequence, distinct from empty manuscripts.
      chunk = { row: files[pointer.index], index: pointer.index, part: 0, parts: 1, error: error.message || '本文を取得できません。',
        previous: pointer.index ? { index: pointer.index - 1, part: -1 } : null,
        next: pointer.index + 1 < files.length ? { index: pointer.index + 1, part: 0 } : null };
    }
    if (token !== generation || !current()) return;
    const finish = beginMeasurement('全体本文・描画', { file: chunk.index + 1, part: chunk.part + 1, mode: vertical() ? 'vertical' : 'horizontal' });
    const node = build(chunk); chunk.node = node;
    if (direction === 'next') { window.push(chunk); if (window.length > 3) window.shift(); }
    else if (direction === 'previous') { window.unshift(chunk); if (window.length > 3) window.pop(); }
    else if (direction === 'retry') { const at = window.findIndex(c => c.index === chunk.index && c.error); if (at >= 0) window[at] = chunk; else window = [chunk]; }
    else window = [chunk];
    e.wholeBodyContent.replaceChildren(...window.map(c => c.node));
    applyLayout();
    // The user explicitly requested a new portion; position its start without touching the editor.
    positionAt(node);
    if (resumePosition && restoreReadingPosition(e.wholeBodyContent, resumePosition, vertical())) checkpoint(true);
    busy = false; activeChunk = chunk;
    const detail = chunk.row.path + ' — ' + (chunk.index + 1) + ' / ' + files.length + ' 原稿' + (chunk.parts > 1 ? '・本文 ' + (chunk.part + 1) + ' / ' + chunk.parts : '') + (chunk.local ? chunk.dirty ? '・開いた時点の未保存の内容' : '・開いた時点の入力内容' : '');
    e.wholeBodyStatus.textContent = chunk.error ? '取得失敗' : (chunk.index + 1) + '/' + files.length + (chunk.parts > 1 ? ' · ' + (chunk.part + 1) + '/' + chunk.parts : '') + (chunk.next ? '' : ' · 末尾');
    e.wholeBodyStatus.title = detail;
    if (e.wholeBodyFileInfo) e.wholeBodyFileInfo.textContent = detail;
    if (e.wholeBodySource) e.wholeBodySource.hidden = !window.some(part => part.dirty);
    controls(); finish({ blocks: chunk.blocks?.length || 0, retainedParts: window.length });
  }
  function open({ provider, rows, snapshot, index = 0, resume = true }) {
    leave({remember:true}); files = rows; const token = generation;
    session = createBody({ provider, files, snapshot, current: () => token === generation && current(), beginMeasurement });
    e.wholeBodyPane.hidden = false;
    syncSettings();
    e.wholeBodyContent.style?.setProperty('--preview-font-size', `${state.manuscriptPreviewFontSize || 15}px`);
    const saved = resume ? bookmarks.get(manuscriptBodyKey(rows[index]?.item)) : null;
    return show({ index, part: saved?.part || 0 }, 'replace', saved);
  }
  e.wholeBodyEdit?.addEventListener('click', editCurrent);
  e.wholeBodyNext.addEventListener('click', () => { if (window.at(-1)?.next) return show(window.at(-1).next, 'next'); });
  e.wholeBodyPrevious.addEventListener('click', () => { if (window[0]?.previous) return show(window[0].previous, 'previous'); });
  e.wholeBodyRetry.addEventListener('click', () => { if (failed) return show(failed.pointer, 'retry'); });
  e.wholeBodyStop.addEventListener('click', () => {
    generation++; session?.cancel(); session = null; busy = false; failed = null;
    e.wholeBodyStatus.textContent = '読込中止 · 目次から再開'; controls();
  });
  e.wholeBodyContent.addEventListener('scroll', () => checkpoint(), {passive:true});
  e.wholeBodyContent.addEventListener('wheel', event => {
    if (!vertical()) return;
    const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (movement) { event.preventDefault(); e.wholeBodyContent.scrollLeft -= movement; }
  }, {passive:false});
  for (const field of ['Mode','Font','FontSize','AutoFit','LineCharacters','LineHeight']) {
    const el = e['wholeBody' + field];
    el?.addEventListener('change', () => {
      checkpoint();
      const value = field === 'AutoFit' ? el.checked : ['FontSize','LineCharacters','LineHeight'].includes(field) ? Number(el.value) : el.value;
      onSettingChange(field, value); syncSettings(true); settingsChanged();
    });
  }
  if (view?.ResizeObserver) new view.ResizeObserver(settingsChanged).observe(e.wholeBodyContent);
  view?.addEventListener('resize', settingsChanged, {passive:true});
  document.fonts?.addEventListener('loadingdone', settingsChanged);
  return { open, leave, settingsChanged, visible: () => !e.wholeBodyPane.hidden };
}

