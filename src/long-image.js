import React, { useEffect, useRef, useState } from 'react';
import htm from 'htm';
import * as db from './db.js';
import { exportSections, wrapText, paginate, IMAGE_WIDTH, PAGE_PAD } from './long-image-model.js';

const html = htm.bind(React.createElement);
const fontFamily = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
const bodyColor = '#263c31';
const check = signal => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };

async function loadImage(id, signal) {
  const blob = await db.getImage(id);
  check(signal);
  if (!blob) throw new Error('一张配图暂时无法读取，请检查网络后重试。没有生成缺图的长图。');
  const url = URL.createObjectURL(blob);
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    check(signal);
    const scale = Math.min(1, (IMAGE_WIDTH - 2 * PAGE_PAD) / picture.naturalWidth, 1600 / picture.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('图片内存不足，请关闭其他页面后重试。');
    ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

export async function generateLongImages({ notes, title, showTime, signal, onProgress = () => {} }) {
  check(signal);
  if (!notes.length) throw new Error('还没有可导出的记录。');
  await document.fonts?.ready;
  const sections = exportSections(notes, showTime);
  const measureCanvas = document.createElement('canvas');
  const measure = measureCanvas.getContext('2d');
  if (!measure) throw new Error('浏览器暂时无法生成图片，请重试。');
  const blocks = [], pictures = new Map(), urls = [];
  const gap = height => blocks.push({ type: 'gap', height });
  const text = (value, size = 36, color = bodyColor, weight = 400) => {
    measure.font = `${weight} ${size}px ${fontFamily}`;
    for (const row of wrapText(value, t => measure.measureText(t).width, IMAGE_WIDTH - PAGE_PAD * 2)) {
      blocks.push({ type: 'text', text: row, size, color, weight, height: Math.ceil(size * 1.65) });
    }
  };
  try {
    text('MUSEKNOT · 灵感成结', 22, '#657a65'); gap(22);
    text(title || sections[0].title, 48, bodyColor, 600); gap(24);
    for (let n = 0; n < sections.length; n++) {
      check(signal);
      const section = sections[n];
      if (sections.length > 1 || title) { text(`${n + 1}. ${section.title}`, 40, bodyColor, 600); gap(16); }
      for (const entry of section.entries) {
        text(entry.label + (entry.time ? ' · ' + entry.time : ''), 24, '#657a65'); gap(12);
        if (entry.body) text(entry.body);
        if (entry.imageId) {
          if (!pictures.has(entry.imageId)) pictures.set(entry.imageId, await loadImage(entry.imageId, signal));
          const picture = pictures.get(entry.imageId);
          gap(18); blocks.push({ type: 'image', picture, height: picture.height });
        }
        gap(36);
      }
      if (n < sections.length - 1) { blocks.push({ type: 'rule', height: 26 }); gap(24); }
      onProgress(`正在排版 ${n + 1} / ${sections.length} 条记录…`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const pages = paginate(blocks);
    for (let i = 0; i < pages.length; i++) {
      check(signal);
      onProgress(`正在生成第 ${i + 1} / ${pages.length} 张长图…`);
      const page = pages[i], canvas = document.createElement('canvas');
      canvas.width = IMAGE_WIDTH; canvas.height = page.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('图片内存不足，请关闭其他页面后重试。');
      ctx.fillStyle = '#faf7ef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textBaseline = 'top';
      for (const block of page.blocks) {
        if (block.type === 'text') {
          ctx.font = `${block.weight} ${block.size}px ${fontFamily}`;
          ctx.fillStyle = block.color;
          ctx.fillText(block.text, PAGE_PAD, block.y + 5);
        } else if (block.type === 'image') ctx.drawImage(block.picture, PAGE_PAD, block.y);
        else if (block.type === 'rule') { ctx.fillStyle = '#d8dfd2'; ctx.fillRect(PAGE_PAD, block.y + 12, IMAGE_WIDTH - 2 * PAGE_PAD, 2); }
      }
      ctx.font = `22px ${fontFamily}`; ctx.fillStyle = '#657a65';
      ctx.fillText(`${i + 1} / ${pages.length}`, PAGE_PAD, canvas.height - 38);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败，请重试。')), 'image/png'));
      canvas.width = canvas.height = 1;
      check(signal);
      urls.push({ blob, url: URL.createObjectURL(blob), width: IMAGE_WIDTH, height: page.height });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return urls;
  } catch (error) { urls.forEach(item => URL.revokeObjectURL(item.url)); throw error; }
  finally { pictures.forEach(canvas => { canvas.width = canvas.height = 1; }); measureCanvas.width = measureCanvas.height = 1; }
}

function LongImageDialog({ notes, title, onClose }) {
  const [showTime, setShowTime] = useState(true), [images, setImages] = useState([]);
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef(null), generated = useRef([]), dialog = useRef(null);
  const snapshot = useRef(structuredClone(notes));
  const filename = (title || notes[0]?.title || 'MuseKnot-记录').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 70);
  const clear = () => { generated.current.forEach(item => URL.revokeObjectURL(item.url)); generated.current = []; setImages([]); };
  useEffect(() => {
    const before = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => { controller.current?.abort(); generated.current.forEach(item => URL.revokeObjectURL(item.url)); before?.focus?.(); };
  }, []);
  const generate = async () => {
    if (controller.current && !controller.current.signal.aborted && busy) return;
    controller.current?.abort();
    const run = new AbortController(); controller.current = run;
    clear(); setBusy(true); setError(''); setStatus('正在读取记录和配图…');
    try {
      const result = await generateLongImages({ notes: snapshot.current, title, showTime, signal: run.signal, onProgress: setStatus });
      if (run.signal.aborted) { result.forEach(item => URL.revokeObjectURL(item.url)); return; }
      generated.current = result; setImages(result); setStatus(`已生成 ${result.length} 张图片`);
    } catch (e) { if (!run.signal.aborted) { setError(e.message || '生成失败，请重试。'); setStatus(''); } }
    finally { if (!run.signal.aborted) setBusy(false); }
  };
  async function shareImage(item,index) {
    try {
      const file=new File([item.blob],filename+'-'+(index+1)+'.png',{type:'image/png'});
      await navigator.share({files:[file]});
      setStatus('已交给系统分享，请在系统面板中完成保存或发送。');
    } catch(e) {
      if(e.name!=='AbortError')setError('此设备未能分享图片，请使用保存图片，或长按预览图。');
    }
  }
  const canShare=item=>{try{return Boolean(navigator.share&&navigator.canShare?.({files:[new File([item.blob],'MuseKnot.png',{type:'image/png'})]}));}catch{return false;}};
  return html`<div className="long-image-backdrop" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="long-image-dialog" ref=${dialog} role="dialog" aria-modal="true" aria-labelledby="long-image-title"
      onKeyDown=${e => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        if (e.key !== 'Tab') return;
        const items = [...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
      }}>
      <header><div><p className="record-caption">保存下来，慢慢读</p><h2 id="long-image-title">导出长图</h2></div><button className="btn ghost sm" onClick=${onClose}>关闭</button></header>
      <p className="record-caption">包含已保存的正文、全部续写和配图。长内容自动分图；修改历史和未提交的草稿保留在原记录中，不包含在图片里。</p>
      <div className="long-image-controls"><label><input type="checkbox" checked=${showTime} disabled=${busy}
        onChange=${e => { setShowTime(e.target.checked); clear(); setStatus(''); }} />显示记录时间</label>
        <button className="btn primary sm" disabled=${busy} onClick=${generate}>${busy ? '正在生成…' : images.length ? '重新生成' : '生成预览'}</button></div>
      <p className="record-caption" role="status">${status}</p>
      ${error ? html`<p className="writing-error" role="alert">${error}</p>` : null}
      ${images.length ? html`<p className="record-caption">点击保存图片；支持的手机可用系统分享面板保存或发送，也可长按预览图。</p>` : null}
      <div className="long-image-previews">${images.map((item, index) => html`<figure key=${item.url}>
        <figcaption><span>第 ${index + 1} / ${images.length} 张</span><div className="long-image-save-actions">${canShare(item)?html`<button className="btn ghost sm" onClick=${()=>shareImage(item,index)}>分享 / 存到手机</button>`:null}<a className="btn primary sm" href=${item.url} download=${`${filename}-${index + 1}.png`}>保存图片</a></div></figcaption>
        <img src=${item.url} width=${item.width} height=${item.height} loading="lazy" alt=${`长图预览，第 ${index + 1} 张`} />
      </figure>`)}</div>
    </section>
  </div>`;
}

export function LongImageButton({ notes, title, expectedCount = notes.length }) {
  const [open, setOpen] = useState(false);
  return html`<button className="btn ghost sm" disabled=${!notes.length || notes.length !== expectedCount} title=${notes.length !== expectedCount ? '部分记录尚未读取，刷新后再导出' : '将已保存内容生成图片'} onClick=${() => setOpen(true)}>导出长图</button>
    ${open ? html`<${LongImageDialog} notes=${notes} title=${title} onClose=${() => setOpen(false)} />` : null}`;
}
