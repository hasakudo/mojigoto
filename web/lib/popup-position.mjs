export function editorPopupPosition(anchor, viewport, desiredWidth, desiredHeight, padding = {}) {
  const leftEdge = viewport.left + Math.max(8, padding.left || 0);
  const rightEdge = viewport.left + viewport.width - Math.max(8, padding.right || 0);
  const topEdge = viewport.top + Math.max(8, padding.top || 0);
  const bottomEdge = viewport.top + viewport.height - Math.max(8, padding.bottom || 0);
  const width = Math.max(0, Math.min(desiredWidth, rightEdge - leftEdge));
  const left = Math.max(leftEdge, Math.min(anchor.right - width, rightEdge - width));
  const below = Math.max(topEdge, Math.min(anchor.bottom + 7, bottomEdge));
  const above = Math.max(0, Math.min(anchor.top - 7, bottomEdge) - topEdge);
  const useAbove = bottomEdge - below < Math.min(120, desiredHeight) && above > bottomEdge - below;
  const maxHeight = useAbove ? above : bottomEdge - below;
  const top = useAbove ? Math.max(topEdge, anchor.top - 7 - Math.min(desiredHeight, maxHeight)) : below;
  return { left, top, width, maxHeight };
}
