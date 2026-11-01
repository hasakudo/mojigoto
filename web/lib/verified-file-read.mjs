// Only providers with stable content eTags opt in. Never reuse an unverified body.
export async function readVerifiedFile(provider, cached, folderId, name) {
  if (!provider.supportsVersionedContentCache || !cached?.item?.id || !cached.item.eTag || typeof cached.raw !== "string") return null;
  let item;
  try { item = await provider.getItemMetadata(cached.item); }
  catch (error) { if (error?.status === 404) return null; throw error; }
  if (item?.id !== cached.item.id || !item.file || !item.eTag || item.name !== name
      || item.parentReference?.id !== folderId
      || (cached.item.parentReference?.driveId && item.parentReference?.driveId !== cached.item.parentReference.driveId)) return null;
  const cacheHit = item.eTag === cached.item.eTag;
  return { item: structuredClone(item), raw: cacheHit ? cached.raw : await provider.readText(item), cacheHit };
}
