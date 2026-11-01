// A position is tied to a source line and rendered base text, never a scroll percentage.
function texts(block) {
  const walker = block.ownerDocument.createTreeWalker(block, 4), result = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('rt') && node.textContent.length) result.push(node);
  }
  return result;
}
function rangeAt(block, nodes, offset) {
  const range = block.ownerDocument.createRange();
  for (const node of nodes) {
    if (offset < node.textContent.length) {
      range.setStart(node, offset); range.setEnd(node, offset + 1); return range;
    }
    offset -= node.textContent.length;
  }
  if (nodes.length) {
    const node = nodes.at(-1), end = node.textContent.length;
    range.setStart(node, end - 1); range.setEnd(node, end); return range;
  }
  return null;
}
export function captureReadingPosition(container, vertical = false) {
  if (!container.getBoundingClientRect || !container.querySelectorAll) return null;
  const viewport = container.getBoundingClientRect();
  if (!viewport.width || !viewport.height) return null;
  for (const block of container.querySelectorAll('[data-whole-line]')) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom <= viewport.top || rect.top >= viewport.bottom || rect.right <= viewport.left || rect.left >= viewport.right) continue;
    const nodes = texts(block), length = nodes.reduce((sum, node) => sum + node.textContent.length, 0);
    if (!length) continue;
    let low = 0, high = length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2), r = rangeAt(block, nodes, mid).getBoundingClientRect();
      if (vertical ? r.left < viewport.right : r.bottom > viewport.top) high = mid; else low = mid + 1;
    }
    const r = rangeAt(block, nodes, low).getBoundingClientRect();
    return { key: block.dataset.wholeFile, line: Number(block.dataset.wholeLine), part: Number(block.dataset.wholePart),
      offset: low, vertical, extent: vertical ? r.right - r.left : r.bottom - r.top, delta: vertical ? r.right - viewport.right : r.top - viewport.top };
  }
  return null;
}
export function restoreReadingPosition(container, position, vertical = false) {
  if (!position || !container.querySelectorAll) return false;
  const block = [...container.querySelectorAll('[data-whole-line]')].find(el => el.dataset.wholeFile === position.key && Number(el.dataset.wholeLine) === position.line);
  if (!block) return false;
  const nodes = texts(block), range = rangeAt(block, nodes, Math.max(0, position.offset || 0));
  if (!range) return false;
  const viewport = container.getBoundingClientRect(), rect = range.getBoundingClientRect();
  let delta = position.vertical === vertical ? Math.max(-32, Math.min(position.delta || 0, (vertical ? viewport.width : viewport.height) * .6)) : 0;
  // Keep a partially clipped glyph visible when fixed line length shrinks the font on rotation.
  const extent = vertical ? rect.right - rect.left : rect.bottom - rect.top;
  if (position.vertical === vertical && position.extent > 0 && (vertical ? delta > 0 : delta < 0)) delta *= extent / position.extent;
  if (vertical) delta = Math.min(delta, Math.max(0, extent - .5));
  else delta = Math.max(delta, -Math.max(0, extent - .5));
  if (vertical) container.scrollLeft += rect.right - viewport.right - delta;
  else container.scrollTop += rect.top - viewport.top - delta;
  return true;
}
