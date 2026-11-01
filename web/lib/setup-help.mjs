// A side panel on wide screens; a native modal with focus containment on smaller screens.
export function initSetupHelp({ documentRef = document, windowRef = window } = {}) {
  const el = (id) => documentRef.getElementById(id);
  const dialog = el("setupHelpDialog");
  const content = el("setupHelpContent");
  const launcher = el("setupHelpButton");
  const notice = el("setupActionNotice");
  const noticeHome = notice.parentNode;
  const wide = windowRef.matchMedia("(min-width: 1280px)");
  let previousFocus = null;
  const close = () => { if (dialog.open) dialog.close(); };
  const open = (id = "") => {
    const topic = id ? el(id) : null;
    if (id && (!topic || !dialog.contains(topic))) return false;
    if (!dialog.open) {
      previousFocus = documentRef.activeElement;
      dialog.insertBefore(notice, content);
      if (wide.matches) dialog.show(); else dialog.showModal();
    }
    launcher.setAttribute("aria-expanded", "true");
    el("setupHelpClose").focus({ preventScroll: true });
    if (topic) {
      if (topic.tagName === "DETAILS") topic.open = true;
      content.scrollTop += topic.getBoundingClientRect().top - content.getBoundingClientRect().top - 8;
    }
    return true;
  };
  el("setupHelpClose").addEventListener("click", close);
  dialog.addEventListener("close", () => {
    // A media change can close and immediately reopen the same dialog.
    if (dialog.open) return;
    noticeHome.append(notice);
    launcher.setAttribute("aria-expanded", "false");
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  });
  documentRef.querySelectorAll("[data-setup-help]").forEach((button) => {
    button.addEventListener("click", () => open(button.dataset.setupHelp));
  });
  const topics = [...dialog.querySelectorAll("[data-setup-help-topic]")];
  el("setupHelpContents").replaceChildren(...topics.map((topic) => {
    const link = documentRef.createElement("a");
    link.href = `#${topic.id}`;
    link.textContent = topic.querySelector("summary, h2").textContent.trim();
    link.addEventListener("click", (event) => { event.preventDefault(); open(topic.id); });
    return link;
  }));
  wide.addEventListener("change", () => {
    if (!dialog.open) return;
    const scrollTop = content.scrollTop;
    const focused = documentRef.activeElement;
    const before = previousFocus;
    close();
    open();
    previousFocus = before;
    content.scrollTop = scrollTop;
    if (dialog.contains(focused)) focused.focus({ preventScroll: true });
  });
  const openHash = () => {
    let id;
    try { id = decodeURIComponent(windowRef.location.hash.slice(1)); } catch { return; }
    if (id) open(id);
  };
  windowRef.addEventListener("hashchange", openHash);
  openHash();
  return { open, close, contains: (section) => dialog.contains(section) };
}
