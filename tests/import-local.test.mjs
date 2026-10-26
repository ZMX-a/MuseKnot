import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importLegacy, legacyBundle } from '../src/import-local.js';

const storage = entries => ({ length:entries.length, key:i=>entries[i][0], getItem:key=>entries.find(e=>e[0]===key)?.[1] });
const empty=storage([]);
function repository(image) {
  return {
    getAllInspirations:async()=>[{id:'note',entries:[{imageId:'current',revisions:[{imageId:'history'}]}]}],
    getMeta:async()=>[], getAllMeta:async()=>[{key:'draft',value:{imageId:'draft-image'}}],
    getImage:async id=>image(id), claimLegacy:async()=>{}, setMeta:async()=>{},
  };
}
test('imports entry, revision and draft images before committing records',async()=>{
  const calls=[];
  const repo=repository(()=>new Blob(['image'],{type:'image/png'}));
  await importLegacy(repo,async(path,options)=>{calls.push([path,options]);return {imported:1};},'owner',empty);
  assert.deepEqual(calls.map(c=>c[0]),['/images/current','/images/history','/images/draft-image','/import']);
  assert.ok(calls.every(c=>c[1].ownerId==='owner'));
});
test('missing or unsupported historical images abort before uploads or completion',async()=>{
  for(const image of [null,new Blob(['svg'],{type:'image/svg+xml'})]) {
    let writes=0;
    const repo=repository(id=>id==='history'?image:new Blob(['image'],{type:'image/png'}));
    repo.setMeta=async()=>{writes++;};
    await assert.rejects(importLegacy(repo,async()=>{writes++;},'owner',empty));
    assert.equal(writes,0);
  }
});
test('imports newer unowned checkpoints and excludes account-scoped drafts',async()=>{
  const repo=repository(()=>null);
  const old={key:'writing:new',body:'unsaved',savedAt:20,operationId:'operation'};
  const scoped={...old,body:'other account',ownerId:'other',savedAt:30};
  const bundle=await legacyBundle(repo,storage([
    ['museknot:writing:writing:new',JSON.stringify(old)],
    ['museknot:writing:other:writing:new',JSON.stringify(scoped)],
  ]));
  assert.equal(bundle.drafts.find(([key])=>key==='writing:new')[1].body,'unsaved');
});
