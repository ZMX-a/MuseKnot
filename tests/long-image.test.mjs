import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportSections, wrapText, paginate, moveItem, validateOrder } from '../src/long-image-model.js';
import { generateLongImages } from '../src/long-image.js';
import { setCurrentUser } from '../src/cloud.js';

test('export preserves independent entries, their images and chronology without changing source histories', () => {
  const notes = [{ id: 'n', title: '原文', schemaVersion: 2, entries: [
    { id: 'second', body: '第二段\n\n空行保留', imageId: 'pic2', createdAt: 2, revisions: [{ body: '旧版本', imageId: 'oldPic' }] },
    { id: 'first', body: '首次内容', imageId: 'pic1', createdAt: 1 },
  ], legacyVersions: [{ body: '旧快照' }] }];
  const before = structuredClone(notes);
  const result = exportSections(notes);
  assert.deepEqual(result[0].entries.map(e => [e.label, e.body, e.imageId]), [
    ['首次记录', '首次内容', 'pic1'], ['第 1 次续写', '第二段\n\n空行保留', 'pic2'],
  ]);
  assert.deepEqual(notes, before);
  assert.equal(exportSections(notes, false)[0].entries[0].time, '');
  result[0].entries[0].body = 'cannot change original';
  assert.deepEqual(notes, before);
});

test('legacy articles and image-only notes export without dropping content or mutating source', () => {
  const notes = [{ id: 'legacy', type: 'woven', body: '完整文章', versions: [{ body: '旧文章' }] }, { id: 'picture', imageId: 'photo' }];
  const before = JSON.stringify(notes);
  const result = exportSections(notes);
  assert.equal(result[0].entries[0].body, '完整文章');
  assert.equal(result[0].title, '文章');
  assert.equal(result[1].entries[0].imageId, 'photo');
  assert.equal(JSON.stringify(notes), before);
});

test('wrapping keeps all CJK, whitespace, long words and full emoji graphemes', () => {
  const text = '  你好👨‍👩‍👧‍👦 e\u0301 中文https://example.test/' + 'a'.repeat(800);
  const measure = value => Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value)).length * 10;
  const rows = wrapText(text, measure, 60);
  assert.equal(rows.join(''), text);
  assert(rows.every(row => measure(row) <= 60));
  assert(rows.some(row => row.includes('👨‍👩‍👧‍👦')));
  assert.deepEqual(wrapText('第一段\r\n\r\n末段\n', measure, 100), ['第一段', '', '末段', '']);
});

test('very long content splits at complete blocks, within canvas limits, without gaps or duplicates', () => {
  const blocks = Array.from({ length: 10000 }, (_, index) => ({ type: 'text', text: String(index), height: 60 }));
  blocks.splice(123, 0, { type: 'image', height: 1600, id: 'photo' });
  const pages = paginate(blocks);
  assert(pages.length > 1);
  assert(pages.every(page => page.height <= 8000));
  assert.deepEqual(pages.flatMap(page => page.blocks.map(({ y, ...block }) => block)), blocks);
  for (const page of pages) for (const block of page.blocks) assert(block.y + block.height <= page.height - 64);
  assert.throws(() => paginate([{ height: 9000 }]), /超出/);
});

test('reordering preserves every membership, including unavailable records; invalid changes fail', () => {
  const original = ['a', 'unavailable', 'b'];
  const moved = moveItem(original, 2, 0);
  assert.deepEqual(moved, ['b', 'a', 'unavailable']);
  assert.deepEqual(original, ['a', 'unavailable', 'b']);
  assert.deepEqual(validateOrder(original, moved), moved);
  assert.deepEqual(moveItem(original, 0, -1), original);
  assert.throws(() => validateOrder(original, ['b', 'a']), /成员已变化/);
  assert.throws(() => validateOrder(original, ['b', 'a', 'a']), /成员已变化/);
  assert.throws(() => validateOrder(original, ['b', 'a', 'injected']), /成员已变化/);
});

test('image generation is read-only, abortable, and missing pictures fail instead of silently disappearing', async () => {
  const original = { document: globalThis.document, fetch: globalThis.fetch };
  const operations = [], painted = [];
  const context = { measureText: text => ({ width: [...text].length * 20 }), fillRect(){}, drawImage(){}, fillText(text){ painted.push(text); } };
  globalThis.document = { baseURI: 'https://example.test/museknot/', fonts: { ready: Promise.resolve() }, createElement: () => ({
    width:0, height:0, getContext:()=>context, toBlob:callback=>callback(new Blob(['synthetic-png'])),
  }) };
  globalThis.fetch = async (url, options) => { operations.push([String(url), options.method || 'GET']); return new Response('{}',{status:404}); };
  setCurrentUser({ id: 'synthetic-owner' });
  try {
    const note = { id:'n', body:'所有正文\n最后一行' };
    const before = JSON.stringify(note);
    const result = await generateLongImages({notes:[note],showTime:false});
    assert.equal(result.length,1);
    result.forEach(item=>URL.revokeObjectURL(item.url));
    assert(painted.includes('最后一行'));
    assert.equal(JSON.stringify(note),before);
    assert.equal(operations.length,0,'text-only export makes no API calls');
    await assert.rejects(generateLongImages({notes:[{id:'bad',body:'do not omit image',imageId:'missing'}]}),/配图暂时无法读取/);
    assert.deepEqual(operations,[['https://example.test/museknot/api/images/missing','GET']]);
    await assert.rejects(generateLongImages({notes:[note],signal:AbortSignal.abort()}),{name:'AbortError'});
  } finally { Object.assign(globalThis, original); setCurrentUser(null); }
});
