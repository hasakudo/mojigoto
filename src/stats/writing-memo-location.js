const path = require('path');

// Display-only classification of the resolved manuscript, never the stored origin.
function getWritingMemoLocationLabel(absoluteFilePath, { viewRoot = '', workRoots = [] } = {}) {
  if (!absoluteFilePath) return '参照先不明';
  const normalize = value => {
    const result = path.resolve(value);
    return process.platform === 'win32' ? result.toLowerCase() : result;
  };
  const file = normalize(absoluteFilePath);
  const candidates = [
    ...(viewRoot ? [{ root: viewRoot, label: 'View側' }] : []),
    ...workRoots.filter(Boolean).map(root => ({ root, label: '作品元側' })),
  ].map(candidate => ({ ...candidate, root: normalize(candidate.root) }))
    .filter(candidate => {
      const relative = path.relative(candidate.root, file);
      return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
    })
    .sort((left, right) => right.root.length - left.root.length);
  return candidates[0]?.label || '参照先未確認';
}

module.exports = { getWritingMemoLocationLabel };
