// Record schema v2: entries are independent writing sessions, revisions are edits.
export function orderedEntries(note) {
  return [...(note.entries || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.sequence || 0) - (b.sequence || 0));
}
export function projectNote(note) {
  const entries = orderedEntries(note);
  return { ...note, entries, body: entries.map(e => e.body || '').join('\n\n'),
    imageId: entries.find(e => e.imageId)?.imageId };
}
export function migrateNote(note) {
  if (note.schemaVersion === 2 && Array.isArray(note.entries)) return note;
  const snapshots = Array.isArray(note.versions) ? structuredClone(note.versions) : [];
  const body = typeof note.body === 'string' ? note.body : (snapshots.at(-1)?.body || '');
  return projectNote({ ...note, schemaVersion: 2,
    entries: [{ id: note.id + ':initial', sequence: 0, body, imageId: note.imageId,
      createdAt: note.createdAt || null, updatedAt: note.updatedAt || note.createdAt || null,
      revision: 0, revisions: [], imported: true }],
    legacyVersions: snapshots, operationIds: [] });
}
export function applyOperation(existing, op, now = Date.now()) {
  if (!op.operationId || !op.noteId) throw new Error('缺少保存标识，请重新打开记录。');
  let note = existing ? migrateNote(existing) : null;
  if (note?.operationIds?.includes(op.operationId)) return note;
  if (op.type === 'create') {
    if (note) throw new Error('这条灵感已经存在，请重新打开。');
    note = { ...(op.note || {}), id: op.noteId, schemaVersion: 2, createdAt: now,
      updatedAt: now, entries: [], legacyVersions: [], operationIds: [] };
  } else if (!note) throw new Error('这条灵感已不存在，输入内容仍保留。');
  const entries = orderedEntries(note).map(e => ({ ...e, revisions: [...(e.revisions || [])] }));
  let body = op.body || '', imageId = op.imageId;
  if (op.type === 'restore') {
    const entry = entries.find(e => e.id === op.entryId);
    const version = entry?.revisions.find(r => r.id === op.revisionId);
    if (!version) throw new Error('找不到这个历史版本。');
    body = version.body; imageId = version.imageId;
  }
  const namedOcCard = op.type === 'create' && op.note?.kind === 'oc' && op.note?.title?.trim();
  if (!body.trim() && !imageId && !namedOcCard) throw new Error('请先写下内容或添加图片。');
  if (op.type === 'create' || op.type === 'append') {
    const last = entries.at(-1);
    const ts = Math.max(now, (last?.createdAt || 0) + 1);
    entries.push({ id: op.operationId, sequence: entries.length, body, imageId,
      createdAt: ts, updatedAt: ts, revision: 0, revisions: [] });
  } else if (op.type === 'edit' || op.type === 'restore') {
    const entry = entries.find(e => e.id === op.entryId);
    if (!entry) throw new Error('找不到要编辑的段落。');
    if (entry.revision !== op.expectedRevision) throw new Error('这一段已在另一处更新。输入仍保留，请重新打开并核对后再编辑。');
    if (entry.body !== body || entry.imageId !== imageId) {
      entry.revisions.push({ id: op.operationId, body: entry.body, imageId: entry.imageId,
        savedAt: entry.updatedAt, replacedAt: now, reason: op.type });
      entry.body = body; entry.imageId = imageId; entry.updatedAt = now;
      entry.revision += 1;
    }
  } else throw new Error('不支持的保存操作。');
  return projectNote({ ...note, title: typeof op.title === 'string' && note.kind === 'oc' ? op.title.trim() : note.title,
    entries, updatedAt: Math.max(now, entries.at(-1)?.updatedAt || 0),
    operationIds: [...(note.operationIds || []), op.operationId] });
}
export const entryLabel = i => i === 0 ? '首次记录' : '第 ' + i + ' 次续写';
export const recordTime = ts => ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '原记录未提供时间';
