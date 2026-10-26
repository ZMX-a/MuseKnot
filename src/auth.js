import React, { useEffect, useRef, useState } from 'react';
import htm from 'htm';
import { request, setCurrentUser, activeUserId } from './cloud.js';
import { localRepository } from './db.js';
import { importLegacy, legacyBundle } from './import-local.js';

import { HomeBackgroundProvider, HomeBackgroundSettings } from './home-background.js';
import { PwaInstall } from './pwa.js';
import { captureInvitation } from './account-flow.js';
import { PasswordField, InvitationPanel, RecoveryStep } from './account-ui.js';

const html = htm.bind(React.createElement);
export function AuthGate({ children }) {
  const [user,setUser]=useState(null);
  const [ready,setReady]=useState(false);
  const [invite,setInvite]=useState(()=>captureInvitation(window.location,window.history));
  const [mode,setMode]=useState(invite?'register':'login');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [localCount,setLocalCount]=useState(0);
  const [hasLocal,setHasLocal]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [imported,setImported]=useState(false);
  const [showAccount,setShowAccount]=useState(false);
  const [renewRecovery,setRenewRecovery]=useState(false);
  const [recoveryCode,setRecoveryCode]=useState('');
  const [recoveryReason,setRecoveryReason]=useState('register');
  const epoch=useRef(0);
  function announce() { try { localStorage.setItem('museknot:auth-change',Date.now()+':'+Math.random()); } catch {} }
  async function checkLegacy(account) {
    const owner=await localRepository.getMeta('cloud:import-owner');
    const completed=await localRepository.getMeta('cloud:import-complete');
    if(activeUserId()!==account.id) return;
    if((owner && owner!==account.id) || completed===account.id) {
      setLocalCount(0); setHasLocal(false); setShowImport(false); setImported(true); return;
    }
    const bundle=await legacyBundle(localRepository);
    if(activeUserId()!==account.id) return;
    setLocalCount(bundle.notes.length);
    setHasLocal(bundle.notes.length>0 || bundle.drafts.length>0 || bundle.threads.length>0);
    setShowImport(bundle.notes.length>0 || bundle.drafts.length>0 || bundle.threads.length>0);
    setImported(false);
  }
  useEffect(()=>{
    function lock() {
      epoch.current++;
      setCurrentUser(null); setUser(null); setRecoveryCode(''); setShowImport(false);
      setShowAccount(false); setRenewRecovery(false); setReady(true); setBusy(false);
      setError('登录状态已变化，请重新登录。未提交的输入保留在原账号的本机草稿中。');
      // Dispose the old document and all its pending callbacks before another login.
      try { sessionStorage.setItem('museknot:locked','1'); window.location.reload(); } catch {}
    }
    function changed(event) { if(event.key==='museknot:auth-change') lock(); }
    async function verify() {
      const owner=activeUserId();
      if(!owner || document.hidden)return;
      try { const result=await request('/auth/me'); if(activeUserId()===owner && result.user?.id!==owner) lock(); } catch {}
    }
    window.addEventListener('museknot-session-lost',lock);
    window.addEventListener('storage',changed);
    window.addEventListener('focus',verify);
    document.addEventListener('visibilitychange',verify);
    return()=>{
      window.removeEventListener('museknot-session-lost',lock);
      window.removeEventListener('storage',changed);
      window.removeEventListener('focus',verify);
      document.removeEventListener('visibilitychange',verify);
    };
  },[]);
  useEffect(()=>{ let live=true; (async()=>{
    const generation=epoch.current;
    try {
      if(sessionStorage.getItem('museknot:locked')) {
        sessionStorage.removeItem('museknot:locked');
        setError('登录状态已变化，请重新登录。未提交的输入保留在原账号的本机草稿中。');
        return;
      }
      const result=await request('/auth/me');
      if(!live || epoch.current!==generation)return;
      setCurrentUser(result.user); setUser(result.user);
      if(result.user) await checkLegacy(result.user);
    } catch(e) { if(live)setError(e.message); }
    finally { if(live)setReady(true); }
  })(); return()=>{live=false;}; },[]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const generation=epoch.current;
    const form=new FormData(event.currentTarget);
    try {
      const payload={email:String(form.get('email')||''),password:String(form.get('password')||'')};
      if(mode==='register') payload.invite=invite||String(form.get('invite')||'').trim();
      if(mode==='reset') payload.recoveryCode=String(form.get('recovery')||'');
      const result=await request('/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(epoch.current!==generation)return;
      setCurrentUser(result.user); setUser(result.user);
      announce();
      if(result.recoveryCode) { setRecoveryCode(result.recoveryCode); setRecoveryReason(mode); }
      await checkLegacy(result.user);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function importLocal() {
    setBusy(true); setError('');
    try {
      await importLegacy(localRepository,request,user.id);
      setImported(true); setShowImport(false); window.location.reload();
    } catch(e) { setError('导入未完成，浏览器原记录仍在。'+e.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try { await request('/auth/logout',{method:'POST'}); } catch(e) { setError(e.message); return; }
    setCurrentUser(null); setUser(null); setShowAccount(false); setImported(false); setShowImport(false);
    announce();
    window.location.reload();
  }
  async function refreshRecovery(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const password=String(new FormData(event.currentTarget).get('password')||'');
      const result=await request('/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      setRecoveryCode(result.recoveryCode); setRecoveryReason('renew'); setRenewRecovery(false); setShowAccount(false);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  if(!ready)return html`<main className="account-screen"><p>正在确认登录状态…</p></main>`;
  if(recoveryCode)return html`<${RecoveryStep} code=${recoveryCode} email=${user.email} reason=${recoveryReason} onContinue=${()=>setRecoveryCode('')} />`;
  if(!user)return html`<main className="account-screen"><form key=${mode} className="account-card" onSubmit=${submit}>
    <div className="account-mark">M / K</div><h1>${mode==='login'?'欢迎回来':mode==='register'?'创建账号':'找回账号'}</h1>
    <p>${mode==='login'?'登录后，继续自己的记录。':mode==='register'?'用邮箱和密码，开始保存你的灵感。':'用事先保存的恢复码设置新密码。'}</p>
    ${mode==='register'&&invite?html`<div className="account-invite-ready"><span>邀请已带入，无需填写邀请码。</span><button type="button" disabled=${busy} onClick=${()=>setInvite('')}>更换</button></div>`:null}
    <label>邮箱<input name="email" type="email" required autoComplete=${mode==='login'?'username':'email'} /></label>
    ${mode==='reset'?html`<label>备用恢复码<input name="recovery" required autoComplete="off" /></label>`:null}
    <${PasswordField} label=${mode==='reset'?'新密码':'密码'} login=${mode==='login'} />
    ${mode==='register'&&!invite?html`<label>邀请码<input name="invite" required maxLength="512" autoComplete="off" /><span className="account-helper">也可以直接打开朋友发来的邀请链接，自动带入。</span></label>`:null}
    ${error?html`<p className="account-error" role="alert">${error}</p>`:null}
    <button type="submit" disabled=${busy}>${busy?'请稍候…':mode==='login'?'登录':mode==='register'?'创建账号':'设置新密码'}</button>
    ${mode==='login'?html`<p className="account-keep-login">此浏览器会保持登录 30 天，退出登录或重设密码后需重新登录。</p>`:null}
    <button className="account-link" type="button" disabled=${busy} onClick=${()=>{setMode(mode==='login'?'register':'login');setError('');}}>${mode==='login'?'第一次来？创建账号':'返回登录'}</button>
    ${mode==='login'?html`<button className="account-link" type="button" disabled=${busy} onClick=${()=>{setMode('reset');setError('');}}>忘记密码</button>`:null}
  </form></main>`;
  if(showImport)return html`<main className="account-screen"><section className="account-card">
    <div className="account-mark">M / K</div><h1>找到了本机旧记录</h1>
    <p>这个浏览器中有 ${localCount} 条笔记，以及可能存在的草稿或脉络。将复制到 ${user.email}。请确认这些记录属于你；原记录仍会保留。</p>
    ${error?html`<p className="account-error" role="alert">${error}</p>`:null}
    <button disabled=${busy} onClick=${importLocal}>${busy?'正在导入…':'确认是我的记录并导入'}</button>
    <button className="account-link" disabled=${busy} onClick=${()=>setShowImport(false)}>稍后再导入</button>
  </section></main>`;
  return html`<${HomeBackgroundProvider} key=${user.id} ownerId=${user.id}><div className="account-app">
    ${children}
    <button className="account-corner" onClick=${()=>setShowAccount(value=>!value)} aria-label="账号设置">账号</button>
    ${showAccount?html`<aside className="account-menu" aria-label="账号设置">
      <strong>${user.email}</strong>
      ${hasLocal&&!imported?html`<button onClick=${()=>{setShowAccount(false);setShowImport(true);}}>导入本机旧记录</button>`:null}
      ${renewRecovery?html`<form onSubmit=${refreshRecovery}><p className="account-helper">生成后，旧恢复码会失效。请保存新的一份。</p><${PasswordField} label="确认账号密码" login=${true} /><button disabled=${busy}>生成恢复码</button><button type="button" disabled=${busy} onClick=${()=>setRenewRecovery(false)}>取消</button></form>`:html`<button onClick=${()=>setRenewRecovery(true)}>设置找回方式</button>`}
      <${InvitationPanel} initialInvite=${invite} />
      <${HomeBackgroundSettings} />
      <${PwaInstall} />
      <button onClick=${logout}>退出登录</button>
      ${error?html`<p role="alert">${error}</p>`:null}
    </aside>`:null}
  </div><//>`;
}
