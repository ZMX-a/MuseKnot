import * as db from './db.js';
import { activeUserId } from './cloud.js';
const prefix = (owner=activeUserId()) => 'museknot:writing:' + (owner || 'anonymous') + ':';
const pending = new Map();
export const draftKeyFor = (note, entry) => !note ? 'writing:new' : 'writing:' + note.id + ':' + (entry ? 'edit:' + entry.id : 'append');

// Synchronous checkpoint on each input covers pagehide/background before an IDB timer.
export function checkpoint(draft) {
  try {
    const owner=draft.ownerId || activeUserId();
    if(!owner)return false;
    localStorage.setItem(prefix(owner) + draft.key, JSON.stringify(draft));
    localStorage.setItem(prefix(owner) + 'active', JSON.stringify(draft));
    return true;
  } catch (_) { return false; }
}
function local(key) {
  try { return JSON.parse(localStorage.getItem(prefix() + key) || 'null'); } catch (_) { return null; }
}
export function persistDraft(draft) {
  const owner=draft.ownerId || activeUserId();
  const pendingKey=owner+':'+draft.key;
  const previous = pending.get(pendingKey) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if(!owner || activeUserId()!==owner) throw new Error('账号已变化，草稿保留在原账号的本机缓存');
    await db.setMeta(draft.key, draft,owner);
    await db.setMeta('writing:active', draft,owner);
  });
  pending.set(pendingKey, next);
  return next;
}
export async function loadDraft(key) {
  const a = local(key);
  let b;
  try { b = await db.getMeta(key); } catch (e) { if (!a) throw e; }
  const draft = !a ? b : !b ? a : (a.savedAt >= b.savedAt ? a : b);
  if (!draft?.operationId) return null;
  const note = await db.getInspiration(draft.noteId);
  if (note?.operationIds?.includes(draft.operationId)) { clearCheckpoint(draft); return null; }
  return {...draft,ownerId:activeUserId()};
}
export async function activeDraft() {
  let draft = local('active');
  if (!draft) draft = await db.getMeta('writing:active');
  if (!draft?.key) return null;
  const found = await loadDraft(draft.key);
  return found && (found.body?.trim() || found.imageId) ? found : null;
}
export function clearCheckpoint(draft) {
  try {
    if(draft.ownerId && draft.ownerId!==activeUserId()) return;
    if (local(draft.key)?.operationId === draft.operationId) localStorage.removeItem(prefix() + draft.key);
    if (local('active')?.operationId === draft.operationId) localStorage.removeItem(prefix() + 'active');
  } catch (_) {}
}
export async function settleDraft(key) {
  await (pending.get(activeUserId()+':'+key) || Promise.resolve()).catch(() => {});
}
