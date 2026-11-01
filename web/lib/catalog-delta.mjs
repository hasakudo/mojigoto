// A checkpoint belongs to one completed catalog, never to global application state.
const RETRY_DELAY = 5 * 60 * 1000;
const UNSUPPORTED_DELAY = 24 * 60 * 60 * 1000;

export function catalogDeltaScope(root) {
  const drive = String(root?.parentReference?.driveId || "");
  return drive && root?.id ? JSON.stringify([drive, String(root.id)]) : "";
}

export async function discoverWorkCatalog(provider, root, {
  cachedWorks = [], deltaState, isCurrent = () => true, measure, now = Date.now,
} = {}, discover) {
  const scope = catalogDeltaScope(root);
  if (!scope || typeof provider.readCatalogDelta !== "function") {
    return { works: await discover(), deltaState: null };
  }
  const saved = deltaState?.scope === scope ? deltaState : null;
  if (Number(saved?.retryAfter) > now()) {
    measure?.("作品検出・差分確認")?.({ result: "cooldown", pages: 0 });
    return { works: await discover(), deltaState: saved };
  }
  let checkpoint = "", retryState = null;
  const read = async (link = "", phase = "check") => {
    const finish = measure?.("作品検出・差分確認", { phase });
    try {
      const result = await provider.readCatalogDelta(root, link);
      finish?.({ phase, result: result.changed ? "changed" : link ? "unchanged" : "checkpoint", pages: result.pages });
      return result;
    } catch (error) {
      const unsupported = [400, 403, 404, 405, 501].includes(error?.status);
      retryState = { scope, retryAfter: now() + (unsupported ? UNSUPPORTED_DELAY : RETRY_DELAY) };
      finish?.({ phase, result: error?.status === 410 ? "expired" : unsupported ? "unsupported" : "fallback", pages: 0 });
      return null;
    }
  };
  if (cachedWorks.length && saved?.link) {
    const checked = await read(saved.link);
    if (checked && !checked.changed && isCurrent()) {
      // Clone: later editor/metrics mutations must not alter the baseline input.
      return { works: structuredClone(cachedWorks), deltaState: { scope, link: checked.link } };
    }
    checkpoint = checked?.link || "";
  } else {
    const started = await read("", "baseline-start");
    checkpoint = started?.link || "";
  }
  if (!isCurrent()) return { works: null, deltaState: null };
  let complete = true;
  const works = await discover(() => { complete = false; });
  if (!isCurrent() || !complete || !checkpoint || !works?.length) {
    return { works, deltaState: retryState };
  }
  const verified = await read(checkpoint, "baseline-verify");
  return { works, deltaState: verified && !verified.changed && isCurrent()
    ? { scope, link: verified.link } : retryState };
}
