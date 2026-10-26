import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('worker never intercepts API, image, mutation or outside-scope requests',async()=>{
 let handler;let fetched=0;
 vm.runInNewContext(readFileSync('sw.js','utf8'),{self:{registration:{scope:'https://example.test/museknot/'},addEventListener(type,fn){assert.equal(type,'fetch');handler=fn;}},URL,Response,fetch:async()=>{fetched++;throw Error('offline');}});
 for(const [path,mode,method] of [['api/notes','cors','GET'],['api/auth/me','cors','GET'],['api/images/private','cors','GET'],['','navigate','POST'],['other','navigate','GET']]){
  handler({request:{url:'https://example.test/museknot/'+path,mode,method},respondWith(){assert.fail('private or non-navigation request intercepted');}});
 }
 let response;
 handler({request:{url:'https://example.test/museknot/',mode:'navigate',method:'GET'},respondWith(promise){response=promise;}});
 const offline=await response;assert.equal(fetched,1);assert.equal(offline.status,503);assert.equal(offline.headers.get('cache-control'),'no-store');assert.match(await offline.text(),/需要联网/);
});
test('manifest installs beneath its own deployment path with real icons',()=>{
 const manifest=JSON.parse(readFileSync('manifest.webmanifest','utf8').replace(/^\uFEFF/,''));
 assert.equal(manifest.display,'standalone');
 for(const prefix of ['https://example.test/','https://example.test/museknot/']){
  assert.equal(new URL(manifest.start_url,prefix).href,prefix);assert.equal(new URL(manifest.scope,prefix).href,prefix);
 }
 for(const icon of manifest.icons){
  const bytes=readFileSync(icon.src);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const [width,height]=icon.sizes.split('x').map(Number);assert.equal(bytes.readUInt32BE(16),width);assert.equal(bytes.readUInt32BE(20),height);
 }
});
