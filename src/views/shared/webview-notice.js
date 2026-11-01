// Embedded in WebView HTML; messages are always rendered as text.
function createWebviewNotice(root, { visibleClass = "isVisible", duration = 1800 } = {}) {
  if (!root) return { show() {}, clear() {} };
  const text = root.ownerDocument.createElement("span");
  text.className = "webviewNoticeText";
  const close = root.ownerDocument.createElement("button");
  close.className = "webviewNoticeClose button secondary";
  close.type = "button";
  close.textContent = "閉じる";
  close.hidden = true;
  root.classList.add("webviewNotice");
  root.replaceChildren(text, close);
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  let warning = false;
  let timer = null;
  function clear({ force = false } = {}) {
    if (warning && !force) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    warning = false;
    text.textContent = "";
    close.hidden = true;
    root.classList.remove(visibleClass, "isError");
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
  }
  function show(message, options = {}) {
    const isWarning = Boolean(options.isError || options.isWarning);
    if (warning && !isWarning) return;
    if (!message) { clear(); return; }
    if (timer !== null) clearTimeout(timer);
    timer = null;
    warning = isWarning;
    text.textContent = String(message);
    close.hidden = !warning;
    root.classList.toggle("isError", warning);
    root.classList.add(visibleClass);
    root.setAttribute("role", warning ? "alert" : "status");
    root.setAttribute("aria-live", warning ? "assertive" : "polite");
    if (!warning && !options.persist) timer = setTimeout(() => clear(), options.duration || duration);
  }
  close.addEventListener("click", () => clear({ force: true }));
  return { show, clear };
}

function getWebviewNoticeScript() { return createWebviewNotice.toString(); }
function getWebviewNoticeCss() {
  return `
    .webviewNotice.isError {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      pointer-events: auto;
      user-select: text;
      padding: 10px 12px;
      border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-panel-border));
      border-left-width: 3px;
      border-radius: 8px;
      background: var(--vscode-notifications-background, var(--vscode-editorWidget-background));
      color: var(--vscode-notifications-foreground, var(--vscode-editorWidget-foreground));
    }
    .webviewNoticeText { min-width: 0; overflow-wrap: anywhere; }
    .webviewNoticeClose { flex: 0 0 auto; white-space: nowrap; }
    .webviewNoticeClose[hidden] { display: none; }
  `;
}
module.exports = { createWebviewNotice, getWebviewNoticeScript, getWebviewNoticeCss };
