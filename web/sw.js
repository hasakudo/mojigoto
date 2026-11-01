const CACHE_NAME = "mojigoto-shell-v330";
const APP_SHELL = [
  "./lib/admin-cognito-identity.mjs?v=1.0.0",
  "./lib/imported-address-book.mjs",
  "./",
  "./index.html",
  "./boot.js?v=1.0.282",
  "./guide.html",
  "./guide.css?v=1.0.261",
  "./guide.mjs?v=1.0.261",
  "./theme-init.js?v=1.0.65",
  "./theme-palettes.css?v=1.0.0",
  "./styles.css?v=1.0.211",
  "./app.mjs?v=1.0.282",
  "./legal.css?v=1.0.2",
  "./about/",
  "./terms/",
  "./privacy/",
  "./apply/",
  "./contact/",
  "./forms.css?v=1.0.2",
  "./forms.mjs?v=1.0.3",
  "./google-drive-setup.html",
  "./lib/setup-header.mjs?v=1.0.156",
  "./lib/setup-help.mjs?v=1.0.0",
  "./google-drive-setup.css?v=1.0.277",
  "./google-drive-setup.mjs",
  "./google-drive-setup.mjs?v=1.0.277",
  "./lib/google-drive-import.mjs",
  "./lib/project-folder-drop.mjs",
  "./lib/google-drive-import.mjs?v=1.0.148",
  "./auth/google-drive.mjs?v=1.0.1",
  "./auth/dropbox.mjs",
  "./auth/pkce.mjs",
  "./storage/google-drive-provider.mjs",
  "./storage/google-drive-provider.mjs?v=1.0.4",
  "./storage/google-drive-picker.mjs",
  "./storage/google-drive-picker.mjs?v=1.0.161",
  "./storage/google-drive-picker.mjs?v=1.0.162",
  "./storage/onedrive-provider.mjs",
  "./storage/onedrive-provider.mjs?v=1.0.281",
  "./storage/onedrive-provider.mjs?v=1.0.1",
  "./storage/dropbox-provider.mjs",
  "./storage/dropbox-provider.mjs?v=1.0.1",
  "./lib/work-discovery.mjs",
  "./lib/catalog-delta.mjs",
  "./lib/file-names.mjs",
  "./lib/create-dialog-form.mjs",
  "./lib/manuscript-rename.mjs",
  "./lib/editor-sync.mjs",
  "./lib/manuscript-save.mjs",
  "./lib/concept-save.mjs",
  "./lib/concept-memo-sync.mjs",
  "./lib/memo-auto-reflect.mjs",
  "./lib/memo-auto-reflect-settings.mjs",
  "./lib/note-auto-link.mjs",
  "./lib/note-save.mjs",
  "./lib/manuscript-load.mjs",
  "./lib/editor-external-update.mjs",
  "./lib/editor-save-scheduler.mjs",
  "./lib/editor-delete.mjs",
  "./lib/writing-records.mjs?v=1.0.1",
  "./lib/progress-data.mjs?v=1.0.1",
  "./lib/progress-loading.mjs",
  "./lib/progress-rendering.mjs",
  "./lib/progress-actions.mjs",
  "./lib/progress-summary.mjs?v=1.0.1",
  "./lib/input-assist.mjs",
  "./lib/manuscript-preview.mjs",
  "./lib/manuscript-catalog.mjs",
  "./lib/manuscript-catalog-controller.mjs",
  "./lib/whole-manuscript-body.mjs",
  "./lib/whole-manuscript-reader.mjs",
  "./lib/preview-manuscript-navigation.mjs",
  "./lib/whole-manuscript-position.mjs",
  "./lib/backup-format.mjs",
  "./lib/backup-storage.mjs",
  "./lib/backup-creation.mjs",
  "./lib/backup-comparison-controller.mjs",
  "./lib/backup-restore.mjs",
  "./lib/text-diff.mjs",
  "./lib/backup-comparison.mjs",
  "./lib/text-count.mjs",
  "./lib/notes.mjs",
  "./lib/note-index.mjs",
  "./lib/note-inline.mjs",
  "./lib/note-markdown-core.js",
  "./lib/note-markdown.mjs",
  "./lib/template-import.mjs",
  "./lib/note-template-sync.mjs",
  "./lib/note-template-presentation.mjs",
  "./lib/generated-note-markdown.js",
  "./lib/generated-note-markdown.mjs",
  "./lib/concept-memos.mjs",
  "./lib/concept-note-order.js",
  "./lib/concept-source.mjs",
  "./lib/concept-source-resolver.mjs",
  "./lib/automatic-backup-window.mjs",
  "./lib/verified-file-read.mjs",
  "./lib/note-concept-link.mjs",
  "./lib/concept-sync.mjs",
  "./lib/work-settings.mjs",
  "./lib/work-settings-persistence.mjs",
  "./lib/note-preview-work-controller.mjs",
  "./lib/note-search-replace.js",
  "./lib/note-search-controller.mjs",
  "./lib/manuscript-search-controller.mjs",
  "./lib/concept-search-controller.mjs",
  "./lib/concept-batch-save.mjs",
  "./lib/note-replace-session.js",
  "./lib/related-work-settings.mjs",
  "./lib/related-work-settings-controller.mjs",
  "./lib/reference-work-catalog.mjs",
  "./lib/shared-note-reader.mjs",
  "./lib/reader-note-reference-controller.mjs",
  "./lib/cloud-connection.mjs",
  "./lib/runtime-config.mjs",
  "./lib/user-auth.mjs",
  "./lib/environment-context.mjs",
  "./lib/app-recovery.mjs",
  "./lib/recent-views.mjs",
  "./lib/recent-view-history.mjs",
  "./lib/view-navigation.mjs",
  "./lib/recent-manuscripts.mjs",
  "./lib/popup-position.mjs",
  "./lib/editor-popup-layout.mjs",
  "./manifest.webmanifest",
  "./announcements.json",
  "./icon.svg",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./logo.png",
  "./README.md",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(APP_SHELL.map(async (path) => {
        const request = new Request(path, { cache: "reload" });
        const essential = path === "./" || path === "./index.html" || /\.(?:js|mjs|css)(?:\?|$)/.test(path);
        if (essential) await cache.add(request);
        else await cache.add(request).catch(() => {});
      }));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("mojigoto-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin || /\/api\//.test(url.pathname)
    || url.pathname.endsWith("/config.json")) return;
  const shell = event.request.mode === "navigate" || /\.(?:html|js|mjs|css|svg|png|ico|webmanifest)$/.test(url.pathname);
  if (!shell) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(event.request, { cache: "no-store", signal: controller.signal });
      if (response.ok) return response;
      const fallback = await caches.match(event.request);
      return fallback || response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const fallback = await caches.match(new URL("index.html", self.registration.scope).href);
        if (fallback) return fallback;
      }
      return new Response("読み込めませんでした。接続を確認して再読み込みしてください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } finally { clearTimeout(timeout); }
  })());
});
