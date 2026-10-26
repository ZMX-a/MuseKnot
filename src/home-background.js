import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import htm from 'htm';
import * as db from './db.js';
import { activeUserId } from './cloud.js';

const html = htm.bind(React.createElement);
export const BACKGROUND_KEY = 'appearance:home-background';
const Background = createContext({ url: null });
export const useHomeBackground = () => useContext(Background);

export function validateBackground(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('请选择不超过 8 MB 的图片。');
}

// Recheck the account after uploading, before associating an image with settings.
export async function saveBackground(file, ownerId, repository = db, getOwner = activeUserId) {
  validateBackground(file);
  const checkOwner = () => { if (!ownerId || getOwner() !== ownerId) throw new Error('账号已切换，请重新登录后设置背景。'); };
  checkOwner();
  const imageId = crypto.randomUUID();
  await repository.putImage(imageId, file);
  checkOwner();
  await repository.setMeta(BACKGROUND_KEY, { imageId }, ownerId);
  checkOwner();
  return imageId;
}

export function HomeBackgroundProvider({ ownerId, children }) {
  const [url, setUrl] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const live = useRef(false), currentUrl = useRef(null), operation = useRef(false);
  function display(blob) {
    const next = blob ? URL.createObjectURL(blob) : null;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = next;
    setUrl(next);
  }
  const isCurrent = () => live.current && activeUserId() === ownerId;
  useEffect(() => {
    live.current = true;
    let cancelled = false;
    (async () => {
      try {
        const setting = await db.getMeta(BACKGROUND_KEY);
        if (cancelled || !isCurrent()) return;
        const blob = setting?.imageId ? await db.getImage(setting.imageId) : null;
        if (cancelled || !isCurrent()) return;
        display(blob);
        if (setting?.imageId && !blob) setError('原背景图片未找到，请重新选择。');
      } catch (e) { if (!cancelled && isCurrent()) setError(e.message); }
      finally { if (!cancelled && isCurrent()) setReady(true); }
    })();
    function cleared() { if (isCurrent()) { display(null); setMessage('已恢复默认背景。'); } }
    window.addEventListener('museknot-data-cleared', cleared);
    return () => {
      cancelled = true; live.current = false;
      window.removeEventListener('museknot-data-cleared', cleared);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    };
  }, [ownerId]);
  async function change(file) {
    if (!file || !ready || operation.current || !isCurrent()) return;
    operation.current = true; setBusy(true); setError(''); setMessage('');
    try {
      validateBackground(file);
      // Decode before saving, so broken image files cannot replace a working background.
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      if (!isCurrent()) return;
      await saveBackground(file, ownerId);
      if (isCurrent()) { display(file); setMessage('背景已保存，仅当前账号使用。'); }
    } catch (e) { if (isCurrent()) setError(e.message); }
    finally { operation.current = false; if (isCurrent()) setBusy(false); }
  }
  async function reset() {
    if (!ready || operation.current || !isCurrent()) return;
    operation.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await db.setMeta(BACKGROUND_KEY, null, ownerId);
      if (isCurrent()) { display(null); setMessage('已恢复默认背景。'); }
    } catch (e) { if (isCurrent()) setError(e.message); }
    finally { operation.current = false; if (isCurrent()) setBusy(false); }
  }
  return html`<${Background.Provider} value=${{ url, ready, busy, message, error, change, reset }}>${children}<//>`;
}

export function HomeBackgroundSettings() {
  const { url, ready, busy, message, error, change, reset } = useHomeBackground();
  return html`<details className="home-background-settings"><summary>首页背景</summary>
    <p className="account-helper">选择自己喜欢的图片，仅当前账号使用。请使用你有权使用的图片。</p>
    <label>选择背景图片<input type="file" accept="image/png,image/jpeg,image/webp" disabled=${!ready || busy} onChange=${e => { const file = e.target.files?.[0]; e.target.value = ''; change(file); }} /><span className="account-helper">PNG、JPG、WebP，最大 8 MB</span></label>
    <button type="button" disabled=${!ready || busy || !url} onClick=${reset}>恢复默认背景</button>
    ${busy ? html`<p role="status">正在保存背景…</p>` : message ? html`<p role="status">${message}</p>` : null}
    ${error ? html`<p className="account-error" role="alert">${error}</p>` : null}
  </details>`;
}
