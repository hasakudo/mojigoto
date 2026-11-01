import { normalizeNote } from "./notes.mjs";
import { normalizeConceptDocument } from "./concept-memos.mjs";

export function hasExternalVersion(currentFile, remoteMetadata) {
  const localETag = String(currentFile?.eTag || "").trim();
  const remoteETag = String(remoteMetadata?.eTag || "").trim();
  return Boolean(localETag && remoteETag && localETag !== remoteETag);
}

export function hasSameExternalContent(lastSavedContent, remoteContent, kind = "text") {
  const normalizeLineEndings = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
  if (kind === "note" || kind === "concept") {
    const normalize = kind === "note" ? normalizeNote : normalizeConceptDocument;
    const canonicalize = (value) => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort()
          .filter((key) => key !== "updatedAt")
          .map((key) => [key, canonicalize(value[key])]));
      }
      return value;
    };
    try {
      return JSON.stringify(canonicalize(normalize(JSON.parse(lastSavedContent))))
        === JSON.stringify(canonicalize(normalize(JSON.parse(remoteContent))));
    } catch {
      return false;
    }
  }
  return normalizeLineEndings(lastSavedContent) === normalizeLineEndings(remoteContent);
}

export async function writeTextWithBaseline(provider, item, content, baseline, kind) {
  try {
    return await provider.writeText(item, content, item.eTag);
  } catch (error) {
    if (error?.code !== "conflict") throw error;
    const metadata = await provider.getItemMetadata(item);
    const refreshed = { ...item, ...metadata };
    const remote = await provider.readText(refreshed);
    // Retry only when the saved content is unchanged. The new version still
    // protects against another edit between this read and the retry.
    if (!hasSameExternalContent(baseline, remote, kind)) throw error;
    return provider.writeText(refreshed, content, refreshed.eTag);
  }
}
