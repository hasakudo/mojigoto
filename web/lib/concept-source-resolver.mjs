import { readVerifiedFile } from "./verified-file-read.mjs";
import { conceptSourceFileName } from "./concept-memos.mjs";
import { normalizeNote } from "./notes.mjs";
import { locateConceptSource } from "./concept-source.mjs";

function rememberVerifiedEntry(entries, key, value) {
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > 8) entries.delete(entries.keys().next().value);
}

export function createConceptSourceResolver({ state, ensureNoteFolder, beginPerformanceMeasurement = () => () => {} }) {
  // Concurrent reads share work; completed bodies require fresh metadata verification.
  const providers = new WeakMap();
  async function findConceptSourceEntry(memo = state.currentConceptMemo) {
    const source = { ...memo?.source };
    if (source.kind !== "noteItem") throw new Error("この構想メモにはノート項目の出典がありません。");
    if (!source.itemId) throw new Error("連携先のノート項目が見つかりません。");
    const provider = state.provider, work = state.selectedWork, root = state.workRoot;
    if (!provider || !work) throw new Error("作品の接続先を確認できません。");
    const type = source.noteType === "reference" ? "reference" : "plot";
    const current = () => {
      if (provider !== state.provider || work !== state.selectedWork || root !== state.workRoot) {
        throw new Error("作品または接続先が切り替わったため、連携先の読み込みを停止しました。");
      }
    };
    let works = providers.get(provider);
    if (!works) { works = new WeakMap(); providers.set(provider, works); }
    let context = works.get(work);
    if (!context) { context = { pending: new Map(), verified: new Map() }; works.set(work, context); }
    const { pending, verified } = context;
    const key = JSON.stringify([type, source.itemId, source.groupId, conceptSourceFileName(source), root?.id]);
    let job = pending.get(key);
    if (!job) {
      const stats = { reads: 0, listedFiles: 0, fallback: false, sharedWaiters: 0, metadataChecks: 0, bodyCacheHit: false };
      const promise = (async () => {
        const finish = beginPerformanceMeasurement("構想メモ同期・出典ノート取得", { noteType: type });
        try {
          let checkedEntry = null;
          const cached = verified.get(key);
          if (cached && cached.root === root && provider.supportsVersionedContentCache) {
            stats.metadataChecks++;
            const entry = await readVerifiedFile(provider, cached.entry, cached.folderId, conceptSourceFileName(source)); current();
            if (entry) {
              stats.bodyCacheHit = entry.cacheHit;
              if (!entry.cacheHit) stats.reads++;
              entry.data = normalizeNote(JSON.parse(entry.raw), type);
              const result = locateConceptSource([entry], source);
              if (result) {
                rememberVerifiedEntry(verified, key, { root, folderId: cached.folderId, entry: { item: structuredClone(entry.item), raw: entry.raw } });
                finish({ ...stats }); return result;
              }
              checkedEntry = entry;
            }
            verified.delete(key);
          }
          const folder = await ensureNoteFolder(type, { create: false }); current();
          if (!folder) throw new Error("連携先のノートフォルダを確認できません。");
          const files = (await provider.listChildren(folder.id)).filter((item) => item?.file && /\.json$/i.test(item.name)); current();
          stats.listedFiles = files.length;
          const read = async (item) => {
            if (checkedEntry?.item.id === item.id && checkedEntry.item.eTag === item.eTag) return structuredClone(checkedEntry);
            stats.reads++;
            const raw = await provider.readText(item); current();
            return { item, raw, data: normalizeNote(JSON.parse(raw), type) };
          };
          const name = conceptSourceFileName(source);
          const named = name ? files.filter((item) => item.name === name) : [];
          const exact = named.length === 1 ? named[0] : null;
          let entry;
          if (exact) {
            entry = await read(exact);
            const result = locateConceptSource([entry], source);
            if (result) {
              if (provider.supportsVersionedContentCache && entry.item.eTag) rememberVerifiedEntry(verified, key, { root, folderId: folder.id, entry: { item: structuredClone(entry.item), raw: entry.raw } });
              finish({ ...stats }); return result;
            }
          }
          // Preserve ID-based recovery after a rename or item move between notes.
          stats.fallback = true;
          const rest = files.filter((item) => item !== exact);
          const settled = await Promise.allSettled(rest.map(read)); current();
          const entries = [...(entry ? [entry] : []), ...settled.filter((result) => result.status === "fulfilled").map((result) => result.value)];
          const result = locateConceptSource(entries, source);
          if (!result) throw new Error(settled.some((result) => result.status === "rejected")
            ? "連携先ノートの読み込みに失敗しました。再度保存してください。"
            : "連携先のノート項目が見つかりません。");
          finish({ ...stats }); return result;
        } catch (error) {
          finish({ ...stats, failed: true }); throw error;
        }
      })();
      job = { promise, stats }; pending.set(key, job);
    } else job.stats.sharedWaiters++;
    try {
      const result = await job.promise; current();
      // A preview and a writer must not mutate each other's entry/analysis objects.
      return structuredClone(result);
    } finally {
      if (pending.get(key) === job) pending.delete(key);
    }
  }
  function cacheConceptSourceEntry(memo, entry) {
    if (!state.provider?.supportsVersionedContentCache || !entry?.item?.eTag) return;
    const source = memo?.source;
    if (source?.kind !== "noteItem") return;
    const context = providers.get(state.provider)?.get(state.selectedWork);
    const key = JSON.stringify([source.noteType === "reference" ? "reference" : "plot", source.itemId, source.groupId, conceptSourceFileName(source), state.workRoot?.id]);
    const cached = context?.verified.get(key);
    if (!cached || cached.root !== state.workRoot || cached.entry.item.id !== entry.item.id
        || entry.item.name !== conceptSourceFileName(source)) return;
    rememberVerifiedEntry(context.verified, key, { ...cached, entry: { item: structuredClone(entry.item), raw: entry.raw } });
  }
  return { findConceptSourceEntry, cacheConceptSourceEntry };
}
