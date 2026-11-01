import { referenceWorkKey } from "./shared-note-reader.mjs";

const ids = value => [...new Set((Array.isArray(value) ? value : []).map(id => String(id || "").trim()).filter(Boolean))];
const identity = data => String(data?.workId || "").trim();
function check(context) {
  if (!context.isCurrent()) throw new Error("接続先または作品が変わったため、関連設定の処理を中止しました。");
}
async function readRecord(context, work, batch = null) {
  check(context);
  let item = work.settingsFile;
  if (!item?.id && work.mojigoto?.id) {
    const children = await context.provider.listChildren(work.mojigoto.id); check(context);
    item = children.find(row => row.file && row.name === "work.json") || children.find(row => row.file && row.name === "singleWork.json");
  }
  if (!item?.id) throw new Error("作品設定がありません。作品設定を一度保存してください。Google Driveでは追加許可も確認してください。");
  const metadata = batch?.has(item) ? batch.get(item) : await context.provider.getItemMetadata(item); check(context);
  if (metadata instanceof Error) throw metadata;
  if (metadata.id !== item.id || !metadata.file || !["work.json", "singleWork.json"].includes(metadata.name)) throw new Error("作品設定の場所を確認できません。一覧を再読み込みしてください。");
  const actualParent = metadata.parentReference?.id || metadata.parents?.[0];
  const expectedParent = context.cloudKind === "dropbox"
    ? (work.mojigoto?.path_lower || work.mojigoto?.path_display?.toLowerCase()) : work.mojigoto?.id;
  const expectedDrive = item.parentReference?.driveId || work.mojigoto?.parentReference?.driveId || work.folder?.parentReference?.driveId;
  if ((actualParent && expectedParent && String(actualParent) !== String(expectedParent))
    || (expectedDrive && metadata.parentReference?.driveId !== expectedDrive)) throw new Error("作品設定の保存先が変わっています。一覧を再読み込みしてください。");
  const cacheKey = JSON.stringify([metadata.parentReference?.driveId || "", metadata.id]);
  const cached = context.recordCache?.get(cacheKey);
  const raw = metadata.eTag && cached?.eTag === metadata.eTag ? cached.raw : await context.provider.readText(metadata); check(context);
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("作品設定の形式を確認できません。");
  context.recordCache?.set(cacheKey, { eTag: metadata.eTag, raw });
  return { key: referenceWorkKey(work), work, item: metadata, raw, data };
}

export async function readRelatedWorkCatalog(context, { fresh = false } = {}) {
  check(context);
  const finishCandidates = context.measure?.("関連設定・作品候補取得");
  const candidates = await context.getWorks(fresh); check(context);
  finishCandidates?.({ works: candidates.length });
  const works = [...new Map([...candidates, context.work].map(work => [referenceWorkKey(work), work])).values()];
  const finishSettings = context.measure?.("関連設定・設定確認");
  let batch = null;
  if (typeof context.provider.getItemMetadataBatch === "function") {
    try { batch = await context.provider.getItemMetadataBatch(works.map(work => work.settingsFile).filter(item => item?.id)); } catch { /* Verify individually. */ }
    check(context);
  }
  const records = await Promise.all(works.map(async work => {
    try { return await readRecord(context, work, batch); }
    catch (error) { check(context); return { key: referenceWorkKey(work), work, error }; }
  }));
  check(context);
  finishSettings?.({ works: works.length });
  return describeCatalog(context, records);
}

function describeCatalog(context, records) {
  const own = records.find(record => record.key === referenceWorkKey(context.work));
  if (!own || own.error) throw own?.error || new Error("現在作品の設定を確認できません。");
  const counts = new Map();
  for (const record of records) if (!record.error && identity(record.data)) counts.set(identity(record.data), (counts.get(identity(record.data)) || 0) + 1);
  const ownProblem = identity(own.data) && counts.get(identity(own.data)) > 1 ? "現在作品の作品IDが重複しています。関連設定を変更できません。" : "";
  const peers = records.filter(record => record !== own).map(record => {
    const peerId = identity(record.data), ownId = identity(own.data);
    const outgoing = Boolean(peerId && ids(own.data.relatedWorkIds).includes(peerId));
    const incoming = Boolean(ownId && ids(record.data?.relatedWorkIds).includes(ownId));
    const problem = ownProblem || record.error?.message || (peerId && counts.get(peerId) > 1 ? "作品IDが重複しています。" : "");
    return { ...record, problem, outgoing, incoming };
  });
  const available = new Set(peers.filter(peer => !peer.problem && identity(peer.data)).map(peer => identity(peer.data)));
  const unresolvedIds = ids(own.data.relatedWorkIds).filter(id => !available.has(id));
  return { own, peers, ownProblem, unresolved: unresolvedIds.length, unresolvedIds };
}

function updatedCatalog(context, catalog, own, peer) {
  return describeCatalog(context, [own, ...catalog.peers.map(row => peer && row.key === peer.key ? peer : row)]);
}

// A pair is updated explicitly. Cloud writes cannot be atomic across the two files.
export async function saveWorkRelation(context, peerKey, related, { makeId = () => `work-${globalThis.crypto.randomUUID()}`, now = () => new Date().toISOString() } = {}) {
  let own = null, peer = null, catalog = null;
  const writes = [];
  async function write(record, data, kind) {
    check(context);
    if (!record.item.eTag) throw new Error("保存前の版情報がありません。一覧を再読み込みしてください。");
    const next = { ...data, updatedAt: now() }, raw = `${JSON.stringify(next, null, 2)}\n`;
    const saved = await context.provider.writeText(record.item, raw, record.item.eTag);
    const updated = { ...record, item: { ...record.item, ...saved }, data: next, raw };
    context.recordCache?.set(JSON.stringify([updated.item.parentReference?.driveId || "", updated.item.id]), { eTag: updated.item.eTag, raw });
    writes.push({ key: record.key, title: String(record.data.title || record.work.title || record.work.name), kind });
    return updated;
  }
  try {
    // Re-discover the root before writes; a stale picker must not hide duplicate IDs.
    catalog = await readRelatedWorkCatalog(context, { fresh: true }); own = catalog.own;
    peer = catalog.peers.find(row => row.key === peerKey);
    if (!peer) throw new Error("相手作品を確認できません。追加許可・移動・削除状態を確認してください。");
    if (catalog.ownProblem || peer.problem) throw new Error(catalog.ownProblem || peer.problem);
    if (peer.key === own.key) throw new Error("同じ作品は関連付けできません。");
    // Persist missing identities before either file references them. Retries never leave generated dangling IDs.
    if (related) {
      const used = new Set([own, ...catalog.peers].filter(row => !row.error).map(row => identity(row.data)).filter(Boolean));
      const allocate = () => { const id = String(makeId() || "").trim(); if (!id || used.has(id)) throw new Error("新しい作品IDを作成できませんでした。再試行してください。"); used.add(id); return id; };
      if (!identity(own.data)) own = await write(own, { ...own.data, workId: allocate() }, "identity");
      if (!identity(peer.data)) peer = await write(peer, { ...peer.data, workId: allocate() }, "identity");
    }
    const ownId = identity(own.data), peerId = identity(peer.data);
    for (const side of ["own", "peer"]) {
      const record = side === "own" ? own : peer, targetId = side === "own" ? peerId : ownId;
      if (!targetId) continue;
      const previous = ids(record.data.relatedWorkIds);
      const next = related ? ids([...previous, targetId]) : previous.filter(id => id !== targetId);
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      const saved = await write(record, { ...record.data, relatedWorkIds: next }, "relation");
      if (side === "own") own = saved; else peer = saved;
    }
    check(context);
    return { complete: true, own, peer, writes, catalog: updatedCatalog(context, catalog, own, peer) };
  } catch (error) {
    return { complete: false, own, peer, writes, error, catalog: catalog && own ? updatedCatalog(context, catalog, own, peer) : null };
  }
}

// Explicitly forget one unresolved link on the current work only. Unreadable is not proof of deletion.
export async function removeUnresolvedWorkRelation(context, targetId, { now = () => new Date().toISOString() } = {}) {
  let own = null, catalog = null; const writes = [];
  try {
    catalog = await readRelatedWorkCatalog(context, { fresh: true }); own = catalog.own;
    if (catalog.ownProblem) throw new Error(catalog.ownProblem);
    if (!catalog.unresolvedIds.includes(targetId)) throw new Error("この関連は現在参照可能か、すでに解除済みです。一覧を再読み込みしてください。");
    if (!own.item.eTag) throw new Error("保存前の版情報がありません。一覧を再読み込みしてください。");
    const data = { ...own.data, relatedWorkIds: ids(own.data.relatedWorkIds).filter(id => id !== targetId), updatedAt: now() };
    const raw = JSON.stringify(data, null, 2) + "\n";
    check(context);
    const saved = await context.provider.writeText(own.item, raw, own.item.eTag);
    own = { ...own, item: { ...own.item, ...saved }, data, raw };
    context.recordCache?.set(JSON.stringify([own.item.parentReference?.driveId || "", own.item.id]), { eTag: own.item.eTag, raw });
    writes.push({ key: own.key, kind: "unresolved" });
    check(context);
    return { complete: true, own, writes, catalog: updatedCatalog(context, catalog, own) };
  } catch (error) {
    return { complete: false, own, writes, error, catalog: catalog && own ? updatedCatalog(context, catalog, own) : null };
  }
}
