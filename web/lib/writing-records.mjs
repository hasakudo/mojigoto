import { OneDriveConflictError } from "../storage/onedrive-provider.mjs";

export const WRITING_EVENTS_FILE = "web-writing-events.json";
const MAX_EVENTS = 1000;

function jstParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    dateJst: `${parts.year}-${parts.month}-${parts.day}`,
    savedAtJst: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `web_${globalThis.crypto.randomUUID()}`;
  return `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function makeWritingEvent({ file, beforeCount, afterCount, savedAt = new Date() }) {
  const before = Number(beforeCount) || 0;
  const after = Number(afterCount) || 0;
  return {
    id: makeId(),
    source: "web",
    savedAt: savedAt.toISOString(),
    ...jstParts(savedAt),
    file: String(file || "").replaceAll("\\", "/").replace(/^\/+/, ""),
    beforeCount: before,
    afterCount: after,
    delta: after - before,
  };
}

export function appendEventDocument(document, event, maxEvents = MAX_EVENTS) {
  const current = document && typeof document === "object" ? document : {};
  const events = Array.isArray(current.events) ? current.events.filter(Boolean).slice() : [];
  if (!events.some((item) => item.id === event.id)) events.push(event);
  if (maxEvents > 0 && events.length > maxEvents) events.splice(0, events.length - maxEvents);
  return {
    schemaVersion: 1,
    updatedAt: event.savedAt,
    events,
  };
}

export async function appendWritingEvent(provider, mojigotoFolder, event, attempts = 3) {
  if (!mojigotoFolder?.id) throw new Error("作品の .mojigoto フォルダが見つかりません。");

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const children = await provider.listChildren(mojigotoFolder.id);
    const file = children.find((item) => item?.file && item.name === WRITING_EVENTS_FILE);
    if (!file && provider.requiresExplicitFileAccess) {
      throw new Error("執筆記録の保存先を確認できません。VS Codeで作品を開いて集計を更新し、Driveの同期完了後に .mojigoto 内の web-writing-events.json を追加許可してください。重複を防ぐため、新規作成していません。");
    }
    let document = {};
    if (file) {
      document = JSON.parse(await provider.readText(file));
      if (!document || typeof document !== "object" || !Array.isArray(document.events)) {
        throw new Error("執筆記録の形式を確認できません。既存の記録は変更していません。");
      }
    }
    const content = `${JSON.stringify(appendEventDocument(document, event), null, 2)}\n`;

    try {
      if (file) return await provider.writeText(file, content, file.eTag);
      return await provider.createTextFile(mojigotoFolder, WRITING_EVENTS_FILE, content);
    } catch (error) {
      if (!(error instanceof OneDriveConflictError) && error?.code !== "conflict") throw error;
      if (attempt === attempts - 1) throw error;
    }
  }
  throw new Error("執筆記録を保存できませんでした。");
}
