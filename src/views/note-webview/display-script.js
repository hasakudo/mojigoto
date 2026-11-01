const { getNoteDisplayRendererScript } = require("./display-renderer");

function getDisplayScript(mode) {
  return `  const vscode = acquireVsCodeApi();
  const savedDisplayState = vscode.getState?.() || {};
  let displayIdentity = null;
  let restoreDisplayUi = true;
  let persistDisplayTimer = null;
  ${getNoteDisplayRendererScript()}
  const root = document.getElementById("displayContent");
  const imageModal = document.getElementById("displayImageModal");
  const imageLarge = document.getElementById("displayImageLarge");
  root.addEventListener("click", event => {
    const thumbnail = event.target.closest(".noteDisplayThumbnail");
    if (!thumbnail) return;
    const image = thumbnail.querySelector("img");
    if (!image) return;
    imageLarge.src = image.src;
    imageLarge.alt = image.alt;
    document.getElementById("displayImageCaption").textContent = image.alt;
    if (!imageModal.open) imageModal.showModal();
  });
  document.getElementById("closeDisplayImage").addEventListener("click", () => imageModal.close());
  imageModal.addEventListener("click", event => {
    const rect = imageModal.getBoundingClientRect();
    if (event.target === imageModal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) imageModal.close();
  });
  imageModal.addEventListener("close", () => { imageLarge.removeAttribute("src"); imageLarge.alt = ""; });
  let sequence = 0;
  let previousHtml = "";
  let previousToc = "";
  const toc = document.getElementById("displayToc");
  const tocToggle = document.getElementById("displayTocToggle");
  const openMemos = document.getElementById("openDisplayMemos");
  const closeMemos = document.getElementById("closeDisplayMemos");
  const navigationStatus = document.getElementById("displayNavigationStatus");
  toc.hidden = savedDisplayState.ui?.tocOpen !== true;
  tocToggle.setAttribute("aria-expanded", String(!toc.hidden));
  function persistDisplayState() {
    if (persistDisplayTimer) clearTimeout(persistDisplayTimer);
    persistDisplayTimer = null;
    if (!displayIdentity) return;
    vscode.setState?.({...displayIdentity, ui:{tocOpen:!toc.hidden, tocTop:toc.scrollTop,
      left:root.scrollLeft, top:root.scrollTop,
      details:[...root.querySelectorAll("details[data-display-key]")].map(el => [el.dataset.displayKey, el.open]),
      tocDetails:[...toc.querySelectorAll("details[data-display-key]")].map(el => [el.dataset.displayKey, el.open]),
      columns:[...root.querySelectorAll("[data-display-scroll]")].map(el => [el.dataset.displayScroll, el.scrollTop])}});
  }
  function scheduleDisplayState() {
    if (!persistDisplayTimer) persistDisplayTimer = setTimeout(persistDisplayState, 150);
  }
  function updateMemoControls() {
    const memos = [...root.querySelectorAll("details.noteDisplayMemo")];
    openMemos.disabled = !memos.some(memo => !memo.open);
    closeMemos.disabled = !memos.some(memo => memo.open);
  }
  function setAllMemosOpen(open) {
    root.querySelectorAll("details.noteDisplayMemo").forEach(memo => { memo.open = open; });
    updateMemoControls();
    persistDisplayState();
  }
  openMemos.addEventListener("click", () => setAllMemosOpen(true));
  closeMemos.addEventListener("click", () => setAllMemosOpen(false));
  root.addEventListener("scroll", scheduleDisplayState, true);
  root.addEventListener("toggle", () => { updateMemoControls(); scheduleDisplayState(); }, true);
  toc.addEventListener("scroll", scheduleDisplayState);
  toc.addEventListener("toggle", scheduleDisplayState, true);
  tocToggle.addEventListener("click", () => {
    toc.hidden = !toc.hidden;
    tocToggle.setAttribute("aria-expanded", String(!toc.hidden));
    persistDisplayState();
  });
  toc.addEventListener("click", event => {
    const button = event.target.closest("button[data-display-group]");
    if (!button) return;
    event.preventDefault();
    navigationStatus.textContent = "編集位置を開いています…";
    navigationStatus.hidden = false;
    vscode.postMessage({type:"noteDisplay.navigate", groupId:button.dataset.displayGroup, itemId:button.dataset.displayItem || ""});
  });
  let dismissedWarning = "";
  const dismissWarning = document.getElementById("dismissDisplayWarning");
  dismissWarning.addEventListener("click", () => {
    dismissedWarning = document.getElementById("displayWarning").textContent;
    document.getElementById("displayWarning").hidden = true;
    dismissWarning.hidden = true;
  });
  window.addEventListener("message", ({data}) => {
    if (data?.type === "noteDisplay.identity") {
      displayIdentity = data.identity;
      // Keep saved UI until the first content render has restored it.
      if (!restoreDisplayUi) persistDisplayState();
      else vscode.setState?.({...displayIdentity, ui:savedDisplayState.ui});
      return;
    }
    if (data?.type === "noteDisplay.navigationResult") {
      navigationStatus.textContent = data.message || "編集位置を開きました。";
      navigationStatus.hidden = false;
      return;
    }
    if (data?.type !== "noteDisplay.snapshot" || !Number.isSafeInteger(data.sequence) || data.sequence <= sequence) return;
    sequence = data.sequence;
    const note = data.note || {};
    document.getElementById("displayWork").textContent = "作品: " + (note.workTitle || note.workName || "未設定");
    document.getElementById("displayTitle").textContent = (note.title || "無題ノート") + " / ${mode === "board" ? "ボード" : "プレビュー"}（表示専用）";
    document.getElementById("displayStatus").textContent = (data.closed ? "編集終了 ・ " : "編集中 ・ ") + (data.dirty ? "未保存の内容を表示" : "保存済みの内容を表示");
    const warning = document.getElementById("displayWarning");
    if (!data.warning) dismissedWarning = "";
    warning.textContent = data.warning || "";
    warning.hidden = !data.warning || data.warning === dismissedWarning;
    dismissWarning.hidden = warning.hidden;
    const tocHtml = noteDisplayRenderer.toc(note);
    if (previousToc !== tocHtml) {
      const top = toc.scrollTop;
      const opened = new Map([...toc.querySelectorAll("details")].map(el => [el.dataset.displayKey, el.open]));
      toc.innerHTML = tocHtml;
      toc.querySelectorAll("details").forEach(el => { if (opened.has(el.dataset.displayKey)) el.open = opened.get(el.dataset.displayKey); });
      toc.scrollTop = top;
      previousToc = tocHtml;
    }
    const html = noteDisplayRenderer.groups(note, ${mode === "board"});
    if (previousHtml === html) return;
    const scroll = [root.scrollLeft, root.scrollTop];
    const details = new Map([...root.querySelectorAll("details[data-display-key]")].map(el => [el.dataset.displayKey, el.open]));
    const columns = new Map([...root.querySelectorAll("[data-display-scroll]")].map(el => [el.dataset.displayScroll, el.scrollTop]));
    root.innerHTML = html;
    previousHtml = html;
    root.querySelectorAll("details[data-display-key]").forEach(el => { if (details.has(el.dataset.displayKey)) el.open = details.get(el.dataset.displayKey); });
    root.querySelectorAll("[data-display-scroll]").forEach(el => { el.scrollTop = columns.get(el.dataset.displayScroll) || 0; });
    root.scrollLeft = scroll[0]; root.scrollTop = scroll[1];
    if (restoreDisplayUi) {
      const ui = savedDisplayState.ui || {};
      const pairs = value => new Map(Array.isArray(value) ? value.filter(pair => Array.isArray(pair) && pair.length === 2) : []);
      const offset = value => Number.isFinite(value) ? Math.max(0, Math.min(value, 10000000)) : 0;
      const opened = pairs(ui.details), tocOpened = pairs(ui.tocDetails), columnTops = pairs(ui.columns);
      root.querySelectorAll("details[data-display-key]").forEach(el => { if (opened.has(el.dataset.displayKey)) el.open = opened.get(el.dataset.displayKey) === true; });
      toc.querySelectorAll("details[data-display-key]").forEach(el => { if (tocOpened.has(el.dataset.displayKey)) el.open = tocOpened.get(el.dataset.displayKey) === true; });
      root.querySelectorAll("[data-display-scroll]").forEach(el => { el.scrollTop = offset(columnTops.get(el.dataset.displayScroll)); });
      root.scrollLeft = offset(ui.left); root.scrollTop = offset(ui.top); toc.scrollTop = offset(ui.tocTop);
      restoreDisplayUi = false;
    }
    updateMemoControls();
    persistDisplayState();
  });
  vscode.postMessage({type:"noteDisplay.ready"});`;
}

module.exports = { getDisplayScript };
