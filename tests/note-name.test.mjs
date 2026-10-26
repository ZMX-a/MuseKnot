import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeName,renameSavedNote} from '../src/note-name.js';
import {applyOperation} from '../src/records.js';
import {notePreview} from '../src/note-preview.js';
import {exportSections} from '../src/long-image-model.js';
const options=repository=>({repository,owner:'test-owner',getOwner:()=> 'test-owner',now:()=>500});
test('custom name is optional on create and persists through subsequent ordinary appends',()=>{
 let note=applyOperation(null,{type:'create',noteId:'n',operationId:'first',body:'原始正文',note:{title:'自己的名称',kind:'inspiration'}},100);
 note=applyOperation(note,{type:'append',noteId:'n',operationId:'next',body:'新的续写',title:'过时的草稿名称'},200);
 assert.equal(note.title,'自己的名称');assert.equal(notePreview(note).title,'自己的名称');
 assert.equal(exportSections([note])[0].title,'自己的名称');assert.equal(note.body,'原始正文\n\n新的续写');
});
test('rename uses current record and preserves entries, histories, pictures and original input',async()=>{
 const current={id:'n',title:'',body:'正文\n\n最新续写',createdAt:100,updatedAt:300,imageId:'pic',entries:[{id:'first',body:'正文',revisions:[{body:'原稿'}]},{id:'new',body:'最新续写'}],legacyVersions:[{body:'旧稿'}],operationIds:['first','new'],sourceIds:['source']};
 const before=structuredClone(current);let writes=0;
 const saved=await renameSavedNote('n','  自定义名称  ','',options({getInspiration:async()=>current,saveInspiration:async value=>{writes++;return value;}}));
 assert.equal(writes,1);assert.equal(saved.title,'自定义名称');assert.equal(saved.updatedAt,500);
 assert.deepEqual({...saved,title:before.title,updatedAt:before.updatedAt},before);assert.deepEqual(current,before);
});
test('clearing a name keeps all content; unchanged name does not write',async()=>{
 let writes=0;const current={id:'n',title:'已有名称',body:'正文',updatedAt:100};
 const repo={getInspiration:async()=>current,saveInspiration:async note=>{writes++;return note;}};
 assert.equal((await renameSavedNote('n','已有名称','已有名称',options(repo))).title,'已有名称');assert.equal(writes,0);
 assert.equal((await renameSavedNote('n','   ','已有名称',options(repo))).title,'');assert.equal(writes,1);
});
test('concurrent name changes and account switches stop without writing',async()=>{
 let writes=0;const repo={getInspiration:async()=>({id:'n',title:'别处已改名',body:'保留'}),saveInspiration:async()=>{writes++;}};
 await assert.rejects(renameSavedNote('n','输入名称','旧名称',options(repo)),/另一处修改/);
 await assert.rejects(renameSavedNote('n','输入名称','旧名称',{...options(repo),getOwner:()=> 'other-owner'}),/账号已变化/);
 assert.equal(writes,0);assert.throws(()=>normalizeName('x'.repeat(81)),/80/);assert.throws(()=>normalizeName('第一行\n第二行'),/一行/);
});
