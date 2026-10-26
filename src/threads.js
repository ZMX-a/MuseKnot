import React, { useEffect, useMemo, useRef, useState } from 'react';
import htm from 'htm';
import { notePreview } from './note-preview.js';
import { LongImageButton } from './long-image.js';
import { moveItem } from './long-image-model.js';

const html = htm.bind(React.createElement);

function lineLayout(notes) {
  if (notes.length <= 1) return { width: 820, xs: [410] };
  // Give longer neighboring labels a little more breathing room; order itself is not a timeline.
  const gaps = notes.slice(0, -1).map((note, i) => {
    const next = notes[i + 1];
    return 190 + Math.min(90, Math.max(0, (labelFor(note).length + labelFor(next).length - 8) * 5));
  });
  const span = gaps.reduce((sum, gap) => sum + gap, 0);
  const width = Math.max(820, span + 120);
  let x = (width - span) / 2;
  const xs = [x];
  for (const gap of gaps) { x += gap; xs.push(x); }
  return { width, xs };
}

function excerpt(body) {
  return (body || '').split('\n').filter(line => line.trim() && !line.startsWith('>')).slice(0, 3).join('\n');
}
function labelFor(note) {
  const preview = notePreview(note);
  return (preview.title || preview.excerpt || '图片记录').slice(0, 52);
}

export function ThreadLines({ threads, inspirations, onOpen, onCreate, onManage, onRemove, onAdd }) {
  const [activeId, setActiveId] = useState(threads[0]?.id || null);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const viewportRef = useRef(null);
  useEffect(() => {
    if (!threads.some(thread => thread.id === activeId)) {
      setActiveId(threads[0]?.id || null);
      setActiveNoteId(null);
    }
  }, [threads, activeId]);

  const activeThread = threads.find(thread => thread.id === activeId) || threads[0] || null;
  const notes = useMemo(() => {
    if (!activeThread) return [];
    const byId = new Map(inspirations.map(insp => [insp.id, insp]));
    return (activeThread.noteIds || []).map(id => byId.get(id)).filter(Boolean);
  }, [activeThread, inspirations]);
  const selected = notes.find(note => note.id === activeNoteId) || notes[0] || null;
  const layout = lineLayout(notes);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || window.innerWidth > 760 || !notes.length) return;
    const target = layout.xs[0] - (notes.length === 1 ? viewport.clientWidth / 2 : 72);
    viewport.scrollLeft = Math.max(0, target);
  }, [activeThread?.id, notes.length]);

  if (!threads.length) {
    return html`<section className="thread-lines-empty">
      <div className="thread-lines-kicker">记录脉络</div>
      <h2>还没有脉络</h2>
      <p>从一条或多条记录开始，为它们起个名字。</p>
      <button className="btn primary" onClick=${onCreate}>从记录库选择</button>
    </section>`;
  }

  return html`<section className="thread-lines" aria-label="记录脉络">
    <header className="thread-lines-head">
      <div className="thread-lines-kicker">已建立的脉络</div>
      <button className="btn primary sm" onClick=${onCreate}>＋ 新建脉络</button>
    </header>
    <div className="thread-switcher" role="tablist" aria-label="选择脉络">
      ${threads.map(thread => html`<button key=${thread.id} role="tab" aria-selected=${activeThread.id === thread.id}
        className=${'thread-switch' + (activeThread.id === thread.id ? ' active' : '')}
        onClick=${() => { setActiveId(thread.id); setActiveNoteId(null); }}>${thread.name}<small>${(thread.noteIds || []).length}</small></button>`)}
    </div>
    <div className="thread-line-heading"><div><h2>${activeThread.name}</h2><span>${notes.length} 条记录</span></div>
      <div className="thread-actions"><${LongImageButton} key=${activeThread.id} notes=${notes} expectedCount=${(activeThread.noteIds || []).length} title=${activeThread.name} /><button onClick=${() => onAdd(activeThread.id)}>＋ 加入记录</button><button onClick=${() => onManage(activeThread)}>管理脉络</button></div>
    </div>
    ${notes.length !== (activeThread.noteIds || []).length ? html`<p className="thread-dialog-error" role="alert">部分记录尚未读取，请刷新后再导出，避免遗漏内容。已有脉络关联仍保留。</p>` : null}
    ${notes.length ? html`<div className="thread-line-viewport" ref=${viewportRef}><div className="thread-line-axis" style=${{ '--axis-width': layout.width + 'px' }}>
        <svg className="thread-line-svg" viewBox=${'0 0 ' + layout.width + ' 260'} preserveAspectRatio="none" aria-hidden="true">
          ${notes.length === 1
            ? html`<line className="thread-segment" x1=${layout.xs[0] - 36} y1="130" x2=${layout.xs[0] + 36} y2="130"/>`
            : notes.slice(0, -1).map((note, i) => html`<line key=${note.id + '::line'} className="thread-segment" x1=${layout.xs[i]} y1="130" x2=${layout.xs[i + 1]} y2="130"/>`)}
        </svg>
        ${notes.map((note, i) => {
          const position = i === 0 ? 'align-start' : (i === notes.length - 1 ? 'align-end' : (i % 2 ? 'align-end' : 'align-start'));
          return html`<button key=${note.id} className=${'thread-point' + (selected?.id === note.id ? ' selected' : '') + ' ' + position}
            style=${{ left: layout.xs[i] + 'px' }} aria-label=${'查看记录：' + (note.title || '未命名')}
            onClick=${() => setActiveNoteId(note.id)}>
            <span className=${'thread-point-label ' + (i % 2 === 0 ? 'above' : 'below')}>
              <strong>${labelFor(note)}</strong><small>${note.updatedAt ? new Date(note.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' 更新' : '记录'}</small>
            </span>
          </button>`;
        })}
      </div></div>
      ${selected ? html`<section className="thread-note-detail" aria-live="polite">
        <div className="thread-note-kicker">选中的记录</div><div className="thread-note-content"><h3>${labelFor(selected)}</h3>
          <p>${excerpt(selected.body)}</p><small>${selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</small></div>
        <div className="thread-note-actions"><button className="link-btn" onClick=${() => onRemove(activeThread.id, selected.id)}>移出脉络</button><button className="link-btn" onClick=${() => onOpen(selected.id)}>打开记录 ↗</button></div>
      </section>` : null}`
      : html`<div className="thread-lines-empty compact"><p>这条脉络目前没有记录。</p><button className="btn ghost sm" onClick=${() => onAdd(activeThread.id)}>从记录库加入</button></div>`}
  </section>`;
}

export function ThreadDialog({ inspirations, threads, selectedIds, editingThread, initialTargetId, onClose, onSave, onDelete }) {
  const [name, setName] = useState(editingThread?.name || '');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [orderedIds, setOrderedIds] = useState(() => [...(editingThread?.noteIds || selectedIds)]);
  const selectedNotes = orderedIds.map(id => inspirations.find(insp => insp.id === id)).filter(Boolean);
  const [choices, setChoices] = useState(() => Object.fromEntries(threads.map(thread => {
    const members = selectedIds.filter(id => (thread.noteIds || []).includes(id)).length;
    return [thread.id, { checked: members === selectedIds.length && selectedIds.length > 0 || thread.id === initialTargetId, mixed: members > 0 && members < selectedIds.length, touched: thread.id === initialTargetId }];
  })));
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (saving) return;
    const membership = Object.fromEntries(Object.entries(choices).map(([id, choice]) => [id, choice.touched ? choice.checked : null]));
    setSaving(true);
    setError('');
    try { await onSave({ name: name.trim(), noteIds: orderedIds, membership, editingId: editingThread?.id || null }); }
    catch (e) { setError(e.message?.startsWith('脉络') ? e.message : '脉络未能保存，选择仍在，请重试。'); setSaving(false); }
  };
  const removeThread = async () => {
    if (!deleteArmed) { setDeleteArmed(true); return; }
    if (saving) return;
    setSaving(true);
    setError('');
    try { await onDelete(editingThread.id); }
    catch (_) { setError('删除失败，请重试。'); setSaving(false); }
  };
  const hasChanges = name.trim() || Object.values(choices).some(choice => choice.touched);

  return html`<div className="thread-dialog-backdrop" onClick=${event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="thread-dialog" role="dialog" aria-modal="true" aria-labelledby="threadDialogTitle">
      <header><div><div className="thread-lines-kicker">记录脉络</div><h2 id="threadDialogTitle">${editingThread ? '管理脉络' : '连接记录'}</h2></div><button className="thread-dialog-close" aria-label="关闭" onClick=${onClose}>×</button></header>
      ${editingThread ? html`<label className="thread-field-label">脉络名称<input autoFocus value=${name} onChange=${event => setName(event.target.value)} maxLength="40" placeholder="为这条脉络命名" /></label>` : html`<div>
        <p className="thread-dialog-help">已选 ${selectedNotes.length} 条记录。勾选已有脉络可加入，取消勾选可移出；也可以新建脉络。记录正文不会复制。</p>
        <label className="thread-field-label">新建脉络（可选）<input autoFocus value=${name} onChange=${event => setName(event.target.value)} maxLength="40" placeholder="例如：北川的过去" /></label>
        ${threads.length ? html`<div className="thread-choice-list"><div className="thread-choice-title">加入已有脉络</div>
          ${threads.map(thread => {
            const choice = choices[thread.id] || { checked: false, mixed: false, touched: false };
            return html`<label key=${thread.id} className="thread-choice"><input type="checkbox" checked=${choice.checked} ref=${element => { if (element) element.indeterminate = choice.mixed && !choice.touched; }}
              onChange=${event => setChoices(prev => ({ ...prev, [thread.id]: { checked: event.target.checked, mixed: false, touched: true } }))}/><span>${thread.name}</span><small>${(thread.noteIds || []).length} 条</small></label>`;
          })}</div>` : null}
      </div>`}
      ${orderedIds.length ? html`<section className="thread-order" aria-label="记录排序"><h3>记录顺序</h3>
        <p className="thread-dialog-help">用上移、下移调整阅读顺序，保存后生效。${editingThread ? '长图也按这个顺序排列。' : '加入已有脉络时，新选的记录按此顺序追加。'}</p>
        <ol>${orderedIds.map((id, index) => {
          const note = inspirations.find(item => item.id === id);
          const label = note ? labelFor(note) : '暂不可用的记录（保留关联）';
          return html`<li key=${id}><span className="thread-order-label">${label}</span><div>
            <button type="button" className="btn ghost sm" disabled=${saving || index === 0} aria-label=${'上移：' + label} onClick=${() => setOrderedIds(ids => moveItem(ids, index, index - 1))}>↑ 上移</button>
            <button type="button" className="btn ghost sm" disabled=${saving || index === orderedIds.length - 1} aria-label=${'下移：' + label} onClick=${() => setOrderedIds(ids => moveItem(ids, index, index + 1))}>↓ 下移</button>
          </div></li>`;
        })}</ol></section>` : null}
      ${editingThread && onDelete ? html`<div className="thread-delete-row"><button className=${'link-btn danger' + (deleteArmed ? ' armed' : '')} disabled=${saving} onClick=${removeThread}>${deleteArmed ? '再点一次删除脉络' : '删除脉络'}</button><span>只删除这条脉络，不删除其中的记录</span></div>` : null}
      ${error ? html`<p className="thread-dialog-error" role="alert">${error}</p>` : null}
      <footer><button className="btn ghost sm" onClick=${onClose}>取消</button><button className="btn primary sm" disabled=${saving || (editingThread ? !name.trim() : !hasChanges)} onClick=${save}>${saving ? '正在保存…' : '保存'}</button></footer>
    </section>
  </div>`;
}
