import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateNote, applyOperation, orderedEntries } from '../src/records.js';
const old = { id:'old',title:'旧灵感',body:'当前正文 @人物 #线索 [[目标]]',imageId:'image-1',
  createdAt:100,updatedAt:200,type:'weave',sourceIds:['a'],kind:'prose',
  versions:[{ts:101,body:'旧稿'},{ts:200,body:'当前正文'}],custom:'keep' };
const op = (type, operationId, extra={}) => ({type,operationId,noteId:'n',body:'内容',...extra});

test('legacy migration preserves snapshots, metadata, image and input object; is idempotent',()=>{
  const before=structuredClone(old), n=migrateNote(old);
  assert.deepEqual(old,before);
  assert.equal(n.entries.length,1);
  assert.equal(n.entries[0].body,old.body);
  assert.deepEqual(n.legacyVersions,old.versions);
  assert.deepEqual(n.versions,old.versions);
  for(const k of ['id','title','imageId','createdAt','updatedAt','kind','type','custom']) assert.deepEqual(n[k],old[k]);
  assert.deepEqual(migrateNote(n),n);
});
test('unknown legacy times stay unknown, never invented',()=>{
  const n=migrateNote({id:'x',versions:[{body:'存量快照'}]});
  assert.equal(n.entries[0].createdAt,null);
  assert.equal(n.entries[0].body,'存量快照');
});
test('create and consecutive appends are independent and monotonically ordered',()=>{
  let n=applyOperation(null,op('create','first',{body:'首次'}),100);
  n=applyOperation(n,op('append','second',{body:'第二次'}),100);
  n=applyOperation(n,op('append','third',{body:'第三次'}),50);
  assert.deepEqual(n.entries.map(e=>e.body),['首次','第二次','第三次']);
  assert.deepEqual(n.entries.map(e=>e.createdAt),[100,101,102]);
  assert.equal(n.body,'首次\n\n第二次\n\n第三次');
  assert.deepEqual(orderedEntries(n),n.entries);
});
test('ordinary new records keep no inferred title; same titles do not merge their data',()=>{
  const first=applyOperation(null,op('create','first',{body:'雨停以后\n车站仍然潮湿',note:{title:'',kind:'inspiration'}}),100);
  const second=applyOperation(null,op('create','second',{noteId:'n2',body:'雨停以后\n另一段正文',note:{title:'',kind:'essay'}}),200);
  assert.equal(first.title,'');
  assert.equal(second.title,'');
  assert.notEqual(first.id,second.id);
  assert.equal(first.body,'雨停以后\n车站仍然潮湿');
  assert.equal(second.body,'雨停以后\n另一段正文');
});
test('replaying a committed operation does not add a record',()=>{
  let n=applyOperation(null,op('create','one'),100);
  const append=op('append','retry');
  n=applyOperation(n,append,200);
  assert.deepEqual(applyOperation(n,append,300),n);
});
test('editing only touches target entry and keeps its initial time',()=>{
  let n=applyOperation(null,op('create','one'),100);
  n=applyOperation(n,op('append','two',{body:'续写'}),200);
  const before=structuredClone(n);
  n=applyOperation(n,op('edit','edit1',{entryId:'two',expectedRevision:0,body:'续写修订'}),300);
  assert.equal(n.entries.length,2);
  assert.deepEqual(n.entries[0],before.entries[0]);
  assert.equal(n.entries[1].createdAt,200);
  assert.equal(n.entries[1].revisions[0].body,'续写');
  assert.equal(before.entries[1].revisions.length,0);
});
test('restore retains the pre-restore version and can itself be restored',()=>{
  let n=applyOperation(null,op('create','one',{body:'原文',imageId:'photo'}),100);
  n=applyOperation(n,op('edit','edit1',{entryId:'one',expectedRevision:0,body:'修改'}),200);
  n=applyOperation(n,op('restore','restore1',{entryId:'one',expectedRevision:1,revisionId:'edit1'}),300);
  assert.equal(n.entries[0].body,'原文');
  assert.equal(n.entries[0].imageId,'photo');
  assert.equal(n.entries[0].revisions.at(-1).body,'修改');
  n=applyOperation(n,op('restore','restore2',{entryId:'one',expectedRevision:2,revisionId:'restore1'}),400);
  assert.equal(n.entries[0].body,'修改');
  assert.equal(n.entries[0].revisions.length,3);
});
test('stale edits fail without changing entries or history',()=>{
  let n=applyOperation(null,op('create','one'),100);
  n=applyOperation(n,op('edit','e1',{entryId:'one',expectedRevision:0,body:'新版'}),200);
  const before=structuredClone(n);
  assert.throws(()=>applyOperation(n,op('edit','e2',{entryId:'one',expectedRevision:0})),/另一处更新/);
  assert.deepEqual(n,before);
});
test('empty appends fail, image-only records work, legacy remains after edits',()=>{
  assert.throws(()=>applyOperation(null,op('create','a',{body:'  '})),/请先写下/);
  assert.equal(applyOperation(null,op('create','a',{body:'',imageId:'i'})).entries[0].imageId,'i');
  const n=applyOperation(old,op('edit','e',{noteId:'old',entryId:'old:initial',expectedRevision:0,body:'改后'}));
  assert.deepEqual(n.legacyVersions,old.versions);
  assert.equal(n.entries[0].revisions[0].body,old.body);
});
