// Cache Storage contains the app shell only; user data and credentials are
// deliberately left in their existing storage.
export async function clearAppCache(cacheStorage, serviceWorker, appUrl) {
  if (!cacheStorage) throw new Error("この環境ではアプリのキャッシュを削除できません。通常の再読み込みをお試しください。");
  const keys = await cacheStorage.keys();
  await Promise.all(keys.filter((key) => key.startsWith("mojigoto-shell-")).map((key) => cacheStorage.delete(key)));
  // Reinstall the app shell after navigation so offline support is restored.
  if (serviceWorker?.getRegistrations) {
    const scriptUrl = new URL("./sw.js", appUrl).href;
    const registrations = await serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const workers = [registration.active, registration.waiting, registration.installing];
      if (workers.some((worker) => worker?.scriptURL === scriptUrl)) await registration.unregister();
    }
  }
}
