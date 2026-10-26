import React, { useEffect, useRef, useState } from 'react';
import htm from 'htm';
import * as db from './db.js';
import { activeUserId } from './cloud.js';
import { migrateNote, orderedEntries, entryLabel, recordTime } from './records.js';
import { draftKeyFor, loadDraft, checkpoint, persistDraft, clearCheckpoint, settleDraft } from './drafts.js';
import { normalizeName, renameSavedNote } from './note-name.js';
import { LongImageButton } from './long-image.js';
const html = htm.bind(React.createElement);
const readableError = e => /^(这一段|这条灵感|找不到|请先|缺少保存)/.test(e?.message || '') ? e.message : '请稍后重试。';

function RecordImage({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true, objectUrl;
    setUrl(null);
    db.getImage(id).then(blob => {
      if (live && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? html`<img className="record-image" src=${url} alt="记录中的图片" />` : null;
}

export function EntryTimeline({ note, onEdit, onRestore, renderContent }) {
  const entries = orderedEntries(migrateNote(note));
  return html`<section className="record-timeline" aria-label="记录时间线">
    ${entries.map((entry, i) => html`<article className=${'record-entry' + (note.kind === 'oc' && i === 0 ? ' oc-profile-record' : '')} key=${entry.id}>
      <header className="record-meta"><strong>${entryLabel(i)}</strong><time>${recordTime(entry.createdAt)}</time>
        ${entry.revision > 0 ? html`<span>已编辑 · ${recordTime(entry.updatedAt)}</span>` : null}
      </header>
      ${entry.imported ? html`<p className="record-caption">由旧版当前正文保留；过去的快照未拆分为续写。</p>` : null}
      ${note.kind === 'oc' && i === 0 ? html`<section className="oc-profile-card" aria-label="人物卡">
        <div className="oc-profile-head">
          ${entry.imageId ? html`<div className="oc-profile-image"><${RecordImage} id=${entry.imageId} /></div>` : null}
          <div className="oc-profile-name"><span>OC</span><h2>${note.title || '未命名'}</h2></div>
        </div>
        ${entry.body ? html`<div className="oc-profile-intro">${renderContent ? renderContent(entry.body) : entry.body}</div>` : null}
      </section>` : html`<div className="record-body">${renderContent ? renderContent(entry.body) : entry.body}</div>
        ${entry.imageId ? html`<${RecordImage} id=${entry.imageId} />` : null}`}
      ${onEdit ? html`<button className="record-link" onClick=${() => onEdit(entry)}>编辑本次内容</button>` : null}
      ${entry.revisions?.length ? html`<details className="record-history">
        <summary>查看修改历史（${entry.revisions.length}）</summary>
        ${entry.revisions.slice().reverse().map(version => html`<section key=${version.id} className="record-version">
          <p className="record-caption">修改前版本 · ${recordTime(version.savedAt)} · ${version.reason === 'restore' ? '恢复前保留' : '编辑前保留'}</p>
          <div className="record-body">${version.body}</div>
          ${version.imageId ? html`<${RecordImage} id=${version.imageId} />` : null}
          ${onRestore ? html`<button className="record-link" onClick=${() => onRestore(entry, version)}>恢复此版本</button>` : null}
        </section>`)}
      </details>` : null}
    </article>`)}
  </section>`;
}

export function RecordComposer({ note, entry, defaultKind = 'inspiration', onCommitted, onCancel, compact = false }) {
  const key = draftKeyFor(note, entry);
  const [body, setBody] = useState(entry?.body || '');
  const [ocName, setOcName] = useState(note?.title || '');
  const [imageId, setImageId] = useState(entry?.imageId);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [kind, setKind] = useState(note?.kind || defaultKind);
  const isOcProfile = kind === 'oc' && (!note || entry?.sequence === 0);
  const textRef = useRef(null), timer = useRef(null), active = useRef(true), lock = useRef(false);
  const draft = useRef({ key, ownerId: activeUserId(), noteId: note?.id || db.uuid(), operationId: db.uuid(),
    type: !note ? 'create' : entry ? 'edit' : 'append', entryId: entry?.id, title: note?.title || '',
    expectedRevision: entry?.revision, body: entry?.body || '', imageId: entry?.imageId,
    kind: note?.kind || defaultKind, savedAt: 0 });
  useEffect(() => {
    if (ready && entry) textRef.current?.focus();
  }, [ready]);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    (async () => {
      try {
        let found = await loadDraft(key);
        if (!found && !note) {
          const legacy = await db.getMeta('draft');
          const consumed = await db.getMeta('writing:legacy-draft-imported');
          if (!consumed && (legacy?.body?.trim() || legacy?.imageId)) {
            found = { ...draft.current, ...legacy, key, ownerId: activeUserId(), savedAt: legacy.savedAt || Date.now() };
          }
        }
        if (cancelled) return;
        if (found) { draft.current = found; setBody(found.body || ''); setOcName(found.title || note?.title || ''); setImageId(found.imageId); setKind(found.kind || defaultKind); setRestored(true); setStatus('草稿已找回，尚未保存为正式记录'); }
      } catch (_) { if (!cancelled) setError('暂时无法读取草稿。请重新打开后重试，避免覆盖未完成内容。'); return; }
      if (!cancelled) { setReady(true); if (entry) textRef.current?.focus(); }
    })();
    const flush = () => {
      if (!draft.current.savedAt || lock.current) return;
      clearTimeout(timer.current);
      checkpoint(draft.current);
      persistDraft({ ...draft.current }).catch(() => {});
    };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelled = true; active.current = false; flush(); clearTimeout(timer.current);
      window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden);
    };
  }, [key]);
  const saveDraft = next => {
    const snapshot = { ...draft.current, ...next, savedAt: Date.now() };
    draft.current = snapshot;
    const localOK = checkpoint(snapshot);
    setStatus(localOK ? '草稿已保存（本机）· 尚未正式提交' : '正在保存草稿…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persistDraft(snapshot).then(() => {
        if (active.current && draft.current.savedAt === snapshot.savedAt) setStatus('草稿已保存 · 尚未正式提交');
      }).catch(() => { if (active.current) setStatus(localOK ? '草稿已保留在本机；数据库写入失败，请稍后重试' : '草稿保存失败，请勿关闭页面'); });
    }, 250);
  };
  const change = value => { setBody(value); saveDraft({ body: value }); };
  const changeTitle = value => { setOcName(value); saveDraft({ title: value }); };
  const upload = async blob => {
    if (!blob || lock.current) return;
    setBusy(true); lock.current = true; setError('');
    try { const id = db.uuid(); await db.putImage(id, blob); setImageId(id); saveDraft({ imageId: id }); }
    catch (_) { setError('图片保存失败，文字仍保留，请重新选择图片。'); }
    finally { setBusy(false); lock.current = false; }
  };
  const submit = async () => {
    if (!ready || lock.current) return;
    let savedName;
    try { savedName=normalizeName(draft.current.title); }
    catch(e) { setError(e.message); return; }
    if (!draft.current.body.trim() && !draft.current.imageId && !(draft.current.kind === 'oc' && savedName)) {
      setError('请写下一点内容、名字，或添加图片。'); textRef.current?.focus(); return;
    }
    lock.current = true; setBusy(true); setError(''); setStatus('正在保存正式记录…');
    clearTimeout(timer.current);
    const snapshot = { ...draft.current, savedAt: Date.now() };
    checkpoint(snapshot);
    let saved;
    try {
      await settleDraft(key);
      // Failure to save the draft must not prevent retrying the formal transaction.
      await persistDraft(snapshot).catch(() => {});
      saved = await db.commitOperation({ ...snapshot,
        title: snapshot.kind === 'oc' ? savedName : undefined,
        note: { title: savedName, kind: snapshot.kind, type: 'knot' } }, key);
    } catch (e) {
      setError('保存失败，输入内容仍保留。' + readableError(e));
      setStatus('尚未保存为正式记录'); setBusy(false); lock.current = false; return;
    }
    clearCheckpoint(snapshot);
    draft.current = { ...snapshot, savedAt: 0 };
    if (!note) db.setMeta('writing:legacy-draft-imported', true).catch(() => {});
    setStatus('正式记录已保存');
    // The transaction is already committed; UI errors must not be reported as save failures.
    onCommitted(saved);
  };
  const leave = async () => {
    if (lock.current) return;
    clearTimeout(timer.current);
    if (draft.current.savedAt) {
      const localOK = checkpoint(draft.current);
      try { await persistDraft({ ...draft.current }); }
      catch (_) { if (!localOK) { setError('草稿保存失败，请勿关闭页面。'); return; } }
    }
    onCancel?.();
  };
  const title = !note ? '首次记录' : entry ? '编辑' + entryLabel(orderedEntries(note).findIndex(e => e.id === entry.id)) : '本次续写';
  return html`<section className=${'record-composer' + (compact ? ' compact' : '')} aria-label=${title}>
    <div className="composer-heading"><h2>${title}</h2>
      ${onCancel ? html`<button className="record-link" disabled=${busy} onClick=${leave}>${compact ? '取消编辑' : '← 返回'}</button>` : null}
    </div>
    ${entry ? html`<p className="record-caption">只修改这一段，修改前的内容会保留在历史中。</p>` : note ? html`<p className="record-caption">保存后追加到这条记录，前文保持不变。</p>` : null}
    ${!note ? html`<fieldset className="record-kind-picker" disabled=${!ready || busy}>
      <legend>先选内容类型</legend>
      <div className="record-kind-options">
        ${[['inspiration','灵感'],['oc','OC'],['essay','散文'],['dream','梦的记录'],['diary','日记'],['image','图片']].map(([id,label]) => html`
          <button key=${id} type="button" aria-pressed=${kind === id}
            className=${'record-kind-option' + (kind === id ? ' selected' : '')}
            onClick=${() => { setKind(id); saveDraft({ kind: id }); textRef.current?.focus(); }}>${label}</button>`)}
      </div>
    </fieldset>` : null}
    ${!note && !isOcProfile ? html`<label className="record-name-field"><span>名称（选填）</span>
      <input value=${ocName} maxLength="80" disabled=${!ready || busy} placeholder="例如：MuseKnot 使用改进"
        onChange=${e => changeTitle(e.target.value)} />
      <small>给这条内容起个名字，方便以后查找。留空也可以保存。</small></label>` : null}
    ${restored ? html`<p className="draft-restored" role="status">已找回未完成输入</p>` : null}
    ${isOcProfile ? html`<section className="oc-card-compose" aria-label="人物卡编辑区">
      <div className="oc-card-identity">
        <div className="oc-card-image-wrap">
          <label className="oc-image-picker">
            ${imageId ? html`<${RecordImage} id=${imageId} />` : html`<span className="oc-image-placeholder"><b>＋</b><small>氛围图</small></span>`}
            <input type="file" accept="image/*" disabled=${!ready || busy} aria-label="添加人物氛围图"
              onChange=${e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          ${imageId ? html`<button className="record-link" disabled=${busy} onClick=${() => { setImageId(undefined); saveDraft({ imageId: undefined }); }}>移除图片</button>` : null}
        </div>
        <label className="oc-name-field"><span>人物名/意象</span>
          <input value=${ocName} maxLength="80" disabled=${!ready || busy}
            onChange=${e => changeTitle(e.target.value)} />
        </label>
      </div>
      <label className="sr-only" htmlFor=${'input-' + key}>人物简介或自由记录</label>
      <textarea id=${'input-' + key} ref=${textRef} className="record-input oc-intro-input" value=${body}
        disabled=${!ready || busy}
        onChange=${e => change(e.target.value)}
        onPaste=${e => { const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (item) { e.preventDefault(); upload(item.getAsFile()); } }}
        onKeyDown=${e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }} />
    </section>` : html`<section className="record-standard-fields">
      ${imageId ? html`<${RecordImage} id=${imageId} /><button className="record-link" disabled=${busy} onClick=${() => { setImageId(undefined); saveDraft({ imageId: undefined }); }}>移除此段图片</button>` : null}
      <label className="sr-only" htmlFor=${'input-' + key}>${entry ? '编辑内容' : note ? '本次续写内容' : '正文'}</label>
      <textarea id=${'input-' + key} ref=${textRef} className="record-input" value=${body}
        disabled=${!ready || busy}
        onChange=${e => change(e.target.value)}
        onPaste=${e => { const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (item) { e.preventDefault(); upload(item.getAsFile()); } }}
        onKeyDown=${e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }} />
    </section>`}
    ${error ? html`<p className="writing-error" role="alert">${error}</p>` : null}
    <div className="composer-actions">
      ${isOcProfile ? null : html`<label className="record-file">添加图片<input type="file" accept="image/*" disabled=${!ready || busy}
        onChange=${e => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
      `}
      <span className="record-caption">${body.trim().length} 字</span>
      <button className="record-primary" disabled=${!ready || busy} onClick=${submit}>${busy ? '正在保存…' : entry ? '保存修改' : note ? '保存本次续写' : '保存记录'}</button>
    </div>
    <p className="composer-status" role="status" aria-live="polite">${status || (ready ? '输入后自动保存草稿；点击保存后成为正式记录' : '正在读取草稿…')}</p>
  </section>`;
}

export function JournalDetail({ insp, onUpdate, onDelete, renderContent, kinds = [] }) {
  const note = migrateNote(insp);
  const [editing, setEditing] = useState(null), [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState(''), [error, setError] = useState('');
  const [pendingRestore, setPendingRestore] = useState(null), [restoring, setRestoring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [legacyDraft, setLegacyDraft] = useState(null);
  const restoreLock = useRef(false), composerRef = useRef(null);
  const [naming,setNaming]=useState(false), [name,setName]=useState('');
  const [nameBusy,setNameBusy]=useState(false), [nameError,setNameError]=useState('');
  const nameLock=useRef(false), originalName=useRef('');
  const openName=()=>{originalName.current=note.title||'';setName(note.title||'');setNameError('');setNaming(true);};
  const saveName=async event=>{
    event.preventDefault();if(nameLock.current)return;
    nameLock.current=true;setNameBusy(true);setNameError('');
    try{const saved=await renameSavedNote(note.id,name,originalName.current);onUpdate(saved);setNaming(false);setStatus('名称已保存');}
    catch(e){setNameError('名称未保存，输入仍保留。'+(e.message||'请稍后重试。'));}
    finally{nameLock.current=false;setNameBusy(false);}
  };

  useEffect(() => { db.getMeta('draft:' + note.id).then(setLegacyDraft).catch(() => {}); }, [note.id]);
  const committed = saved => {
    onUpdate(saved); setEditing(null); setGeneration(g => g + 1);
    setStatus('正式记录已保存 · ' + recordTime(saved.updatedAt)); setError('');
  };
  const restore = async () => {
    if (restoreLock.current || !pendingRestore) return;
    restoreLock.current = true; setRestoring(true); setError('');
    try {
      const saved = await db.commitOperation(pendingRestore);
      onUpdate(saved); setPendingRestore(null);
      setStatus('正式记录已保存 · 历史版本已恢复，恢复前的内容也已保留');
    } catch (e) { setError('恢复失败。' + readableError(e)); }
    finally { restoreLock.current = false; setRestoring(false); }
  };
  return html`<div className="journal-detail">
    <header className="journal-heading"><div className="record-name-heading"><h1>${note.title || '记录'}</h1>
      <button className="record-link" type="button" onClick=${openName} disabled=${nameBusy}>${note.title?'改名':'给这条内容起名'}</button></div>
      ${naming?html`<form className="record-name-form" onSubmit=${saveName}>
        <label className="record-name-field"><span>名称</span><input autoFocus value=${name} maxLength="80" disabled=${nameBusy} onChange=${e=>setName(e.target.value)} /><small>最多 80 个字符。留空可取消自定义名称。</small></label>
        <div><button className="record-primary" type="submit" disabled=${nameBusy}>${nameBusy?'正在保存…':'保存名称'}</button><button className="record-link" type="button" disabled=${nameBusy} onClick=${()=>setNaming(false)}>取消</button></div>
        ${nameError?html`<p className="writing-error" role="alert">${nameError}</p>`:null}
      </form>`:null}
      <p className="record-caption">共 ${note.entries.length} 次记录 · 续写 ${Math.max(0, note.entries.length - 1)} 次</p>
      <${LongImageButton} notes=${[note]} />
    </header>
    ${status ? html`<p className="record-success" role="status">${status}</p>` : null}
    ${error ? html`<p className="writing-error" role="alert">${error}</p>` : null}
    <${EntryTimeline} note=${note} renderContent=${renderContent}
      onEdit=${entry => { setEditing(entry); setGeneration(g => g + 1); setTimeout(() => composerRef.current?.scrollIntoView({ block: 'start' }), 0); }}
      onRestore=${(entry, version) => setPendingRestore({ type: 'restore', operationId: db.uuid(),
        noteId: note.id, entryId: entry.id, revisionId: version.id, expectedRevision: entry.revision })} />
    ${pendingRestore ? html`<div className="restore-confirm" role="group" aria-label="确认恢复历史">
      <p>恢复这个版本？当前内容会先保留到修改历史，其他段落不受影响。</p>
      <button className="record-primary" disabled=${restoring} onClick=${restore}>确认恢复</button>
      <button className="record-link" disabled=${restoring} onClick=${() => setPendingRestore(null)}>取消</button>
    </div>` : null}
    ${note.legacyVersions?.length ? html`<details className="legacy-history"><summary>旧版历史（${note.legacyVersions.length} 个正文快照）</summary>
      <p className="record-caption">原样保留，不计入续写次数。可以复制内容到本次续写，旧快照不会被删除。</p>
      ${note.legacyVersions.map((v, i) => html`<section className="record-version" key=${i}><p className="record-caption">旧版快照 ${i + 1} · ${recordTime(v.ts)}</p><div className="record-body">${v.body}</div></section>`)}
    </details>` : null}
    ${legacyDraft?.body || legacyDraft?.imageId ? html`<details className="legacy-history"><summary>旧版未完成草稿</summary><p className="record-caption">原样保留，可复制需要的部分继续写。</p><div className="record-body">${legacyDraft.body}</div><${RecordImage} id=${legacyDraft.imageId} /></details>` : null}
    <div ref=${composerRef}>
      <${RecordComposer} key=${note.id + ':' + (editing?.id || 'append') + ':' + generation}
        note=${note} entry=${editing} compact=${true} onCommitted=${committed}
        onCancel=${editing ? () => { setEditing(null); setGeneration(g => g + 1); } : undefined} />
    </div>
    <details className="record-management"><summary>管理这条记录</summary>
      <label>保存到 <select value=${note.kind || 'inspiration'} onChange=${async e => {
        try { onUpdate(await db.saveInspiration({ ...note, kind: e.target.value, updatedAt: Date.now() })); }
        catch (e) { setError(e.message); }
      }}>${kinds.map(k => html`<option key=${k.id} value=${k.id}>${k.label}</option>`)}</select></label>
      ${confirmDelete ? html`<p>删除整条记录及其所有段落？当前没有回收站。</p>
        <button className="record-link danger" onClick=${async () => { try { await onDelete(note.id); } catch (_) { setError('删除失败，请重试。'); } }}>确认删除记录</button>
        <button className="record-link" onClick=${() => setConfirmDelete(false)}>取消</button>`
        : html`<button className="record-link danger" onClick=${() => setConfirmDelete(true)}>删除记录</button>`}
    </details>
  </div>`;
}

export function RecordEditor({ insp, onSave, onCancel, defaultKind, resumeContext }) {
  const note = insp ? migrateNote(insp) : null;
  const entry = resumeContext?.type === 'edit' ? note?.entries.find(e => e.id === resumeContext.entryId) : null;
  const viewportRef = useRef(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => { if (viewportRef.current && viewport) {
      viewportRef.current.style.height = viewport.height + 'px';
      viewportRef.current.style.top = viewport.offsetTop + 'px';
    } };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); };
  }, []);
  return html`<div ref=${viewportRef} className="record-overlay" role="dialog" aria-modal="true" aria-label=${note ? '继续记录' : '新建记录'}
    onKeyDown=${e => {
      if (e.key !== 'Tab') return;
      const items = [...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary')].filter(el => el.getClientRects().length);
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    }}>
    <div className="record-editor">
      ${note ? html`<h1>${note.title}</h1><${EntryTimeline} note=${note} />` : null}
      <${RecordComposer} note=${note} entry=${entry} defaultKind=${defaultKind} onCommitted=${onSave} onCancel=${onCancel} />
    </div>
  </div>`;
}
