const { parseMonoReadings, formatMonoReadings } = require('./ruby-reading-input');

function initializeRubyEditor() {
  const api = acquireVsCodeApi();
  const list = document.getElementById("targets");
  const notice = document.getElementById("notice");
  const apply = document.getElementById("apply");
  let targets = [], stale = false, pending = false, lastCompositionEnd = -Infinity;
  const composing = new Set();
  const node = (tag, text = "", className = "") => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  function valid(target) {
    const draft = target.draft;
    if (draft.mode === 'mono' && draft.readings.length !== target.chars.length) return false;
    const values = draft.mode === "group" ? [draft.groupReading] : draft.readings;
    return values.some(value => value.trim()) && values.every(value => !/[|｜《》\r\n]/u.test(value));
  }
  function updateApply() {
    apply.disabled = stale || pending || composing.size > 0 || !targets.length || targets.some(target => !valid(target));
    list.querySelectorAll('input').forEach(input => {
      if (input.type === 'radio') input.disabled = stale || pending;
      else input.readOnly = stale || pending;
    });
    document.getElementById('cancel').disabled = pending;
  }
  function preview(target, root, code) {
    root.replaceChildren();
    const ruby = (base, reading) => {
      if (!reading) return document.createTextNode(base);
      const result = node("ruby");
      result.append(document.createTextNode(base), node("rp", "（"), node("rt", reading), node("rp", "）"));
      return result;
    };
    const draft = target.draft;
    if (draft.mode === "group") {
      root.append(ruby(target.base, draft.groupReading));
      code.textContent = draft.groupReading ? `${target.pipe}${target.base}《${draft.groupReading}》` : "ルビを入力してください";
    } else {
      target.chars.forEach((char, index) => root.append(ruby(char, draft.readings[index])));
      code.textContent = target.chars.map((char, index) => draft.readings[index] ? `${target.pipe}${char}《${draft.readings[index]}》` : char).join("");
    }
    updateApply();
  }
  function renderTarget(target, index) {
    const card = node("section", "", "target");
    card.append(node("h2", target.base));
    const modeLabel = node("fieldset", "", "mode");
    modeLabel.append(node('legend', 'ルビの種類'));
    for (const [value, text] of [["group", "グループ"], ["mono", "単一"]]) {
      const label = node('label', '', 'mode-option');
      const radio = node('input'); radio.type = 'radio'; radio.name = `rubyMode-${index}`; radio.value = value;
      radio.checked = target.draft.mode === value;
      radio.addEventListener('change', () => { if (radio.checked) changeMode(value); });
      label.append(radio, node('span', text)); modeLabel.append(label);
    }
    card.append(modeLabel);
    const fields = node("div", "", "fields");
    const hint = node("p", "", "hint");
    const original = node("p", target.originalReading ? `元のルビ：${target.originalReading}` : "", "original");
    original.hidden = !target.originalReading;
    const display = node("p", "", "preview");
    display.setAttribute("aria-label", "適用後の表示例");
    const code = node("code", "", "notation");
    function field(labelText, value, change) {
      const label = node("label", "", "reading");
      const input = node("input"); input.type = "text"; input.value = value;
      input.autocomplete = "off"; input.spellcheck = false;
      input.addEventListener("input", () => { change(input.value); updateHint(); preview(target, display, code); });
      input.addEventListener("compositionstart", () => { composing.add(input); updateApply(); });
      input.addEventListener("compositionend", () => { composing.delete(input); lastCompositionEnd = Date.now(); change(input.value); updateHint(); preview(target, display, code); });
      label.append(node("span", labelText), input);
      return label;
    }
    function renderFields() {
      fields.replaceChildren();
      if (target.draft.mode === "group") {
        fields.append(field("範囲全体のルビ", target.draft.groupReading, value => { target.draft.groupReading = value; }));
      } else {
        fields.append(field(`${target.chars.join(' / ')} の順に入力`, formatMonoReadings(target.draft.readings), value => {
          target.draft.readings = parseMonoReadings(value);
        }));
      }
      updateHint();
      preview(target, display, code);
    }
    function updateHint() {
      if (target.draft.mode === 'group') hint.textContent = '読み方のほか、当て字や別の言葉も入力できます。';
      else if (target.draft.readings.length !== target.chars.length) hint.textContent = `親文字${target.chars.length}字に対して入力が${target.draft.readings.length}個あります。/ で区切って対応を合わせてください。`;
      else hint.textContent = '読みを / で区切ります。空欄はルビなし。/ 自体は \\/、\\ 自体は \\\\ と入力します。';
    }
    function changeMode(value) {
      const draft = target.draft;
      if (value === "group") {
        if (draft.readings.length === target.chars.length && draft.readings.some(value => value.length)) draft.groupReading = draft.readings.join("");
      } else if (draft.readings.join("") !== draft.groupReading) {
        draft.readings = target.chars.map(() => "");
        if (target.chars.length === 1) draft.readings[0] = draft.groupReading;
      }
      draft.mode = value;
      composing.clear(); renderFields();
      fields.querySelector('input')?.focus();
      fields.querySelector('input')?.select();
    }
    card.append(original, fields, hint, display, code);
    renderFields();
    return card;
  }
  window.addEventListener("message", event => {
    const message = event.data;
    if (message.type === "ruby.init") {
      targets = message.targets;
      document.getElementById("defaultMode").textContent = `新規挿入の既定：${message.defaultMode === "mono" ? "単一" : "グループ"}`;
      list.replaceChildren(...targets.map(renderTarget));
      stale = false; pending = false; composing.clear();
      notice.textContent = ""; notice.hidden = true; updateApply();
      list.querySelector('input[type="text"]')?.focus();
      list.querySelector('input[type="text"]')?.select();
    } else if (message.type === "ruby.error" || message.type === "ruby.stale") {
      pending = false;
      if (message.type === "ruby.stale") stale = true;
      notice.textContent = message.message; notice.hidden = false; updateApply();
    }
  });
  function submit() {
    if (apply.disabled) return;
    pending = true; updateApply();
    api.postMessage({ type: "ruby.apply", drafts: targets.map(target => target.draft) });
  }
  apply.addEventListener("click", submit);
  document.getElementById("cancel").addEventListener("click", () => api.postMessage({ type: "ruby.cancel" }));
  document.getElementById("settings").addEventListener("click", () => api.postMessage({ type: "ruby.settings" }));
  document.addEventListener("keydown", event => {
    if (event.isComposing || event.keyCode === 229 || composing.size || Date.now() - lastCompositionEnd < 200) return;
    if (event.key === "Escape" && !pending) api.postMessage({ type: "ruby.cancel" });
    if (event.key === 'Enter' && !event.repeat && (event.target?.matches('input[type="text"]') || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); submit();
    }
  });
  api.postMessage({ type: "ruby.ready" });
}

function getRubyEditorHtml(nonce) {
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>ルビを編集</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;padding:20px;color:var(--vscode-editor-foreground,#26382d);background:var(--vscode-editor-background,#fafdf8);font-family:var(--vscode-font-family,sans-serif);font-size:var(--vscode-font-size,14px)}main{max-width:800px;margin:auto;padding-bottom:88px}h1{font-size:1.3em;margin:0 0 8px}h2{font-size:1.05em;overflow-wrap:anywhere;margin:0 0 18px}.intro,.hint,.original,.defaults{color:var(--vscode-descriptionForeground,#626d65);font-size:.9em;line-height:1.6}.defaults{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.target{margin-top:20px;padding:18px;border:1px solid var(--vscode-panel-border,#c7d4c8);border-radius:8px}.mode{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}input,select,button{font:inherit}input,select{min-width:0;padding:8px;color:var(--vscode-input-foreground,#26382d);background:var(--vscode-input-background,#fff);border:1px solid var(--vscode-input-border,#a7bbaa);border-radius:4px}input{width:100%}input:focus,select:focus,button:focus-visible{outline:2px solid var(--vscode-focusBorder,#448867);outline-offset:2px}.fields.mono{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:12px}.reading{display:grid;gap:6px;min-width:0}.reading>span{font-size:.9em;font-weight:600}.original{overflow-wrap:anywhere;white-space:pre-wrap}.preview{line-height:2.6;font-size:1.15em;overflow-wrap:anywhere;white-space:pre-wrap;margin:18px 0 5px}.preview rt{font-size:.55em}.notation{display:block;overflow-wrap:anywhere;white-space:pre-wrap;font-size:.85em;color:var(--vscode-descriptionForeground,#626d65)}.notice{border-left:3px solid var(--vscode-inputValidation-warningBorder,#be883c);padding:10px;margin-top:14px;white-space:pre-wrap}footer{position:fixed;bottom:0;left:0;right:0;display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;background:var(--vscode-editor-background,#fafdf8);border-top:1px solid var(--vscode-panel-border,#c7d4c8)}button{cursor:pointer;padding:8px 14px;border:0;border-radius:4px;color:var(--vscode-button-foreground,#fff);background:var(--vscode-button-background,#386b50)}button.secondary{color:var(--vscode-button-secondaryForeground,#26382d);background:var(--vscode-button-secondaryBackground,#e1eadf)}button.link{padding:3px 0;color:var(--vscode-textLink-foreground,#386b50);background:transparent}button:disabled{opacity:.5;cursor:default}@media(max-width:420px){body{padding:14px}.target{padding:12px}.mode{align-items:stretch;flex-direction:column}.fields.mono{grid-template-columns:minmax(0,1fr)}}
.mode{border:0;padding:0;flex-direction:row;align-items:center}.mode legend{margin-bottom:8px;font-weight:600}.mode-option{display:inline-flex;align-items:center;gap:7px;cursor:pointer;min-height:34px}.mode-option input{width:auto;margin:0;accent-color:var(--vscode-button-background,#386b50)}.mode-option span{padding:6px 10px;border:1px solid var(--vscode-panel-border,#c7d4c8);border-radius:4px}.mode-option input:checked+span{border-color:var(--vscode-focusBorder,#448867);background:var(--vscode-list-activeSelectionBackground,#e1eadf);color:var(--vscode-list-activeSelectionForeground,#26382d)}.key-hint{align-self:center;margin-right:auto;color:var(--vscode-descriptionForeground,#626d65);font-size:.85em}@media(max-width:420px){footer{flex-wrap:wrap;padding:12px 14px}.key-hint{flex-basis:100%}}
</style></head><body><main><h1>ルビを編集</h1>
<p class="intro">適用するまでは原稿を変更しません。ルビの一部を選択した場合は、その組全体を表示します。</p>
<div class="defaults"><span id="defaultMode"></span><button type="button" class="link" id="settings">既定の設定を開く</button></div>
<p id="notice" class="notice" role="alert" hidden></p><div id="targets"></div></main>
<footer><span class="key-hint">Enterで適用・Escで取消</span><button type="button" id="apply" disabled>原稿に適用</button><button type="button" id="cancel" class="secondary">キャンセル</button></footer>
<script nonce="${nonce}">const parseMonoReadings=${parseMonoReadings.toString()};const formatMonoReadings=${formatMonoReadings.toString()};(${initializeRubyEditor.toString()})();</script></body></html>`;
}

module.exports = { getRubyEditorHtml, initializeRubyEditor };
