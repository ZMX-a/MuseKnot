import { migrateNote, applyOperation } from './records.js';
import { cloud } from './cloud.js';

// Keep the existing stores; record schema migration is atomic with its backup.
export function createRepository(name = 'museknot', factory = globalThis.indexedDB) {
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => {
        for (const [store, keyPath] of [['inspirations', 'id'], ['images', 'id'], ['meta', 'key']]) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, { keyPath });
        }
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); connection = null; };
        resolve(req.result);
      };
      req.onerror = () => { connection = null; reject(req.error); };
      req.onblocked = () => { connection = null; reject(new Error('请关闭其他旧版页面后重试。')); };
    });
    return connection;
  }
  async function transaction(names, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      let result, problem;
      const fail = error => { problem = error; try { tx.abort(); } catch (_) {} };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(problem || tx.error || new Error('存储事务未完成，请重试。'));
      tx.onerror = () => {};
      try { work(tx, value => { result = value; }, fail); } catch (e) { fail(e); }
    });
  }
  function preserveAndMigrate(tx, note) {
    if (!note || note.schemaVersion === 2) return note;
    tx.objectStore('meta').put({ key: 'migration:v2:' + note.id, value: { migratedAt: Date.now(), original: note } });
    const migrated = migrateNote(note);
    tx.objectStore('inspirations').put(migrated);
    return migrated;
  }
  const api = {
    getAllInspirations: () => transaction(['inspirations', 'meta'], 'readwrite', (tx, done, fail) => {
      const req = tx.objectStore('inspirations').getAll();
      req.onsuccess = () => {
        try { done(req.result.map(n => preserveAndMigrate(tx, n)).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0))); }
        catch (e) { fail(e); }
      };
    }),
    getInspiration: id => transaction(['inspirations', 'meta'], 'readwrite', (tx, done, fail) => {
      const req = tx.objectStore('inspirations').get(id);
      req.onsuccess = () => { try { done(preserveAndMigrate(tx, req.result)); } catch (e) { fail(e); } };
    }),
    commitOperation: (op, draftKey) => transaction(['inspirations', 'meta'], 'readwrite', (tx, done, fail) => {
      const store = tx.objectStore('inspirations'), req = store.get(op.noteId);
      req.onsuccess = () => {
        try {
          const saved = applyOperation(preserveAndMigrate(tx, req.result), op);
          store.put(saved);
          if (draftKey) {
            const draft = tx.objectStore('meta').get(draftKey);
            draft.onsuccess = () => {
              if (draft.result?.value?.operationId === op.operationId) tx.objectStore('meta').delete(draftKey);
            };
          }
          done(saved);
        } catch (e) { fail(e); }
      };
    }),
    saveInspiration: note => transaction(['inspirations', 'meta'], 'readwrite', (tx, done, fail) => {
      const store = tx.objectStore('inspirations'), req = store.get(note.id);
      req.onsuccess = () => {
        try {
          const existing = preserveAndMigrate(tx, req.result);
          if (existing && note.body !== existing.body) throw new Error('正文更新请使用段落编辑，以保留修改历史。');
          const saved = existing ? { ...existing, kind: note.kind ?? existing.kind,
            title: note.title ?? existing.title, mood: note.mood ?? existing.mood,
            updatedAt: note.updatedAt ?? existing.updatedAt } : applyOperation(null, {
              type: 'create', operationId: note.id + ':initial', noteId: note.id,
              body: note.body, imageId: note.imageId, note,
            }, note.createdAt || Date.now());
          store.put(saved); done(saved);
        } catch (e) { fail(e); }
      };
    }),
    getMeta: (key, fallback = null) => transaction(['meta'], 'readonly', (tx, done) => {
      const r = tx.objectStore('meta').get(key); r.onsuccess = () => done(r.result ? r.result.value : fallback);
    }),
    setMeta: (key, value) => transaction(['meta'], 'readwrite', tx => { tx.objectStore('meta').put({ key, value }); }),
    getAllMeta: () => transaction(['meta'], 'readonly', (tx,done) => {
      const req=tx.objectStore('meta').getAll(); req.onsuccess=()=>done(req.result);
    }),
    claimLegacy: ownerId => transaction(['meta'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('meta'),req=store.get('cloud:import-owner');
      req.onsuccess=()=>{
        if(req.result?.value && req.result.value!==ownerId) return fail(new Error('旧记录已关联另一个账号'));
        store.put({key:'cloud:import-owner',value:ownerId}); done(true);
      };
    }),
    putImage: (id, blob) => transaction(['images'], 'readwrite', tx => { tx.objectStore('images').put({ id, blob }); }),
    getImage: id => !id ? Promise.resolve(null) : transaction(['images'], 'readonly', (tx, done) => {
      const r = tx.objectStore('images').get(id); r.onsuccess = () => done(r.result?.blob || null);
    }),
    deleteImage: id => !id ? Promise.resolve() : transaction(['images'], 'readwrite', tx => { tx.objectStore('images').delete(id); }),
    deleteInspiration: id => transaction(['inspirations'], 'readwrite', tx => { tx.objectStore('inspirations').delete(id); }),
    clearAll: () => transaction(['inspirations', 'images', 'meta'], 'readwrite', tx => {
      for (const name of ['inspirations', 'images', 'meta']) tx.objectStore(name).clear();
    }),
    close: async () => { (await open()).close(); connection = null; },
  };
  return api;
}
const repository = createRepository();
export const { getAllInspirations, getInspiration, commitOperation, saveInspiration, getMeta,
  setMeta, putImage, getImage, deleteImage, deleteInspiration, clearAll } = cloud;
export const localRepository = repository;
export function uuid() {
  return globalThis.crypto?.randomUUID?.() || 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}
