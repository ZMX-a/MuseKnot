let currentUser = null;
export const activeUserId = () => currentUser?.id || null;
export const setCurrentUser = user => { currentUser = user; };

export async function request(path, options = {}) {
  const publicAuth=['/auth/me','/auth/login','/auth/register','/auth/reset'].includes(path);
  const owner=options.ownerId || activeUserId();
  if(!publicAuth && !owner) throw new Error('请先登录');
  const {raw,ownerId,...fetchOptions}=options;
  const headers={...options.headers,...(!publicAuth?{'X-MuseKnot-User':owner}:{})};
  const response = await fetch(new URL('api' + path, document.baseURI), { credentials: 'same-origin', cache: 'no-store', ...fetchOptions,headers });
  if(!publicAuth && activeUserId()!==owner) throw new Error('账号已切换，已停止旧页面操作');
  if (!response.ok) {
    let reason;
    try { reason = (await response.json()).error; } catch (_) {}
    const error = new Error(reason || '云端保存失败，请检查网络后重试。');
    error.status = response.status;
    if(!publicAuth && [401,428].includes(response.status)) window.dispatchEvent(new Event('museknot-session-lost'));
    throw error;
  }
  if (raw) return response.blob();
  return response.json();
}
export const cloud = {
  getAllInspirations: () => request('/notes'),
  getInspiration: id => request('/notes/' + encodeURIComponent(id)).catch(e => e.status === 404 ? null : Promise.reject(e)),
  saveInspiration: note => request('/notes', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(note) }),
  commitOperation: (op, draftKey) => request('/notes/' + encodeURIComponent(op.noteId) + '/operation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(op) }).then(async saved => {
    if (draftKey) {
      const draft = await cloud.getMeta(draftKey).catch(() => null);
      if (draft?.operationId === op.operationId) await cloud.setMeta(draftKey, null).catch(() => {});
    }
    return saved;
  }),
  deleteInspiration: id => request('/notes/' + encodeURIComponent(id), {method:'DELETE'}),
  clearAll: () => request('/notes', {method:'DELETE'}),
  getMeta: async (key, fallback = null) => (await request('/meta/' + encodeURIComponent(key))).value ?? fallback,
  setMeta: (key,value,ownerId) => request('/meta/' + encodeURIComponent(key), {method:'PUT', ownerId,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),
  putImage: (id,blob) => request('/images/' + encodeURIComponent(id), {method:'PUT',headers:{'Content-Type':blob.type},body:blob}),
  getImage: id => !id ? Promise.resolve(null) : request('/images/' + encodeURIComponent(id), {raw:true}).catch(e => e.status===404 ? null : Promise.reject(e)),
  deleteImage: id => !id ? Promise.resolve() : request('/images/' + encodeURIComponent(id), {method:'DELETE'}),
};
