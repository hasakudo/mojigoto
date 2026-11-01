const PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let pickerLibraryPromise = null;

export function loadGooglePicker(documentRef = globalThis.document) {
  if (globalThis.google?.picker?.PickerBuilder) return Promise.resolve(globalThis.google.picker);
  if (!documentRef) return Promise.reject(new Error("Google Pickerを読み込めませんでした。"));
  if (pickerLibraryPromise) return pickerLibraryPromise;
  pickerLibraryPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Googleのファイル選択画面の読み込みがタイムアウトしました。通信状態やブラウザのブロック設定を確認して、もう一度選択してください。")), 15000);
    const succeed = (value) => { clearTimeout(timeout); resolve(value); };
    const fail = (error) => { clearTimeout(timeout); reject(error); };
    const existing = documentRef.querySelector?.(`script[src="${PICKER_SCRIPT_URL}"]`);
    const script = existing || documentRef.createElement("script");
    const finish = () => {
      if (!globalThis.gapi?.load) {
        fail(new Error("Google Pickerライブラリを読み込めませんでした。"));
        return;
      }
      globalThis.gapi.load("picker", {
        callback: () => globalThis.google?.picker?.PickerBuilder
          ? succeed(globalThis.google.picker)
          : fail(new Error("Google Pickerを初期化できませんでした。")),
        onerror: () => fail(new Error("Google Pickerを初期化できませんでした。")),
      });
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => fail(new Error("Google Pickerへ接続できませんでした。")), { once: true });
    if (globalThis.gapi?.load) {
      finish();
    } else if (!existing) {
      script.src = PICKER_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      documentRef.head.append(script);
    }
  }).catch((error) => { pickerLibraryPromise = null; throw error; });
  return pickerLibraryPromise;
}

export class GoogleDrivePicker {
  constructor({
    apiKey,
    appId,
    pickerApi = null,
    origin = globalThis.location?.origin || "",
    documentRef = globalThis.document,
    viewport = globalThis,
  } = {}) {
    this.apiKey = String(apiKey || "").trim();
    this.appId = String(appId || "").trim();
    this.pickerApi = pickerApi;
    this.origin = String(origin || "").trim();
    this.documentRef = documentRef;
    this.viewport = viewport;
  }

  get configured() {
    return Boolean(this.apiKey && this.appId);
  }

  getViewportMetrics() {
    const visualViewport = this.viewport?.visualViewport;
    return {
      width: Number(visualViewport?.width || this.viewport?.innerWidth || 566),
      height: Number(visualViewport?.height || this.viewport?.innerHeight || 674),
      offsetLeft: Number(visualViewport?.offsetLeft || 0),
      offsetTop: Number(visualViewport?.offsetTop || 0),
    };
  }

  fitToViewport() {
    const dialogs = Array.from(this.documentRef?.querySelectorAll?.(".picker-dialog") || []);
    const dialog = dialogs.at(-1) || this.documentRef?.querySelector?.(".picker-dialog");
    if (!dialog) return;
    const viewport = this.getViewportMetrics();
    const viewportWidth = viewport.width;
    const width = Math.max(304, Math.min(566, viewportWidth - 16));
    const viewportHeight = viewport.height;
    const contentHeight = Math.max(350, Math.min(650, viewportHeight - 24));
    const titleHeight = Number(dialog.querySelector?.(".picker-dialog-title")?.offsetHeight || 24);
    const height = contentHeight + titleHeight;
    const availableHeight = Math.max(320, viewportHeight - 16);
    const scale = Math.min(1, availableHeight / height);
    Object.assign(dialog.style, {
      position: "fixed",
      left: `${viewport.offsetLeft + (viewportWidth / 2)}px`,
      top: `${viewport.offsetTop + (viewportHeight / 2)}px`,
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
      transform: `translate(-50%, -50%) scale(${scale})`,
      transformOrigin: "center center",
    });
    const contents = Array.from(dialog.querySelectorAll?.(".picker-dialog-content, .picker-frame") || []);
    for (const content of contents) {
      if (content?.style) Object.assign(content.style, { width: `${width}px`, height: `${contentHeight}px` });
    }
    const frame = dialog.querySelector?.("iframe");
    if (frame?.style) Object.assign(frame.style, { display: "block", width: `${width}px`, height: `${contentHeight}px` });
  }

  async pickFolder(accessToken) {
    const items = await this.pickItems(accessToken, { foldersOnly: true });
    return items?.[0] || null;
  }

  async pickItems(accessToken, { foldersOnly = false, parentId = "root" } = {}) {
    if (!this.configured) throw new Error("Google PickerのAPIキーまたはプロジェクト番号が設定されていません。");
    const token = String(accessToken || "").trim();
    if (!token) throw new Error("Google Driveへもう一度接続してください。");
    const picker = this.pickerApi || await loadGooglePicker();
    return new Promise((resolve, reject) => {
      let pickerInstance, active = true, cleanup = () => {};
      try {
        const fitPicker = () => { if (active) this.fitToViewport(); };
        const visualViewport = this.viewport?.visualViewport;
        const stopWatchingViewport = () => {
          if (!active) return;
          active = false;
          this.viewport?.removeEventListener?.("resize", fitPicker);
          this.viewport?.removeEventListener?.("orientationchange", fitPicker);
          visualViewport?.removeEventListener?.("resize", fitPicker);
          visualViewport?.removeEventListener?.("scroll", fitPicker);
          pickerInstance?.dispose?.();
        };
        cleanup = stopWatchingViewport;
        const viewport = this.getViewportMetrics();
        const view = new picker.DocsView(foldersOnly ? picker.ViewId.FOLDERS : picker.ViewId.DOCS)
          .setParent(parentId)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);
        if (foldersOnly) view.setMimeTypes(FOLDER_MIME);
        const builder = new picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(this.apiKey)
          .setAppId(this.appId)
          .setLocale("ja")
          .setTitle(foldersOnly ? "もじごとの作品フォルダを選択" : "このフォルダのファイル・子フォルダをすべて選択")
          .setSize(
            Math.max(304, Math.min(566, viewport.width - 16)),
            Math.max(350, Math.min(650, viewport.height - 24)),
          )
          .setCallback((data) => {
            if (data?.action === picker.Action.CANCEL) {
              stopWatchingViewport();
              resolve(null);
              return;
            }
            if (data?.action !== picker.Action.PICKED) return;
            stopWatchingViewport();
            const items = data.docs || [];
            if (!items.length || items.some((item) => !item?.id)) {
              reject(new Error("選択したGoogle Driveフォルダを確認できませんでした。"));
              return;
            }
            resolve(items.map((item) => ({ id: item.id, name: item.name || "作品ファイル", mimeType: item.mimeType || (foldersOnly ? FOLDER_MIME : "") })));
          });
        if (!foldersOnly) builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
        if (this.origin) builder.setOrigin(this.origin);
        pickerInstance = builder.build();
        pickerInstance.setVisible(true);
        if (!active) return;
        this.viewport?.addEventListener?.("resize", fitPicker);
        this.viewport?.addEventListener?.("orientationchange", fitPicker);
        visualViewport?.addEventListener?.("resize", fitPicker);
        visualViewport?.addEventListener?.("scroll", fitPicker);
        this.viewport?.requestAnimationFrame?.(fitPicker);
        this.viewport?.setTimeout?.(fitPicker, 100);
        this.viewport?.setTimeout?.(fitPicker, 300);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
}
