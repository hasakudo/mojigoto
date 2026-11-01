const fontScale = Number(localStorage.getItem("mojigoto.web.fontScale"));
document.getElementById("closeGuidePage").addEventListener("click", () => {
  window.close();
  const status = document.getElementById("guideCloseStatus");
  status.hidden = false;
  status.textContent = "ブラウザが閉じる操作を許可しない場合は、このタブを閉じて元の画面へ戻ってください。";
  status.scrollIntoView({ block: "start" });
});
if ([0.9, 1, 1.1, 1.2].includes(fontScale)) {
  document.documentElement.style.setProperty("--ui-font-scale", String(fontScale));
}
// Measure the wrapping header so anchor targets remain visible at larger text sizes.
const guideHeader = document.querySelector(".topbar");
function updateGuideHeaderHeight() {
  document.documentElement.style.setProperty("--guide-header-height", `${Math.ceil(guideHeader.getBoundingClientRect().height)}px`);
}
updateGuideHeaderHeight();
window.addEventListener("resize", updateGuideHeaderHeight, { passive: true });
if (typeof ResizeObserver === "function") new ResizeObserver(updateGuideHeaderHeight).observe(guideHeader);

function showGuideSection(hash = location.hash) {
  const section = document.getElementById(hash.slice(1));
  if (!section) return;
  for (let parent = section; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true;
  requestAnimationFrame(() => section.scrollIntoView({ block: "start" }));
}
document.querySelectorAll(".guide-page-toc a, .guide-footer a[href^='#guide-']").forEach((link) => {
  link.addEventListener("click", () => showGuideSection(link.hash));
});
window.addEventListener("hashchange", () => showGuideSection());
showGuideSection();
