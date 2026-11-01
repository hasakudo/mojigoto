function parseMonoReadings(value) {
  const result = [''];
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\' && (text[index + 1] === '/' || text[index + 1] === '\\')) {
      result[result.length - 1] += text[++index];
    } else if (char === '/') {
      result.push('');
    } else {
      result[result.length - 1] += char;
    }
  }
  return result;
}

function formatMonoReadings(readings) {
  return readings.map(value => value.replace(/\\/g, '\\\\').replace(/\//g, '\\/')).join('/');
}

module.exports = { parseMonoReadings, formatMonoReadings };
