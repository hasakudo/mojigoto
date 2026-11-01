import { normalizeNote, NOTE_TYPES } from "./notes.mjs";
import { writeTextWithBaseline } from "./editor-sync.mjs";
import { remapSelfLinks, findImportedTarget } from "./generated-note-markdown.mjs";

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
export async function textHash(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function sourceMatches(source, metadata) {
  return source?.workId === metadata.workId && source?.noteId === metadata.noteId && source?.type === metadata.type;
}
export function needsTemplateUpdate(source, metadata) {
  return source.sourceHash !== metadata.sourceHash || (source.formatVersion || 2) < metadata.version
    || (metadata.version >= 4 && source.attachmentsHash !== metadata.attachmentsHash);
}
export async function noteImportHash(note) {
  const { importSource, updatedAt, storageRevision, ...content } = normalizeNote(note, note.type);
  return textHash(JSON.stringify(stable(content)));
}
function comparable(note) {
  const { id, order, importSource, updatedAt, storageRevision, ...content } = normalizeNote(note, note.type);
  content.groups = content.groups.map(({ id, ...group }) => ({ ...group, items: group.items.map(({ id, body, ...item }) => ({
    ...item, ...(body === undefined ? {} : { body: body.replace(/\r\n?/g, "\n").trimEnd() }),
    relatedReferences: (item.relatedReferences || []).map((link) => link.importTarget ? { importTarget: link.importTarget } : link),
  })) }));
  return JSON.stringify(stable(content));
}
function validateSource(source, note) {
  if (source?.version !== 1 || !/^[a-f0-9]{64}$/.test(source.contentHash || "") || !/^[a-f0-9]{64}$/.test(source.sourceHash || "")) {
    throw new Error("読込先の対応情報を確認できません。自動で新しいコピーは作成していません。");
  }
  if (!Array.isArray(source.groups) || !Array.isArray(source.items)) throw new Error("読込先の項目対応情報が壊れています。上書きはしていません。");
  if ((!source.groups.length && source.items.length) || (source.groups.length && (source.groups.length !== note.groups.length
      || source.items.length !== note.groups.reduce((count, group) => count + group.items.length, 0)))) {
    throw new Error("読込先の項目対応情報が不足しています。上書きはしていません。");
  }
  for (const [mappings, targets] of [[source.groups, note.groups], [source.items, note.groups.flatMap((group) => group.items)]]) {
    const sources = new Set(), ids = new Set();
    const targetsById = new Map(targets.map((item) => [item.id, item]));
    for (const mapping of mappings) {
      const target = targetsById.get(mapping.targetId);
      if (typeof mapping.sourceId !== "string" || !mapping.sourceId || sources.has(mapping.sourceId) || ids.has(mapping.targetId) || !target
          || (mapping.kind && mapping.kind !== target.kind)) throw new Error("読込先の項目対応情報を確認できません。上書きはしていません。");
      sources.add(mapping.sourceId); ids.add(mapping.targetId);
    }
  }
}
export async function attachImportSource(note, metadata) {
  remapSelfLinks(note, metadata);
  const source = { version: 1, workId: metadata.workId, noteId: metadata.noteId, type: metadata.type,
    sourceFileName: metadata.sourceFileName, formatVersion: metadata.version,
    sourceHash: metadata.sourceHash, ...(metadata.version >= 4 ? { attachmentsHash: metadata.attachmentsHash } : {}), contentHash: await noteImportHash(note), groups: [], items: [] };
  if (metadata.version >= 2) {
    metadata.sourceIds.forEach((group, index) => {
      source.groups.push({ sourceId: group.id, targetId: note.groups[index].id });
      group.items.forEach((item, i) => source.items.push({ sourceId: item.id, targetId: note.groups[index].items[i].id, kind: item.kind }));
    });
  }
  return { ...note, importSource: source };
}

export async function inspectNoteTemplate(provider, work, imported) {
  if (!imported.generated) return null;
  const metadata = imported.generated;
  if (!work?.mojigoto?.id) throw new Error("作品の保存先が見つかりません。");
  const children = await provider.listChildren(work.mojigoto.id);
  const settingsFile = children.find((item) => item.file && item.name === "web-import-settings.json");
  let workId = "";
  if (settingsFile) workId = String(JSON.parse(await provider.readText(settingsFile)).workId || "");
  const folders = {};
  const jobs = [];
  for (const [type, info] of Object.entries(NOTE_TYPES)) {
    const folder = children.find((item) => item.folder && item.name === info.folder);
    if (!folder) continue;
    folders[type] = folder;
    for (const item of await provider.listChildren(folder.id)) {
      if (item.file && /\.json$/i.test(item.name)) jobs.push({ item, type, folder });
    }
  }
  const entries = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const raw = await provider.readText(job.item);
      entries.push({ ...job, raw, data: normalizeNote(JSON.parse(raw), job.type) });
    }
  }));
  const foreign = !!workId && workId !== metadata.workId;
  const originals = [], copies = [], adoptable = [];
  const basis = comparable(imported.note);
  for (const entry of entries) {
    if (!foreign && entry.data.id === metadata.noteId && entry.type === metadata.type
        && (workId === metadata.workId || entry.item.name === metadata.sourceFileName || await textHash(entry.raw) === metadata.sourceHash)) {
      originals.push(entry);
      continue;
    }
    if (sourceMatches(entry.data.importSource, metadata)) {
      try { validateSource(entry.data.importSource, entry.data); }
      catch (error) { entry.mappingError = error.message; }
      copies.push(entry);
    } else if (!entry.data.importSource && entry.type === imported.note.type && comparable(entry.data) === basis) {
      adoptable.push(entry);
    }
  }
  if (copies.length > 1) throw new Error("同じ生成元に対応するノートが複数あります。対応先を整理してから読み直してください。上書き・新規作成はしていません。");
  return { entries, folders, originals, copies, adoptable, foreign, workId };
}

export async function resolveImportedNoteLink(provider, work, link, currentNote = null) {
  const children = await provider.listChildren(work.mojigoto.id);
  const settings = children.find((item) => item.file && item.name === "web-import-settings.json");
  const localWorkId = settings ? String(JSON.parse(await provider.readText(settings)).workId || "") : "";
  const entries = [], jobs = [];
  for (const [type, info] of Object.entries(NOTE_TYPES)) {
    const folder = children.find((item) => item.folder && item.name === info.folder);
    if (folder) for (const item of await provider.listChildren(folder.id)) {
      if (item.file && /\.json$/i.test(item.name)) jobs.push({ type, item });
    }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const { item, type } = jobs[cursor++];
      if (currentNote?.item.id === item.id) entries.push(currentNote);
      else { const raw = await provider.readText(item); entries.push({ item, raw, data: normalizeNote(JSON.parse(raw), type) }); }
    }
  }));
  const result = findImportedTarget(entries, link.importTarget, localWorkId);
  if (!result) throw new Error("関連先を特定できません。リンク先のMarkdownもこの作品へ読み込んでください。原本を使う場合は、原本とWeb読込用の設定ファイル（.mojigoto/web-import-settings.json）を追加許可してください。同じ生成元の候補が複数ある場合は整理してください。");
  return { ...result, localWorkId };
}

export function templateDestinations(inspection, imported) {
  const options = [];
  for (const entry of inspection.originals) options.push({ value: `original:${entry.item.id}`, label: `原本を開く：${entry.data.title}`, mode: "original", entry });
  for (const entry of inspection.copies) options.push({ value: `copy:${entry.item.id}`,
    label: !needsTemplateUpdate(entry.data.importSource, imported.generated)
      ? `読込済みのノートを開く：${entry.data.title}` : `以前の読込先へ反映：${entry.data.title}`, mode: "copy", entry });
  if (!inspection.copies.length) for (const entry of inspection.adoptable) options.push({ value: `adopt:${entry.item.id}`, label: `同じ内容のノートを読込先に登録：${entry.data.title}`, mode: "adopt", entry });
  if (!inspection.copies.length) options.push({ value: "new", label: "新しいコピーを作成", mode: "new" });
  if (inspection.entries.length) {
    options.push({ value: "replace", label: "既存ノートに上書き", mode: "replace-select" });
    for (const entry of inspection.entries) options.push({ value: `replace:${entry.item.id}`,
      label: `${NOTE_TYPES[entry.type].label}：${entry.data.title}`, mode: "replace", entry });
  }
  if (!inspection.originals.length && !inspection.copies.length && inspection.adoptable.length > 1) {
    options.unshift({ value: "", label: "読込先を選択してください", mode: "choose" });
  }
  return options;
}

function assertCurrent(isCurrent) {
  if (!isCurrent()) throw new Error("作品・保存状態が変わりました。内容を保持してから読み直してください。");
}
function assertInboundLinks(entries, previous, next, workId, previousFileName) {
  const locations = new Map(next.groups.flatMap((group) => group.items.map((item) => [item.id, group.id])));
  for (const entry of entries) for (const group of entry.data.groups) for (const item of group.items) {
    for (const link of item.relatedReferences || []) {
      const resolved = link.importTarget && !link.importTarget.self
        ? findImportedTarget([{ data: previous, item: { name: previousFileName } }], link.importTarget, workId)?.link : link;
      if (!resolved || resolved.noteId !== previous.id) continue;
      if (!locations.has(resolved.itemId) || (!link.importTarget && resolved.groupId && locations.get(resolved.itemId) !== resolved.groupId)) {
        throw new Error("関連リンクの参照先を削除・移動する変更が含まれます。リンクを確認してから反映してください。既存ノートは変更していません。");
      }
    }
  }
}
export async function prepareTemplateDestination(provider, work, imported, selected, isCurrent) {
  assertCurrent(isCurrent);
  const inspection = await inspectNoteTemplate(provider, work, imported);
  assertCurrent(isCurrent);
  const destination = templateDestinations(inspection, imported).find((option) => option.value === selected);
  if (["choose", "replace-select"].includes(destination?.mode)) throw new Error("読込先を選択してください。");
  if (!destination) throw new Error("読込先が変わりました。同じファイルを選び直して、既存の読込先を確認してください。");
  return { ...destination, inspection };
}
export async function applyTemplateDestination(provider, imported, destination, isCurrent, { backup, reviewedRaw } = {}) {
  const { entry, mode, inspection } = destination;
  assertCurrent(isCurrent);
  const raw = await provider.readText(entry.item);
  assertCurrent(isCurrent);
  const current = normalizeNote(JSON.parse(raw), entry.type);
  if (current.id !== entry.data.id) throw new Error("読込先のノートが置き換わりました。読み直してください。");
  if (mode === "original") return { item: entry.item, note: current, content: raw, operation: "open", inspection, message: "原本を開きました。Markdownからの上書きはしていません。" };
  let next;
  if (mode === "replace") {
    if (reviewedRaw !== raw || typeof backup !== "function") throw new Error("比較した後に保存先が変わりました。同じファイルを読み直してから、上書きを確認してください。");
    next = { ...structuredClone(imported.note), id: current.id, type: current.type, title: current.title, order: current.order };
    let source = sourceMatches(current.importSource, imported.generated) ? current.importSource : null;
    if (source) { try { validateSource(source, current); } catch { source = null; } }
    const groups = new Map((source?.groups || []).map((item) => [item.sourceId, item.targetId]));
    const items = new Map((source?.items || []).map((item) => [item.sourceId, item.targetId]));
    const currentItems = new Map(current.groups.flatMap((group) => group.items).map((item) => [item.id, item]));
    if (imported.generated.version >= 2) imported.generated.sourceIds.forEach((group, i) => {
      next.groups[i].id = groups.get(group.id) || current.groups.find((item) => item.id === group.id)?.id || next.groups[i].id;
      group.items.forEach((item, j) => { next.groups[i].items[j].id = items.get(item.id) || currentItems.get(item.id)?.id || next.groups[i].items[j].id; });
    });
    remapSelfLinks(next, imported.generated);
    assertInboundLinks(inspection.entries.filter((candidate) => candidate.item.id !== entry.item.id), current, next, inspection.workId, entry.item.name);
    await backup({ ...entry, raw, data: current });
    assertCurrent(isCurrent);
    if (await provider.readText(entry.item) !== raw) throw new Error("バックアップ中にノートが更新されました。上書きせず停止しました。読み直してください。");
    if (current.id !== imported.generated.noteId && !inspection.copies.some((candidate) => candidate.item.id !== entry.item.id)) {
      next = await attachImportSource(next, imported.generated);
    }
  } else if (mode === "adopt") {
    if (current.importSource || comparable(current) !== comparable(imported.note)) throw new Error("登録先の内容が変わりました。読み直してください。");
    next = await attachImportSource(current, imported.generated);
  } else {
    validateSource(current.importSource, current);
    if (!sourceMatches(current.importSource, imported.generated)) throw new Error("生成元との対応が変わりました。読み直してください。");
    if ((current.importSource.formatVersion || 2) >= 3 && imported.generated.version < 3) throw new Error("旧形式のMarkdownでは詳細項目を保持できません。最新版を再生成してください。上書きしていません。");
    if (current.importSource.formatVersion >= 4 && imported.generated.version < 4) throw new Error("旧形式のMarkdownでは画像の関連付け・呼び名一覧を保持できません。最新版を再生成してください。上書きしていません。");
    if (!needsTemplateUpdate(current.importSource, imported.generated)) {
      if (imported.generated.version >= 2 && !current.importSource.groups.length && comparable(current) === comparable(imported.note)) {
        next = await attachImportSource(current, imported.generated);
      } else return { item: entry.item, note: current, content: raw, operation: "open", inspection, message: "同じ保存版を読込済みのため、変更せずノートを開きました。" };
    }
    if (!next) {
      if (await noteImportHash(current) !== current.importSource.contentHash) {
        throw new Error("読込先のノートも編集されています。上書きせず停止しました。変更内容を退避し、既存ノート側で手動で反映してください。");
      }
      if (imported.generated.version < 2 || !current.importSource.groups?.length) {
        if (comparable(current) !== comparable(imported.note)) throw new Error("旧形式の対応情報では項目を安全に対応できません。最新版のVS Codeで再生成し、同じ内容の版から読込先を登録してください。");
        next = await attachImportSource(current, imported.generated);
      } else {
        const groups = new Map(current.importSource.groups.map((item) => [item.sourceId, item.targetId]));
        const items = new Map(current.importSource.items.map((item) => [item.sourceId, item]));
        const replacement = structuredClone(imported.note.groups);
        imported.generated.sourceIds.forEach((group, i) => {
          replacement[i].id = groups.get(group.id) || replacement[i].id;
          group.items.forEach((item, j) => {
            const previous = items.get(item.id);
            if (previous && previous.kind !== item.kind) throw new Error("項目の種類が変わりました。安全に反映できないため停止しました。");
            replacement[i].items[j].id = previous?.targetId || replacement[i].items[j].id;
          });
        });
        next = { ...current, groups: replacement };
        if (imported.generated.version >= 4) {
          next.addressBook = structuredClone(imported.note.addressBook);
          if (imported.note.importedAddressBook) next.importedAddressBook = structuredClone(imported.note.importedAddressBook);
          else delete next.importedAddressBook;
        }
        remapSelfLinks(next, imported.generated);
        assertInboundLinks(inspection.entries.filter((candidate) => candidate.item.id !== entry.item.id), current, next, inspection.workId, entry.item.name);
        next = await attachImportSource(next, imported.generated);
      }
    }
  }
  next.updatedAt = new Date().toISOString();
  const content = `${JSON.stringify(next, null, 2)}\n`;
  assertCurrent(isCurrent);
  const saved = await writeTextWithBaseline(provider, entry.item, content, raw, "note");
  return { item: { ...entry.item, ...saved }, note: next, content, operation: "update", mutated: true, inspection,
    message: mode === "replace" ? "上書き前の内容をバックアップし、選んだノートを置き換えました。" : mode === "adopt" ? "既存ノートを読込先に登録しました。" : "既存の読込先へ反映しました。" };
}
