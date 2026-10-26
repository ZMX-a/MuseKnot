import {createServer as createPortProbe} from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, readdir, copyFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, sep } from 'node:path';

test('cloud accounts isolate notes, images and imports', async () => {
  const workRoot=resolve('work','test-cloud');
  await mkdir(workRoot,{recursive:true});
  const dataDir=await mkdtemp(resolve(workRoot,'run-'));
  const probe=createPortProbe();
  const port=await new Promise((resolve,reject)=>{probe.on('error',reject);probe.listen(0,'127.0.0.1',()=>{const value=probe.address().port;probe.close(()=>resolve(value));});});
  const origin='http://127.0.0.1:'+port;
  const base=origin+'/museknot';
  const child=spawn(process.execPath,['server.mjs'],{
    cwd:process.cwd(),env:{...process.env,NODE_ENV:'test',PORT:String(port),MUSEKNOT_ORIGIN:origin,MUSEKNOT_BASE_PATH:'/museknot',MUSEKNOT_HOST:'127.0.0.1',MUSEKNOT_DATA_DIR:dataDir,MUSEKNOT_INVITE_CODE:'test-only-invite'},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  child.stdout.on('data',chunk=>output+=chunk.toString());
  child.stderr.on('data',chunk=>output+=chunk.toString());
  const owners=new Map();
  async function call(path,method='GET',value,cookie='',contentType='application/json') {
    const headers={Origin:origin};
    if(cookie) {headers.Cookie=cookie;headers['X-MuseKnot-User']=owners.get(cookie)||'';}
    if(value!==undefined)headers['Content-Type']=contentType;
    const response=await fetch(base+'/api'+path,{method,headers,body:value===undefined?undefined:contentType==='application/json'?JSON.stringify(value):value});
    let body;
    if(response.headers.get('content-type')?.includes('application/json')) body=await response.json();
    else body=await response.arrayBuffer();
    const newCookie=response.headers.get('set-cookie')?.split(';')[0];
    if(newCookie && body?.user?.id)owners.set(newCookie,body.user.id);
    return {status:response.status,body,cookie:newCookie,setCookie:response.headers.get("set-cookie")};
  }
  try {
    let ready=false;
    for(let i=0;i<80;i++) {
      if(child.exitCode!==null) throw new Error('Server exited: '+output);
      try { const response=await fetch(base+'/api/auth/me'); if(response.ok){ready=true;break;} } catch {}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,'server started: '+output);
    const root=await fetch(origin+'/',{redirect:'manual'});
    assert.equal(root.headers.get('location'),'/museknot/');
    const page=await fetch(base+'/');
    assert.equal(page.status,200);
    assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.equal((await fetch(base+'/theme.js')).status,200);
    const manifestResponse=await fetch(base+'/manifest.webmanifest');
    assert.equal(manifestResponse.status,200);
    assert.match(manifestResponse.headers.get('content-type'),/application\/manifest\+json/);
    assert.equal(manifestResponse.headers.get('cache-control'),'no-cache');
    const manifest=await manifestResponse.json();
    assert.equal(manifest.scope,'./');
    const workerResponse=await fetch(base+'/sw.js');
    assert.equal(workerResponse.status,200);
    assert.equal(workerResponse.headers.get('cache-control'),'no-cache');
    assert.equal((await call('/notes')).status,401);
    assert.equal((await call('/auth/register','POST',{email:'a@example.com',password:'long test password',invite:'wrong'})).status,403);
    const a=await call('/auth/register','POST',{email:'a@example.com',password:'long test password',invite:'test-only-invite'});
    const b=await call('/auth/register','POST',{email:'b@example.com',password:'long test password',invite:'test-only-invite'});
    assert.equal(a.status,201); assert.equal(b.status,201);
    assert.notEqual(a.body.user.id,b.body.user.id);
    assert.ok(a.body.recoveryCode.length>=30);
    assert.match(a.setCookie,/HttpOnly/i);
    assert.match(a.setCookie,/SameSite=Strict/i);
    assert.match(a.setCookie,/Max-Age=2592000/i);
    assert.equal((await call('/auth/me','GET',undefined,a.cookie)).body.user.id,a.body.user.id,'cookie restores login without credentials');
    const login=await call('/auth/login','POST',{email:'b@example.com',password:'long test password'});
    assert.equal(login.status,200,'ordinary login needs neither invitation nor recovery code');
    const mismatch=await fetch(base+'/api/notes',{method:'POST',headers:{Origin:origin,Cookie:b.cookie,'X-MuseKnot-User':a.body.user.id,'Content-Type':'application/json'},body:JSON.stringify({id:'cross-tab',body:'must not save'})});
    assert.equal(mismatch.status,428);
    assert.equal((await call('/notes','POST',null,a.cookie)).status,400);
    assert.equal((await call('/notes','POST',{id:'bad',entries:{}},a.cookie)).status,400);
    await call('/meta/writing%3Anew','PUT',{body:'private draft'},a.cookie);
    assert.equal((await call('/meta/writing%3Anew','GET',undefined,b.cookie)).body.value,null);
    const note={id:'note-1',title:'秘密',body:'只有 A 可以看',createdAt:10,updatedAt:10};
    assert.equal((await call('/notes','POST',note,a.cookie)).status,200);
    assert.equal((await call('/notes', 'GET',undefined,a.cookie)).body.length,1);
    const beforeName=(await call('/notes/note-1','GET',undefined,a.cookie)).body;
    const named=await call('/notes','POST',{...beforeName,title:'自定义名称',entries:[],legacyVersions:[]},a.cookie);
    assert.equal(named.status,200);assert.equal(named.body.title,'自定义名称');
    assert.deepEqual({...named.body,title:beforeName.title},beforeName,'metadata save preserves the original entries and history regardless of supplied snapshots');

    assert.deepEqual((await call('/notes','GET',undefined,b.cookie)).body,[]);
    assert.equal((await call('/notes/note-1','GET',undefined,b.cookie)).status,404);
    const beforeSorting = (await call('/notes','GET',undefined,a.cookie)).body;
    const orderedThreads = [{ id:'order-test', name:'测试脉络', noteIds:['unavailable-id','note-1'], createdAt:1, updatedAt:2 }];
    assert.equal((await call('/meta/mk-idea-threads','PUT',orderedThreads,a.cookie)).status,200);
    assert.deepEqual((await call('/meta/mk-idea-threads','GET',undefined,a.cookie)).body.value,orderedThreads);
    assert.deepEqual((await call('/notes','GET',undefined,a.cookie)).body,beforeSorting,'sorting only changes thread metadata, never records or histories');
    assert.equal((await call('/meta/mk-idea-threads','GET',undefined,b.cookie)).body.value,null,'thread order remains account-private');
    assert.equal((await call('/notes/note-1','DELETE',undefined,b.cookie)).status,200);
    assert.equal((await call('/notes','GET',undefined,a.cookie)).body.length,1);
    const png=new Uint8Array([137,80,78,71,13,10,26,10]);
    assert.equal((await call('/images/pic-1','PUT',png,a.cookie,'image/png')).status,200);
    assert.equal((await call('/images/pic-1','GET',undefined,b.cookie)).status,404);
    assert.equal((await call('/images/bad','PUT',Buffer.from('not an image'),a.cookie,'image/png')).status,400);
    await call('/meta/mk-idea-threads','PUT',[{id:'existing-thread'}],a.cookie);
    const imported={notes:[{id:'legacy',body:'旧记录',createdAt:2,updatedAt:3}],threads:[{id:'legacy-thread'}],drafts:[['draft',{body:'old draft'}]]};
    assert.equal((await call('/import','POST',imported,a.cookie)).body.imported,1);
    assert.equal((await call('/import','POST',imported,a.cookie)).body.imported,0);
    assert.equal((await call('/meta/mk-idea-threads','GET',undefined,a.cookie)).body.value.length,2);
    assert.equal((await call('/meta/draft','GET',undefined,a.cookie)).body.value.body,'old draft');
    assert.equal((await call('/notes','GET',undefined,b.cookie)).body.length,0);
    const csrf=await fetch(base+'/api/notes',{method:'POST',headers:{Cookie:a.cookie,'Content-Type':'application/json'},body:JSON.stringify(note)});
    assert.equal(csrf.status,403);
    assert.equal((await call('/auth/logout','POST',{},a.cookie)).status,200);
    assert.equal((await call('/notes','GET',undefined,a.cookie)).status,401);
    const reset=await call('/auth/reset','POST',{email:'a@example.com',recoveryCode:a.body.recoveryCode,password:'another long password'});
    assert.equal(reset.status,200);
    assert.notEqual(reset.body.recoveryCode,a.body.recoveryCode);
    assert.equal((await call('/auth/login','POST',{email:'a@example.com',password:'long test password'})).status,401);
    assert.equal((await call('/notes','GET',undefined,reset.cookie)).body.length,2);
    assert.equal((await call('/auth/reset','POST',{email:'a@example.com',recoveryCode:a.body.recoveryCode,password:'third long password'})).status,401);
    const backupDir=resolve(dataDir,'backups');
    await promisify(execFile)(process.execPath,['scripts/backup.mjs'],{env:{...process.env,MUSEKNOT_DATA_DIR:dataDir,MUSEKNOT_BACKUP_DIR:backupDir}});
    const [backupName]=await readdir(backupDir);
    const restored=resolve(dataDir,'restore-check.sqlite');
    await copyFile(resolve(backupDir,backupName),restored);
    const restoredDb=new DatabaseSync(restored,{readOnly:true});
    try {
      assert.equal(restoredDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id=?').get(a.body.user.id).n,2);
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id=?').get(b.body.user.id).n,0);
      assert.equal(restoredDb.prepare('SELECT COUNT(*) AS n FROM images WHERE user_id=?').get(a.body.user.id).n,1);
    } finally {restoredDb.close();}
  } finally {
    child.kill();
    if(child.exitCode===null && child.signalCode===null) await new Promise(resolve=>child.once('exit',resolve));
    if(dataDir.startsWith(workRoot+sep)) await rm(dataDir,{recursive:true,force:true});
  }
});
