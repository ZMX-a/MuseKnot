import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, setCurrentUser } from '../src/cloud.js';

test('requests bind account identity, preserve the subpath, and reject stale responses',async()=>{
  const original={fetch:globalThis.fetch,document:globalThis.document,window:globalThis.window};
  try {
    globalThis.document={baseURI:'https://example.test/museknot/'};
    const events=[];
    globalThis.window={dispatchEvent:event=>events.push(event.type)};
    setCurrentUser({id:'owner-a'});
    let complete;
    globalThis.fetch=(url,options)=>{
      assert.equal(String(url),'https://example.test/museknot/api/notes');
      assert.equal(options.headers['X-MuseKnot-User'],'owner-a');
      return new Promise(resolve=>{complete=resolve;});
    };
    const pending=request('/notes');
    setCurrentUser({id:'owner-b'});
    complete(new Response('[]',{status:200}));
    await assert.rejects(pending,/账号已切换/);
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'账号已变化'}),{status:428});
    await assert.rejects(request('/notes'),/账号已变化/);
    assert.deepEqual(events,['museknot-session-lost']);
    setCurrentUser(null);
    await assert.rejects(request('/notes'),/请先登录/);
  } finally { Object.assign(globalThis,original);setCurrentUser(null); }
});
