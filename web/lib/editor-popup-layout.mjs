import { editorPopupPosition } from "./popup-position.mjs";

// Owns menu geometry and its viewport listeners; editing and save state stay in the app.
export function createEditorPopupLayout({ window, document, elements }) {
  function positionReaderCountModePopup() {
    if (!elements.readerCountModeDetails.open) return;
    const popup = elements.readerCountMode.closest(".count-mode-control");
    if (!popup) return;
    if (elements.readerCountModeDetails.closest(".editor-options-panel")) {
      popup.style.removeProperty("width");
      popup.style.removeProperty("left");
      return;
    }
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const edge = 12;
    const popupWidth = Math.min(360, Math.max(0, viewportWidth - edge * 2));
    const anchorRect = elements.readerCountModeDetails.getBoundingClientRect();
    const desiredLeft = Math.min(
      Math.max(anchorRect.left, viewportLeft + edge),
      viewportLeft + viewportWidth - popupWidth - edge,
    );
    popup.style.width = `${popupWidth}px`;
    popup.style.left = `${desiredLeft - anchorRect.left}px`;
  }
  function positionManuscriptPreviewControls() {
    if (!elements.readerPreviewLauncher.open) return;
    const popup = elements.readerPreviewLauncher.querySelector(".manuscript-preview-controls");
    if (!popup) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const edge = 12;
    const popupWidth = Math.min(280, Math.max(0, viewportWidth - edge * 2));
    const anchorRect = elements.readerPreviewLauncher.getBoundingClientRect();
    const desiredLeft = Math.min(
      Math.max(anchorRect.right - popupWidth, viewportLeft + edge),
      viewportLeft + viewportWidth - popupWidth - edge,
    );
    popup.style.width = `${popupWidth}px`;
    popup.style.right = "auto";
    popup.style.left = `${desiredLeft - anchorRect.left}px`;
  }
  elements.readerPreviewLauncher.addEventListener("toggle", () => {
    if (elements.readerPreviewLauncher.open) window.requestAnimationFrame(positionManuscriptPreviewControls);
  });
  window.addEventListener("resize", positionManuscriptPreviewControls, { passive: true });
  window.visualViewport?.addEventListener("resize", positionManuscriptPreviewControls, { passive: true });
  elements.readerCountModeDetails.addEventListener("toggle", () => {
    if (elements.readerCountModeDetails.open) window.requestAnimationFrame(positionReaderCountModePopup);
  });
  window.addEventListener("resize", positionReaderCountModePopup, { passive: true });
  window.visualViewport?.addEventListener("resize", positionReaderCountModePopup, { passive: true });
  function positionEditorOptionsPanels() {
    const viewport = window.visualViewport;
    const bounds = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
      width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight };
    const safe = window.getComputedStyle(document.documentElement);
    const padding = Object.fromEntries(["left", "right", "top", "bottom"].map((side) =>
      [side, parseFloat(safe.getPropertyValue(`--safe-area-${side}`)) || 0]));
    for (const options of document.querySelectorAll(".editor-options.open")) {
      const panel = options.querySelector(".editor-options-panel");
      const toggle = options.querySelector(".editor-options-toggle");
      if (!panel || !toggle || window.getComputedStyle(panel).display === "contents") continue;
      const desiredWidth = options.closest("#readerSection") ? 280 : 220;
      const position = editorPopupPosition(toggle.getBoundingClientRect(), bounds, desiredWidth, panel.scrollHeight, padding);
      // The fixed toolbar is transformed, so a fixed child would use its
      // coordinate system. Position relative to the gear's wrapper instead.
      const origin = options.getBoundingClientRect();
      Object.assign(panel.style, { position: "absolute", right: "auto", bottom: "auto", left: `${position.left - origin.left}px`,
        top: `${position.top - origin.top}px`, width: `${position.width}px`, maxHeight: `${position.maxHeight}px`, overflowY: "auto" });
    }
  }
  window.addEventListener("resize", positionEditorOptionsPanels, { passive: true });
  window.addEventListener("scroll", positionEditorOptionsPanels, { passive: true });
  window.visualViewport?.addEventListener("resize", positionEditorOptionsPanels, { passive: true });
  window.visualViewport?.addEventListener("scroll", positionEditorOptionsPanels, { passive: true });

  return { positionReaderCountModePopup, positionManuscriptPreviewControls, positionEditorOptionsPanels };
}
