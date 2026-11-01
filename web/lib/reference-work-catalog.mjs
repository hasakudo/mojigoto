// Resolve candidates even when HOME history restored an editor before the catalog.
// Keep this read-only catalog separate from navigation and the editor's selected work.
export function createReferenceWorkCatalog({ state, scopeKey, discoverWorks, readCachedWorks = () => null }) {
  let pending = null;
  async function resolve(context) {
    const provider = state.provider, root = state.workRoot, scope = scopeKey(), token = state.worksLoadToken;
    const current = () => context.isCurrent() && provider === state.provider && scope === scopeKey()
      && token === state.worksLoadToken;
    if (!current() || context.provider !== provider) throw new Error("参照画面が切り替わったため、読み込みを中止しました。");
    const active = state.referenceWorkDiscovery;
    let works;
    if (active?.provider === provider && active.scope === scope && active.token === token) {
      context.referenceCatalogDetails = { source: "active-discovery" };
      works = await active.promise;
    } else if (!state.recentWorkCatalogPending && state.works.length) {
      context.referenceCatalogDetails = { source: "loaded-catalog" };
      works = [...state.works];
    } else {
      if (!root?.id) throw new Error("作品フォルダを確認できません。接続先を確認してください。");
      if (!pending || pending.provider !== provider || pending.scope !== scope || pending.token !== token) {
        const details = { source: "discovery" };
        const request = { provider, scope, token, details,
          promise: discoverWorks(provider, root, { cachedWorks: readCachedWorks(root) || [],
            reportReferenceDiscovery: counts => Object.assign(details, counts) }) };

        pending = request;
        request.promise.catch(() => { if (pending === request) pending = null; });
      }
      const request = pending, source = request.resolved ? "memory" : "discovery";
      works = await request.promise;
      request.resolved = true;
      context.referenceCatalogDetails = { ...request.details, source };
    }
    if (!current()) throw new Error("参照画面が切り替わったため、読み込みを中止しました。");
    if (!Array.isArray(works)) throw new Error("作品一覧を確認できません。プレビューを開き直すと再確認します。");
    return works;
  }
  return { resolve };
}
