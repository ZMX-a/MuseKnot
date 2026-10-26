import React, { useState } from 'react';
import htm from 'htm';
import { invitationLink } from './account-flow.js';
const html = htm.bind(React.createElement);
export function PasswordField({ label='密码', login=false }) {
  const [visible,setVisible]=useState(false);
  return html`<div className="account-password-field"><label htmlFor="account-password">${label}</label>
    <div className="account-password-row"><input id="account-password" name="password" type=${visible?'text':'password'} required minLength=${login?1:12} maxLength="1024" autoComplete=${login?'current-password':'new-password'} />
    <button type="button" className="account-password-toggle" aria-label=${visible?'隐藏密码':'显示密码'} onClick=${()=>setVisible(!visible)}>${visible?'隐藏':'显示'}</button></div>
    ${login?null:html`<p className="account-helper">至少 12 个字符，可以用一句容易记住的话，无需凑特殊符号。</p>`}</div>`;
}
export function InvitationPanel({ initialInvite='' }) {
  const [link,setLink]=useState('');
  const [status,setStatus]=useState('');
  function generate(event) {
    event.preventDefault(); setStatus('');
    try { setLink(invitationLink(document.baseURI,String(new FormData(event.currentTarget).get('invite')||''))); }
    catch(e) { setLink(''); setStatus(e.message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setStatus('邀请链接已复制。'); }
    catch { setStatus('请选中上面的链接手动复制。'); }
  }
  return html`<details className="account-invitation"><summary>邀请朋友</summary>
    <p className="account-helper">填一次已有的邀请码，生成链接发给朋友，对方打开就不用再填。链接仅发给你想邀请的人。</p>
    <form onSubmit=${generate}><label>已有的邀请码<input name="invite" type="password" defaultValue=${initialInvite} required maxLength="512" autoComplete="off" /></label><button type="submit">生成邀请链接</button></form>
    ${link?html`<label>邀请链接<input aria-label="邀请链接" readOnly value=${link} onFocus=${e=>e.target.select()} /><button type="button" onClick=${copy}>复制链接</button></label>`:null}
    ${status?html`<p role="status">${status}</p>`:null}</details>`;
}
export function RecoveryStep({ code, email, reason, onContinue }) {
  const [status,setStatus]=useState('');
  function download() {
    const blob=new Blob(['MuseKnot 账号找回\n邮箱：'+email+'\n恢复码：'+code+'\n请保存在安全的位置，不要分享给他人。\n'],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a'); anchor.href=url; anchor.download='MuseKnot-账号找回.txt'; anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); setStatus('已发起保存，请确认文件已下载。');
  }
  return html`<main className="account-screen"><section className="account-card">
    <div className="account-mark">M / K</div><h1>${reason==='register'?'可以开始记录了':'新的找回方式已准备好'}</h1>
    <p>恢复码用于忘记密码时找回账号。现在可以先开始使用，以后在“账号 → 设置找回方式”中重新生成并保存。</p>
    <button type="button" onClick=${onContinue}>${reason==='register'?'开始记录':'完成'}</button>
    <details className="account-recovery-details"><summary>保存备用恢复码（建议）</summary>
      <p>恢复码只在本次展示。忘记密码后，需要事先保存的恢复码才能自行找回账号。</p>
      ${reason==='register'?null:html`<p>之前的恢复码已失效，请保存这一份。</p>`}
      <code className="account-recovery">${code}</code><button type="button" className="account-secondary" onClick=${download}>保存到文件</button>
      ${status?html`<p role="status">${status}</p>`:null}</details>
  </section></main>`;
}
