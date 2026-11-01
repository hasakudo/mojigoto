import { normalizeNote, NOTE_TYPES } from "./notes.mjs";

export function referenceWorkKey(work) {
  return JSON.stringify([String(work?.folder?.parentReference?.driveId || work?.mojigoto?.parentReference?.driveId || ""), String(work?.id || work?.folder?.id || "")]);
}

function check(context) {
  if (!context.isCurrent()) throw new Error("参照画面が切り替わったため、読み込みを中止しました。");
}

async function readIdentity(context, work, metadata = null) {
  check(context);
  let item = work.settingsFile;
  if (!item && work.mojigoto?.id) {
    const children = await context.provider.listChildren(work.mojigoto.id);
    check(context);
    item = children.find(item => item?.file && item.name === "work.json")
      || children.find(item => item?.file && item.name === "singleWork.json");
  }
  if (!item) return { workId: "", relatedWorkIds: [] };
  // Refresh persisted settings instead of reusing a version-specific download URL from an old catalog.
  if (metadata?.has(item)) {
    const result = metadata.get(item);
    if (result instanceof Error) throw result;
    item = result;
  } else if (typeof context.provider.getItemMetadata === "function") {
    item = await context.provider.getItemMetadata(item);
    check(context);
  }
  const raw = JSON.parse(await context.provider.readText(item));
  check(context);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("作品設定の形式を確認できませんでした。");
  return {
    title: String(raw.title || "").trim(),
    workId: String(raw.workId || "").trim(),
    relatedWorkIds: [...new Set((Array.isArray(raw.relatedWorkIds) ? raw.relatedWorkIds : []).map(id => String(id || "").trim()).filter(Boolean))],
  };
}

export async function readReferenceSources(context) {
  const own = { key: referenceWorkKey(context.work), work: context.work, relation: "current" };
  const finishOwn = context.measure?.("関連作品・現在作品設定");
  const current = await readIdentity(context, context.work);
  finishOwn?.();
  if (!current.workId) return { sources: [own], notice: "作品IDが未登録です。作品設定の「関連作品を設定」から登録してください。" };
  if (!current.relatedWorkIds.length) return { sources: [own], notice: "関連作品は作品設定の「関連作品を設定」から登録できます。" };
  const finishCatalog = context.measure?.("関連作品・作品候補取得");
  const candidates = context.getWorks ? await context.getWorks() : context.works;
  finishCatalog?.({ works: candidates.length, ...context.referenceCatalogDetails });
  check(context);
  context.works = [...candidates];
  const works = [...new Map([context.work, ...context.works].map(work => [referenceWorkKey(work), work])).values()];
  const finishSettings = context.measure?.("関連作品・候補設定確認");
  let metadata = null;
  if (typeof context.provider.getItemMetadataBatch === "function") {
    const files = works.filter(work => referenceWorkKey(work) !== own.key).map(work => work.settingsFile).filter(item => item?.id);
    try { metadata = await context.provider.getItemMetadataBatch(files); } catch { /* Retry through individual verification. */ }
    check(context);
  }
  const settled = await Promise.allSettled(works.map(async work => ({ work, identity: referenceWorkKey(work) === own.key ? current : await readIdentity(context, work, metadata) })));
  check(context);
  finishSettings?.({ works: works.length });
  const records = settled.filter(row => row.status === "fulfilled").map(row => row.value);
  const matches = id => records.filter(row => row.identity.workId === id);
  if (matches(current.workId).length !== 1) return { sources: [own], notice: "作品IDが重複しているため、関連作品を参照できません。VS Codeの作品設定を確認してください。" };
  const sources = [own]; let unavailable = 0, duplicate = 0, oneWay = 0;
  for (const id of current.relatedWorkIds.filter(id => id !== current.workId)) {
    const found = matches(id);
    if (found.length !== 1) { if (found.length > 1) duplicate++; else unavailable++; continue; }
    const row = found[0];
    const mutual = row.identity.relatedWorkIds.includes(current.workId);
    if (!mutual) oneWay++;
    sources.push({ key: referenceWorkKey(row.work), work: row.identity.title ? { ...row.work, title: row.identity.title } : row.work, workId: id, relation: mutual ? "mutual" : "outgoing" });
  }
  const notices = [];
  if (unavailable) notices.push(`${unavailable}件の関連作品を確認できません。追加許可・同期・削除状態を確認してください。`);
  if (duplicate) notices.push(`${duplicate}件は作品IDが重複しているため参照できません。`);
  if (oneWay) notices.push(`${oneWay}件の関連付けは片側だけに保存されています。`);
  if (settled.some(row => row.status === "rejected")) notices.push("一部作品の設定を読み込めませんでした。パネルを開き直すと再確認します。");
  return { sources, notice: notices.join(" ") };
}

export async function readReferenceNotes(context, source, type) {
  check(context);
  const ownKey = referenceWorkKey(context.work);
  if (source.key !== ownKey) {
    if (!context.works.some(work => referenceWorkKey(work) === source.key)) throw new Error("関連作品を確認できません。パネルを開き直してください。");
    const [own, peer] = await Promise.all([readIdentity(context, context.work), readIdentity(context, source.work)]);
    check(context);
    if (!own.workId || peer.workId !== source.workId || !own.relatedWorkIds.includes(peer.workId)) throw new Error("関連作品の設定が変わりました。パネルを開き直してください。");
  }
  if (!source.work.mojigoto?.id) throw new Error("参照元作品の管理フォルダを確認できません。");
  const noteType = type === "reference" ? "reference" : "plot";
  const children = await context.provider.listChildren(source.work.mojigoto.id);
  check(context);
  const folder = children.find(item => item?.folder && item.name === NOTE_TYPES[noteType].folder);
  if (!folder) {
    if (context.cloudKind === "googleDrive" || context.provider.requiresExplicitFileAccess) throw new Error("ノートの保存先を確認できません。Google Driveの設定ページで参照元作品のフォルダと中身を追加許可してください。");
    return [];
  }
  const files = (await context.provider.listChildren(folder.id)).filter(item => item?.file && /\.json$/i.test(item.name));
  check(context);
  const entries = await Promise.all(files.map(async item => {
    const raw = await context.provider.readText(item);
    check(context);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ノートの形式を確認できませんでした。");
    return { item, raw, data: normalizeNote(parsed, noteType), referenceKey: JSON.stringify([source.key, noteType, String(item.id || item.name)]) };
  }));
  check(context);
  return entries.sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0) || String(a.data.title).localeCompare(String(b.data.title), "ja", { numeric: true }));
}
