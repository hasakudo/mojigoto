export function applyInputAssist(value, selectionStart, selectionEnd, command) {
  const source = String(value ?? "");
  const start = Math.max(0, Math.min(source.length, Number(selectionStart) || 0));
  const end = Math.max(start, Math.min(source.length, Number(selectionEnd) || start));
  const selected = source.slice(start, end);

  if (command?.kind === "unwrap") {
    if (!selected) return { value: source, selectionStart: start, selectionEnd: end };
    let replacement = selected;
    const emphasis = replacement.match(/^《《([\s\S]*)》》$/);
    const ruby = replacement.match(/^[|｜]?([^《]+)《[^》]*》$/);
    const pair = [
      ["「", "」"], ["『", "』"], ["（", "）"], ["【", "】"],
      ["〈", "〉"], ["《", "》"], ["〝", "〟"],
    ].find(([open, close]) => replacement.startsWith(open) && replacement.endsWith(close));
    if (emphasis) replacement = emphasis[1];
    else if (ruby) replacement = ruby[1];
    else if (pair) replacement = replacement.slice(pair[0].length, -pair[1].length);
    return {
      value: source.slice(0, start) + replacement + source.slice(end),
      selectionStart: start,
      selectionEnd: start + replacement.length,
    };
  }

  if (command?.kind === "ruby") {
    const base = selected || "漢字";
    const replacement = `|${base}《》`;
    const rubyStart = start + 1 + base.length + 1;
    return {
      value: source.slice(0, start) + replacement + source.slice(end),
      selectionStart: rubyStart,
      selectionEnd: rubyStart,
    };
  }

  if (command?.kind === "emphasis") {
    const base = selected || "文字列";
    const replacement = `《《${base}》》`;
    return {
      value: source.slice(0, start) + replacement + source.slice(end),
      selectionStart: start + replacement.length,
      selectionEnd: start + replacement.length,
    };
  }

  if (command?.kind === "wrap") {
    const open = String(command.open || "");
    const close = String(command.close || "");
    const replacement = `${open}${selected}${close}`;
    return {
      value: source.slice(0, start) + replacement + source.slice(end),
      selectionStart: start + open.length,
      selectionEnd: selected ? start + open.length + selected.length : start + open.length,
    };
  }

  const text = String(command?.text || "");
  return {
    value: source.slice(0, start) + text + source.slice(end),
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

export function applyInputAssistToTextarea(textarea, command) {
  if (!textarea) return false;
  const result = applyInputAssist(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    command,
  );
  textarea.value = result.value;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
