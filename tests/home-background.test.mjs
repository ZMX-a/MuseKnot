import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBackground, validateBackground, BACKGROUND_KEY } from '../src/home-background.js';

const png = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], {type:'image/png'});
test('background validation rejects unsupported, empty and oversized uploads', () => {
  assert.throws(() => validateBackground(new Blob(['<svg/>'],{type:'image/svg+xml'})), /PNG/);
  assert.throws(() => validateBackground(new Blob([],{type:'image/png'})), /8 MB/);
  assert.throws(() => validateBackground({type:'image/png',size:8*1024*1024+1}), /8 MB/);
  validateBackground(png);
});
test('saving a background writes private images and settings without touching notes', async () => {
  const writes=[];
  const id=await saveBackground(png,'a',{
    putImage:async (...args)=>writes.push(['image',...args]),
    setMeta:async (...args)=>writes.push(['meta',...args]),
  },()=> 'a');
  assert.deepEqual(writes,[['image',id,png],['meta',BACKGROUND_KEY,{imageId:id},'a']]);
});
test('account switches stop old background operations before settings can be written', async () => {
  let owner='a',metaWrites=0,uploads=0;
  const repository={putImage:async()=>{uploads++;owner='b';},setMeta:async()=>metaWrites++};
  await assert.rejects(saveBackground(png,'a',repository,()=>owner), /账号已切换/);
  assert.equal(metaWrites,0);
  assert.equal(uploads,1);
  await assert.rejects(saveBackground(png,'a',repository,()=>owner), /账号已切换/);
  assert.equal(uploads,1);
});
test('upload failure leaves the previous background setting intact', async () => {
  await assert.rejects(saveBackground(png,'a',{
    putImage:async()=>{throw new Error('network unavailable');},
    setMeta:async()=>assert.fail('settings must not be overwritten'),
  },()=> 'a'), /network unavailable/);
});
