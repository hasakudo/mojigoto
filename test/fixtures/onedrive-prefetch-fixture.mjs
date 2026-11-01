import { OneDriveProvider } from "../../web/storage/onedrive-provider.mjs";
import { createWorkCatalogSnapshot, discoverWorks } from "../../web/lib/work-discovery.mjs";

export function oneDrivePrefetchFixture(count = 3) {
  const driveId = "test-drive";
  const folder = (id, name, parent) => ({ id, name, folder: {}, eTag: "properties-" + id, parentReference: { id: parent, driveId } });
  const file = (id, name, parent) => ({ id, name, file: {}, eTag: "v1", parentReference: { id: parent, driveId } });
  const root = folder("root", "作品ルート", "drive-root");
  const works = Array.from({ length: count }, (_, i) => folder("work-" + i, "作品" + i, root.id));
  const data = new Map([[root.id, works]]), titles = new Map(), batches = [], paths = [], reads = [], measures = [];
  const batchFailOnce = new Map(), singleFailures = new Map(), wrongOnce = new Map(), paged = new Set();
  for (const work of works) {
    const metadata = folder("meta-" + work.id, ".mojigoto", work.id);
    data.set(work.id, [metadata, folder("manuscript-" + work.id, "原稿", work.id)]);
    data.set(metadata.id, [file("settings-" + work.id, "work.json", metadata.id)]);
  }
  const provider = new OneDriveProvider({}, async () => { throw new Error("Real network forbidden"); });
  let delayMs = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const listId = url => decodeURIComponent(url.match(/\/items\/([^/]+)\/children/)[1]);
  provider.request = async (url, options) => {
    if (url === "/$batch") {
      const requests = JSON.parse(options.body).requests; batches.push(requests);
      if (delayMs) await sleep(delayMs);
      const responses = requests.map(request => {
        const id = listId(request.url), status = batchFailOnce.get(id) || (data.has(id) ? 200 : 404);
        batchFailOnce.delete(id);
        if (status !== 200) return { id: request.id, status, body: { error: { code: "synthetic-" + status } } };
        let value = structuredClone(data.get(id));
        if (wrongOnce.has(id)) { value.forEach(item => { item.parentReference[wrongOnce.get(id)] = "other-location"; }); wrongOnce.delete(id); }
        const body = paged.has(id) ? { value: [], "@odata.nextLink": "/next/" + id } : { value };
        return { id: request.id, status, body };
      }).reverse();
      return { json: async () => ({ responses }) };
    }
    paths.push(url);
    if (delayMs) await sleep(Math.max(1, delayMs / 4));
    if (url.startsWith("/next/")) return { json: async () => ({ value: structuredClone(data.get(url.slice(6))) }) };
    const id = listId(url), status = singleFailures.get(id) || (data.has(id) ? 200 : 404);
    if (status !== 200) { const error = new Error("synthetic folder error " + status); error.status = status; throw error; }
    return { json: async () => ({ value: structuredClone(data.get(id)) }) };
  };
  provider.readText = async item => { reads.push(item.id); return JSON.stringify({ title: titles.get(item.id) || "表示名-" + item.id }); };
  const settingsCache = new Map();
  const options = { settingsCache, measure: label => details => measures.push({ label, ...details }) };
  const load = (cachedWorks, discover = discoverWorks) => discover(provider, root, { ...options, cachedWorks });
  const reset = () => { batches.length = 0; paths.length = 0; reads.length = 0; measures.length = 0; };
  const seed = async () => { const cache = createWorkCatalogSnapshot(await load([])); reset(); return cache; };
  return { provider, root, works, data, titles, batches, paths, reads, measures, batchFailOnce, singleFailures, wrongOnce, paged,
    folder, file, load, reset, seed, setDelay(ms) { delayMs = ms; } };
}
