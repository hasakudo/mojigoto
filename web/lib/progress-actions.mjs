// PNG export, clipboard and Web Share actions; the app supplies browser capabilities.
export function createProgressActions({
  state, elements, document, navigator, URL, Blob, File, atob, ClipboardItem, globalThis, setTimeout, createProgressShareText,
}) {
  function sanitizeProgressFileName(value) {
    return String(value || "作品")
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 48)
      .trim() || "作品";
  }

  function progressShareBlob() {
    return new Promise((resolve, reject) => elements.progressShareCanvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("PNG画像を作成できませんでした。")),
      "image/png",
    ));
  }

  function progressShareBlobSync() {
    const encoded = elements.progressShareCanvas.toDataURL("image/png").split(",")[1] || "";
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "image/png" });
  }

  async function saveProgressImage() {
    try {
      const blob = await progressShareBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = String(state.progressSummary?.period?.date || "").replaceAll("-", "") || "progress";
      link.href = url;
      const titleVisible = elements.progressShareOptions.querySelector('input[value="title"]')?.checked !== false;
      const fileTitle = titleVisible ? state.progressSummary?.work?.title : "作品";
      link.download = `もじごと進捗_${date}_${sanitizeProgressFileName(fileTitle)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      elements.progressShareStatus.textContent = "PNG画像を保存しました。";
    } catch (error) {
      elements.progressShareStatus.textContent = error.message || "PNG画像を保存できませんでした。";
    }
  }

  async function copyProgressImage() {
    try {
      if (!globalThis.ClipboardItem || !navigator.clipboard?.write) {
        throw new Error("このブラウザは画像コピーに対応していません。PNG保存をご利用ください。");
      }
      const blob = await progressShareBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      elements.progressShareStatus.textContent = "画像をクリップボードへコピーしました。";
    } catch (error) {
      elements.progressShareStatus.textContent = error.message || "画像をコピーできませんでした。";
    }
  }

  async function copyProgressText() {
    try {
      const options = Object.fromEntries([...elements.progressShareOptions.querySelectorAll('input[type="checkbox"]')]
        .map((input) => [input.value, input.checked]));
      await navigator.clipboard.writeText(createProgressShareText(state.progressSummary, options, elements.progressShareMode.value));
      elements.progressShareStatus.textContent = "SNS投稿文をクリップボードへコピーしました。";
    } catch (error) {
      elements.progressShareStatus.textContent = error.message || "SNS投稿文をコピーできませんでした。";
    }
  }

  async function shareProgress() {
    try {
      if (typeof navigator.share !== "function") {
        throw new Error("このブラウザは共有機能に対応していません。");
      }
      const options = Object.fromEntries([...elements.progressShareOptions.querySelectorAll('input[type="checkbox"]')]
        .map((input) => [input.value, input.checked]));
      const text = createProgressShareText(state.progressSummary, options, elements.progressShareMode.value);
      const date = String(state.progressSummary?.period?.date || "").replaceAll("-", "") || "progress";
      const fileTitle = options.title ? state.progressSummary?.work?.title : "作品";
      const fileName = `もじごと進捗_${date}_${sanitizeProgressFileName(fileTitle)}.png`;
      const shareData = { title: "もじごと進捗", text };
      const blob = progressShareBlobSync();
      if (typeof File === "function") {
        const file = new File([blob], fileName, { type: "image/png" });
        if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
      }
      await navigator.share(shareData);
      elements.progressShareStatus.textContent = shareData.files
        ? "進捗画像と投稿文を共有しました。"
        : "投稿文を共有しました。画像は保存またはコピーして追加してください。";
    } catch (error) {
      if (error?.name === "AbortError") {
        elements.progressShareStatus.textContent = "共有をキャンセルしました。";
      } else {
        elements.progressShareStatus.textContent = error.message || "共有できませんでした。";
      }
    }
  }
  return { sanitizeProgressFileName, progressShareBlob, progressShareBlobSync, saveProgressImage, copyProgressImage, copyProgressText, shareProgress };
}
