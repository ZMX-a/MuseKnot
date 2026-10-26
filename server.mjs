import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve, extname, sep } from 'node:path';
import { isIP } from 'node:net';
import { migrateNote, applyOperation } from './src/records.js';

const scrypt = promisify(scryptCallback);
const host=process.env.MUSEKNOT_HOST || '127.0.0.1';
const port=Number(process.env.PORT||4173);
const production=process.env.NODE_ENV==='production';
const origin=new URL(process.env.MUSEKNOT_ORIGIN || 'http://127.0.0.1:'+port);
const basePath=(process.env.MUSEKNOT_BASE_PATH || '').replace(/\/$/,'');
if(basePath && !/^\/[a-zA-Z0-9_-]+$/.test(basePath)) throw new Error('MUSEKNOT_BASE_PATH must be empty or a single path such as /museknot.');
if (production && (origin.protocol!=='https:' || !['127.0.0.1','::1'].includes(host))) throw new Error('Production requires an HTTPS MUSEKNOT_ORIGIN and a loopback application host.');
const root = resolve(process.cwd(), 'dist');
const dataDir = resolve(process.env.MUSEKNOT_DATA_DIR || './data');
await mkdir(dataDir, { recursive: true, mode:0o700 });
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Run npm run build:local before starting the server.');
const database = new DatabaseSync(resolve(dataDir, 'museknot.sqlite'));
database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
database.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, recovery_hash TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS images (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, mime TEXT NOT NULL, value BLOB NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS meta (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(user_id,key));`);
if (!database.prepare('PRAGMA table_info(users)').all().some(column=>column.name==='recovery_hash')) database.exec('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
const statements = {
  userByEmail: database.prepare('SELECT * FROM users WHERE email=?'),
  userBySession: database.prepare('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?'),
  note: database.prepare('SELECT value FROM notes WHERE user_id=? AND id=?'),
  allNotes: database.prepare('SELECT value FROM notes WHERE user_id=?'),
  meta: database.prepare('SELECT value FROM meta WHERE user_id=? AND key=?'),
  image: database.prepare('SELECT mime,value FROM images WHERE user_id=? AND id=?'),
};
const insertNote = database.prepare('INSERT INTO notes(user_id,id,value) VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET value=excluded.value');
const insertImage = database.prepare('INSERT INTO images(user_id,id,mime,value) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET mime=excluded.mime,value=excluded.value');
const insertMeta = database.prepare('INSERT INTO meta(user_id,key,value) VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value');
const cookieName = 'museknot_session';
const ttl = 30 * 24 * 60 * 60 * 1000;
const attempts = new Map();
const mimeTypes = { '.webmanifest':'application/manifest+json; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2' };
let activeKdf=0;
async function derivePassword(password,salt,cost) {
  if (typeof password!=='string' || password.length>1024) error(400,'密码格式不正确');
  if(activeKdf>=2) error(429,'登录请求较多，请稍后重试');
  activeKdf++;
  try { return await scrypt(password,salt,64,{N:cost,r:8,p:1,maxmem:256*1024*1024}); }
  finally { activeKdf--; }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(data));
}
function error(status, message) { const e = new Error(message); e.status = status; throw e; }
function transaction(work) {
  database.exec('BEGIN IMMEDIATE');
  try { const result = work(); database.exec('COMMIT'); return result; }
  catch (e) { database.exec('ROLLBACK'); throw e; }
}
function fixedEqual(a,b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left,right);
}
async function passwordHash(password) {
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt, 1 << 17);
  return 'scrypt:131072:' + salt.toString('hex') + ':' + key.toString('hex');
}
async function verifyPassword(password, stored) {
  const [algorithm, count, saltHex, keyHex] = String(stored).split(':');
  if (algorithm !== 'scrypt' || !['32768','131072'].includes(count) || !saltHex || !keyHex) return false;
  const key = await derivePassword(password, Buffer.from(saltHex,'hex'), Number(count));
  return fixedEqual(key,Buffer.from(keyHex,'hex'));
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function session(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return token && statements.userBySession.get(tokenHash(token),Date.now());
}
function setSession(res,userId) {
  database.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
  const token = randomBytes(32).toString('base64url');
  database.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token),userId,Date.now()+ttl);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', cookieName + '=' + token + '; Path='+basePath+'/; HttpOnly; SameSite=Strict; Max-Age=' + Math.floor(ttl/1000) + secure);
}
function expireSession(req,res) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
  res.setHeader('Set-Cookie', cookieName + '=; Path='+basePath+'/; HttpOnly; SameSite=Strict; Max-Age=0'+(production?'; Secure':''));
}
async function body(req,limit=2*1024*1024) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>limit) error(413,'内容过大'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function data(req,limit) {
  try { return JSON.parse((await body(req,limit)).toString('utf8')); }
  catch(e) { if(e.status) throw e; error(400,'请求格式错误'); }
}
function checkOrigin(req) {
  if (['GET','HEAD'].includes(req.method)) return;
  if (req.headers.origin!==origin.origin) error(403,'请求来源不允许');
}
function rateLimit(req) {
  let address=req.socket.remoteAddress || 'unknown';
  if(process.env.MUSEKNOT_TRUST_PROXY==='1' && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)) {
    const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
    if(isIP(forwarded)) address=forwarded;
  }
  const key = address, now=Date.now();
  if(attempts.size>5000) for(const [address,entries] of attempts) if(entries.every(t=>t<=now-15*60*1000)) attempts.delete(address);
  const previous = attempts.get(key) || [];
  const recent=previous.filter(t=>t>now-15*60*1000);
  if (recent.length>=10) error(429,'尝试次数过多，请稍后重试');
  recent.push(now); attempts.set(key,recent);
}
function requiredUser(req) {
  const user=session(req); if (!user) error(401,'请先登录');
  if(req.headers['x-museknot-user']!==user.id) error(428,'账号状态已变化，请重新登录后继续。');
  return user;
}
function noteValue(user,id) { const row=statements.note.get(user.id,id); return row ? JSON.parse(row.value) : null; }
function validId(id) { if (typeof id!=='string' || !/^[\w:-]{1,150}$/.test(id)) error(400,'无效的记录 ID'); return id; }
function object(value) { if(!value || typeof value!=='object' || Array.isArray(value)) error(400,'请求格式错误'); return value; }
async function objectData(req,limit) { return object(await data(req,limit)); }
function validateNote(note) {
  object(note); validId(note.id);
  for(const key of ['body','title','kind','mood','type']) if(note[key]!==undefined && typeof note[key]!=='string') error(400,'记录字段格式错误');
  if(note.schemaVersion!==undefined && note.schemaVersion!==2) error(400,'不支持的记录版本');
  if((note.schemaVersion===2 || note.entries!==undefined) && !Array.isArray(note.entries)) error(400,'记录缺少段落');
  for(const entry of note.entries||[]) {
    object(entry); validId(entry.id);
    if(typeof entry.body!=='string' || !Number.isSafeInteger(entry.revision) || entry.revision<0 || !Array.isArray(entry.revisions)) error(400,'段落格式错误');
  }
}

async function api(req,res,url) {
  checkOrigin(req);
  const path=url.pathname;
  if (path === '/api/auth/me' && req.method==='GET') return json(res,200,{user:session(req)||null});
  if (path === '/api/auth/register' && req.method==='POST') {
    rateLimit(req);
    const { email, password, invite }=await objectData(req,16*1024);
    if (!process.env.MUSEKNOT_INVITE_CODE || !fixedEqual(String(invite||''),process.env.MUSEKNOT_INVITE_CODE)) error(403,'邀请码无效');
    const normalized=String(email||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length>254 || typeof password!=='string' || password.length<12 || password.length>1024) error(400,'邮箱或密码格式不正确，密码至少 12 位');
    if (statements.userByEmail.get(normalized)) error(409,'该邮箱已注册');
    const id=randomBytes(16).toString('hex');
    const recoveryCode=randomBytes(24).toString('base64url');
    const hash=await passwordHash(password);
    if(statements.userByEmail.get(normalized)) error(409,'该邮箱已注册');
    database.prepare('INSERT INTO users(id,email,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)').run(id,normalized,hash,tokenHash(recoveryCode),Date.now());
    setSession(res,id); return json(res,201,{user:{id,email:normalized},recoveryCode});
  }
  if (path === '/api/auth/login' && req.method==='POST') {
    rateLimit(req);
    const {email,password}=await objectData(req,16*1024);
    const user=statements.userByEmail.get(String(email||'').trim().toLowerCase());
    if (!user || !(await verifyPassword(String(password||''),user.password_hash))) error(401,'邮箱或密码错误');
    if(statements.userByEmail.get(user.email)?.password_hash!==user.password_hash) error(401,'密码已变化，请重试');
    setSession(res,user.id); return json(res,200,{user:{id:user.id,email:user.email}});
  }
  if (path === '/api/auth/reset' && req.method==='POST') {
    rateLimit(req);
    const {email,recoveryCode,password}=await objectData(req,16*1024);
    const user=statements.userByEmail.get(String(email||'').trim().toLowerCase());
    if (!user?.recovery_hash || !fixedEqual(tokenHash(String(recoveryCode||'')),user.recovery_hash)) error(401,'邮箱或恢复码错误');
    if (typeof password!=='string' || password.length<12 || password.length>1024) error(400,'新密码至少 12 位');
    const newRecovery=randomBytes(24).toString('base64url');
    const hash=await passwordHash(password);
    transaction(()=>{
      const changed=database.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(hash,tokenHash(newRecovery),user.id,user.recovery_hash);
      if(changed.changes!==1) error(401,'恢复码已经使用或失效');
      database.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    });
    setSession(res,user.id);
    return json(res,200,{user:{id:user.id,email:user.email},recoveryCode:newRecovery});
  }
  const user=requiredUser(req);
  if (path === '/api/auth/logout' && req.method==='POST') { expireSession(req,res); return json(res,200,{ok:true}); }
  if (path === '/api/auth/recovery' && req.method==='POST') {
    rateLimit(req);
    const {password}=await objectData(req,16*1024);
    const account=statements.userByEmail.get(user.email);
    if (!(await verifyPassword(String(password||''),account.password_hash))) error(403,'密码错误');
    requiredUser(req);
    if(statements.userByEmail.get(user.email)?.password_hash!==account.password_hash) error(401,'密码已变化，请重试');
    const recoveryCode=randomBytes(24).toString('base64url');
    database.prepare('UPDATE users SET recovery_hash=? WHERE id=?').run(tokenHash(recoveryCode),user.id);
    return json(res,200,{recoveryCode});
  }
  if (path==='/api/notes' && req.method==='GET') return json(res,200,statements.allNotes.all(user.id).map(x=>JSON.parse(x.value)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)));
  if (path==='/api/notes' && req.method==='POST') {
    const note=await objectData(req);
    validateNote(note);
    const saved=transaction(()=>{
      const old=noteValue(user,note.id);
      if (old && note.body!==old.body) error(409,'正文更新须使用段落编辑');
      const value=old ? {...old,kind:note.kind??old.kind,title:note.title??old.title,mood:note.mood??old.mood,updatedAt:note.updatedAt??old.updatedAt} : migrateNote(note);
      insertNote.run(user.id,note.id,JSON.stringify(value)); return value;
    });
    return json(res,200,saved);
  }
  if (path==='/api/import' && req.method==='POST') {
    const imported=await objectData(req,20*1024*1024);
    if (!Array.isArray(imported.notes) || imported.notes.length>10000 || !Array.isArray(imported.threads) || (imported.drafts!==undefined && !Array.isArray(imported.drafts))) error(400,'导入数据格式错误');
    const count=transaction(()=>{
      let added=0;
      for(const note of imported.notes) {
        validateNote(note);
        if (!statements.note.get(user.id,note.id)) {
          insertNote.run(user.id,note.id,JSON.stringify(migrateNote(note))); added++;
        }
      }
      const oldThreads=JSON.parse(statements.meta.get(user.id,'mk-idea-threads')?.value||'[]');
      if(!Array.isArray(oldThreads)) error(409,'已有脉络数据格式异常，请先导出检查');
      const ids=new Set(oldThreads.map(t=>t.id));
      for(const thread of imported.threads) { validId(thread?.id); if(!ids.has(thread.id)) {oldThreads.push(thread);ids.add(thread.id);} }
      insertMeta.run(user.id,'mk-idea-threads',JSON.stringify(oldThreads));
      for(const entry of imported.drafts||[]) {
        if(!Array.isArray(entry) || typeof entry[0]!=='string' || !/^(writing:|draft($|:))/.test(entry[0])) error(400,'草稿格式错误');
        if(!statements.meta.get(user.id,entry[0])) insertMeta.run(user.id,entry[0],JSON.stringify(entry[1]));
      }
      return added;
    });
    return json(res,200,{imported:count});
  }
  const operation=path.match(/^\/api\/notes\/([^/]+)\/operation$/);
  if (operation && req.method==='POST') {
    const id=validId(decodeURIComponent(operation[1]));
    const op=await objectData(req);
    if (op.noteId!==id) error(400,'记录 ID 不一致');
    validId(op.operationId);
    if(op.body!==undefined && typeof op.body!=='string') error(400,'正文格式错误');
    const saved=transaction(()=>{
      const current=noteValue(user,id);
      let value;
      try { value=applyOperation(current?migrateNote(current):null,op); }
      catch(e) { error(409,e.message || '记录版本冲突'); }
      insertNote.run(user.id,id,JSON.stringify(value));
      return value;
    });
    return json(res,200,saved);
  }
  const notePath=path.match(/^\/api\/notes\/([^/]+)$/);
  if (notePath) {
    const id=validId(decodeURIComponent(notePath[1]));
    if(req.method==='GET') { const value=noteValue(user,id); if(!value) error(404,'记录不存在'); return json(res,200,value); }
    if(req.method==='DELETE') { database.prepare('DELETE FROM notes WHERE user_id=? AND id=?').run(user.id,id); return json(res,200,{ok:true}); }
  }
  if(path==='/api/notes' && req.method==='DELETE') {
    transaction(()=>{ for(const table of ['notes','images','meta']) database.prepare('DELETE FROM '+table+' WHERE user_id=?').run(user.id); });
    return json(res,200,{ok:true});
  }
  const metaPath=path.match(/^\/api\/meta\/(.+)$/);
  if(metaPath) {
    const key=decodeURIComponent(metaPath[1]);
    if(key.length>250) error(400,'元数据名称过长');
    if(req.method==='GET') { const value=statements.meta.get(user.id,key); return json(res,200,{value:value?JSON.parse(value.value):null}); }
    if(req.method==='PUT') { const value=await data(req); insertMeta.run(user.id,key,JSON.stringify(value)); return json(res,200,{ok:true}); }
  }
  const imagePath=path.match(/^\/api\/images\/([^/]+)$/);
  if(imagePath) {
    const id=validId(decodeURIComponent(imagePath[1]));
    if(req.method==='GET') {
      const image=statements.image.get(user.id,id); if(!image) error(404,'图片不存在');
      res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}); return res.end(image.value);
    }
    if(req.method==='PUT') {
      const mime=String(req.headers['content-type']||'');
      if(!/^image\/(png|jpeg|webp|gif)$/.test(mime)) error(400,'图片格式不支持');
      const bytes=await body(req,10*1024*1024);
      const magic={ 'image/png':()=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
        'image/jpeg':()=>bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
        'image/gif':()=>['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()),
        'image/webp':()=>bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP' };
      if(!magic[mime]()) error(400,'图片内容与格式不一致');
      const previous=statements.image.get(user.id,id);
      if(previous && (previous.mime!==mime || !Buffer.from(previous.value).equals(bytes))) error(409,'图片已存在，请使用新的图片 ID');
      insertImage.run(user.id,id,mime,bytes); return json(res,200,{ok:true});
    }
    if(req.method==='DELETE') { database.prepare('DELETE FROM images WHERE user_id=? AND id=?').run(user.id,id); return json(res,200,{ok:true}); }
  }
  error(404,'接口不存在');
}

async function staticFile(req,res,url) {
  if(!['GET','HEAD'].includes(req.method)) error(405,'请求方式不支持');
  const pathname=decodeURIComponent(url.pathname);
  const full=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(full!==root && !full.startsWith(root+sep)) error(403,'路径不允许');
  let bytes;
  try { bytes=await readFile(full); } catch { error(404,'页面不存在'); }
  res.writeHead(200,{'Content-Type':mimeTypes[extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':(extname(full)==='.html'||extname(full)==='.webmanifest'||pathname==='/sw.js')?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD') res.end(); else res.end(bytes);
}
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!==origin.host) error(403,'网站地址不允许');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const url=new URL(req.url,'http://localhost');
    if(basePath) {
      if(url.pathname==='/' || url.pathname===basePath) { res.writeHead(302,{Location:basePath+'/'}); return res.end(); }
      if(!url.pathname.startsWith(basePath+'/')) error(404,'页面不存在');
      url.pathname=url.pathname.slice(basePath.length);
    }
    if(url.pathname.startsWith('/api/')) await api(req,res,url);
    else await staticFile(req,res,url);
  } catch(e) { if(!res.headersSent) json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用'}); else res.end(); if(!e.status) console.error(e); }
});
server.listen(port,host,()=>console.log('MuseKnot: http://'+host+':'+port));
