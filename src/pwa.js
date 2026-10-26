import React, {useEffect,useState} from 'react';
import htm from 'htm';
const html=htm.bind(React.createElement);
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault(); installPrompt=event; window.dispatchEvent(new Event('museknot-install-ready'));
});
window.addEventListener('appinstalled',()=>{installPrompt=null;window.dispatchEvent(new Event('museknot-install-ready'));});
export function registerPwa() {
 if(!window.isSecureContext||!('serviceWorker' in navigator))return;
 const worker=new URL('./sw.js',document.baseURI);
 navigator.serviceWorker.register(worker,{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'}).catch(()=>{});
}
export function PwaInstall() {
 const [available,setAvailable]=useState(Boolean(installPrompt));
 const [status,setStatus]=useState('');
 const [standalone,setStandalone]=useState(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const changed=()=>{setAvailable(Boolean(installPrompt));setStandalone(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);};
  window.addEventListener('museknot-install-ready',changed);
  const media=window.matchMedia('(display-mode: standalone)');media.addEventListener('change',changed);
  return()=>{window.removeEventListener('museknot-install-ready',changed);media.removeEventListener('change',changed);};
 },[]);
 async function install(){
  const prompt=installPrompt;if(!prompt)return;
  installPrompt=null;setAvailable(false);setBusy(true);
  try{await prompt.prompt();const result=await prompt.userChoice;setStatus(result.outcome==='accepted'?'已提交安装，请按浏览器提示完成。':'已取消安装，可以稍后从浏览器菜单添加。');}
  catch{setStatus('请从浏览器菜单选择“安装应用”或“添加到主屏幕”。');}
  finally{setBusy(false);}
 }
 return html`<details className="pwa-install"><summary>添加到手机或电脑桌面</summary>
  ${standalone?html`<p>你正在独立窗口中使用 MuseKnot。</p>`:html`
   ${available?html`<button type="button" disabled=${busy} onClick=${install}>安装 MuseKnot</button>`:null}
   <p>苹果手机：在 Safari 打开网站，点分享，再选“添加到主屏幕”。</p>
   <p>安卓手机：用 Chrome、Edge 等支持的浏览器打开，在菜单中选择“安装应用”或“添加到主屏幕”。微信内可先选择在浏览器打开。</p>
   <p>电脑：使用浏览器地址栏的安装图标或菜单中的“安装应用”。</p>`}
  <p>此版本需要联网使用。安装后登录状态以设备中的实际会话为准；首次打开可能需要再登录一次。</p>
  ${!window.isSecureContext?html`<p>请通过有效的 HTTPS 网站地址安装。</p>`:null}
  ${status?html`<p role="status">${status}</p>`:null}</details>`;
}
export function ConnectionStatus(){
 const [offline,setOffline]=useState(!navigator.onLine);
 useEffect(()=>{const update=()=>setOffline(!navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 return offline?html`<div className="pwa-connection" role="status">当前离线，暂时无法保存到云端。请保持页面打开，联网后再提交。</div>`:null;
}
