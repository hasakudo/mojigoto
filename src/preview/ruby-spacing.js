const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

function getMonoRubyReadingLength(token) {
  if (token?.type !== 'ruby') return 0;
  const base = Array.from(segmenter.segment(String(token.displayText || '')));
  const reading = Array.from(segmenter.segment(String(token.rubyText || '')));
  if (base.length !== 1 || !reading.length) return 0;
  return reading.length;
}

// Line breaking follows the base character, independently of its annotation.
function getMonoRubyAdvance(token) {
  return getMonoRubyReadingLength(token) ? 1 : 0;
}

function positionMonoRubyAnnotations(tokens) {
  const result = Array.isArray(tokens) ? [...tokens] : [];
  const annotated = token => token?.type === 'ruby' || token?.type === 'bouten';
  for (let start = 0; start < result.length;) {
    if (!getMonoRubyAdvance(result[start])) { start++; continue; }
    let end = start + 1;
    while (end < result.length && getMonoRubyAdvance(result[end])) end++;
    const count = end - start;
    // Borrow at most half a base cell at either end, without intruding into
    // the neighboring group ruby / emphasis. Never change the base advance.
    const lower = annotated(result[start - 1]) ? 0 : -0.5;
    const upper = count + (annotated(result[end]) ? 0 : 0.5);
    const naturalLengths = result.slice(start, end).map(token => getMonoRubyReadingLength(token) * 0.5);
    const lengths = naturalLengths.map(length => Math.min(2, length));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let scale = Math.min(1, (upper - lower) / total);
    // Keep each annotation near its own character, even if one reading is
    // much longer than all the others. A long annotation must not displace
    // the following readings by several base cells.
    const fits = candidate => {
      let edge = lower;
      for (let index = 0; index < count; index++) {
        const width = lengths[index] * candidate;
        const position = Math.max(edge, index - width / 2);
        if (position > index + 1 - width / 2 + 1e-10) return false;
        edge = position + width;
      }
      return edge <= upper + 1e-10;
    };
    if (!fits(scale)) {
      let low = 0, high = scale;
      for (let step = 0; step < 32; step++) {
        const middle = (low + high) / 2;
        if (fits(middle)) low = middle; else high = middle;
      }
      scale = low;
    }
    const widths = lengths.map(length => length * scale);
    let cursor = lower;
    const positions = widths.map((width, index) => {
      const position = Math.max(cursor, index + 0.5 - width / 2);
      cursor = position + width;
      return position;
    });
    cursor = upper;
    for (let index = count - 1; index >= 0; index--) {
      positions[index] = Math.min(positions[index], cursor - widths[index], index + 1 - widths[index] / 2);
      cursor = positions[index];
    }
    const averageShift = -positions.reduce((sum, position, index) => sum + position + widths[index] / 2 - index - 0.5, 0) / count;
    const minShift = positions.reduce((bound, position, index) => Math.max(bound, index - widths[index] / 2 - position), lower - positions[0]);
    const maxShift = positions.reduce((bound, position, index) => Math.min(bound, index + 1 - widths[index] / 2 - position), upper - positions[count - 1] - widths[count - 1]);
    const shift = Math.max(minShift, Math.min(maxShift, averageShift));
    for (let index = 0; index < count; index++) {
      result[start + index] = { ...result[start + index], monoRubyLayout: {
        positionPercent: (positions[index] + shift + widths[index] / 2 - index) * 100,
        fontEm: 0.5 * scale * lengths[index] / naturalLengths[index],
      } };
    }
    start = end;
  }
  return result;
}

function getMonoRubyStyle(token) {
  const layout = token.monoRubyLayout || positionMonoRubyAnnotations([token])[0]?.monoRubyLayout;
  if (!layout || !Number.isFinite(layout.positionPercent) || !Number.isFinite(layout.fontEm)) return '';
  return `--mjm-mono-position:${layout.positionPercent.toFixed(4)}%;--mjm-mono-font:${Number(layout.fontEm.toPrecision(8))}em;`;
}

module.exports = { getMonoRubyAdvance, positionMonoRubyAnnotations, getMonoRubyStyle };
