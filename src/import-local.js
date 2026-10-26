// Gather references from every entry and revision, including unsaved drafts.
export function imageReferences(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (typeof value.imageId === 'string' && value.imageId) found.add(value.imageId);
  for (const child of Object.values(value)) imageReferences(child, found);
  return found;
}

export async function legacyBundle(repository, storage = globalThis.localStorage) {
  const notes = await repository.getAllInspirations();
  const threads = await repository.getMeta('mk-idea-threads', []);
  const drafts = new Map((await repository.getAllMeta())
    .filter(row => /^(writing:|draft($|:))/.test(row.key)).map(row => [row.key, row.value]));
  // Only pre-account checkpoints; never copy another account's local cache.
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (!/^museknot:writing:(writing:|active$)/.test(name)) continue;
    const draft = JSON.parse(storage.getItem(name));
    if (!draft?.key || draft.ownerId || !draft.operationId) continue;
    const key = name.endsWith(':active') ? 'writing:active' : draft.key;
    if (!drafts.has(key) || (draft.savedAt || 0) > (drafts.get(key)?.savedAt || 0)) drafts.set(key, draft);
  }
  return { notes, threads: Array.isArray(threads) ? threads : [], drafts: [...drafts] };
}

export async function importLegacy(repository, send, ownerId, storage) {
  const bundle = await legacyBundle(repository, storage);
  const images = [];
  // Validate every referenced image before the first upload.
  for (const id of imageReferences(bundle)) {
    const blob = await repository.getImage(id);
    if (!blob) throw new Error('有旧图片缺失，请先检查原记录。');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('旧图片包含不支持的格式，请先转成 PNG、JPEG、WebP 或 GIF。');
    images.push([id, blob]);
  }
  await repository.claimLegacy(ownerId);
  for (const [id, blob] of images) await send('/images/' + encodeURIComponent(id), {
    method: 'PUT', ownerId, headers: { 'Content-Type': blob.type }, body: blob,
  });
  const result = await send('/import', { method: 'POST', ownerId,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bundle) });
  await repository.setMeta('cloud:import-complete', ownerId);
  return result;
}
