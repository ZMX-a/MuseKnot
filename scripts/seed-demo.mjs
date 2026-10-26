// Optional synthetic demo. Only runs against a local development server.
const origin=new URL(process.env.MUSEKNOT_ORIGIN||'http://127.0.0.1:4173');
if(process.env.NODE_ENV!=='development'||origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Demo seeding is limited to local development.');
const base=origin.origin+(process.env.MUSEKNOT_BASE_PATH||'')+'/api';
const account={email:'demo@example.test',password:'demo-only-password-2026'};
let cookie='',owner='';
async function call(path,method='GET',value){
 const headers={Origin:origin.origin,...(cookie?{Cookie:cookie,'X-MuseKnot-User':owner}:{}),...(value===undefined?{}:{'Content-Type':'application/json'})};
 const res=await fetch(base+path,{method,headers,body:value===undefined?undefined:JSON.stringify(value)});
 const data=await res.json();if(!res.ok){const error=Error(data.error||'Demo request failed');error.status=res.status;throw error;}
 if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];if(data.user)owner=data.user.id;return data;
}
try{await call('/auth/login','POST',account);}catch(error){if(error.status!==401)throw error;await call('/auth/register','POST',{...account,invite:process.env.MUSEKNOT_INVITE_CODE});}
const notes=[
 {id:'demo-river',title:'河边的一个想法',kind:'inspiration',body:'走到桥边时，我想到一个关于重逢的故事。\n\n先留下这一刻，再慢慢续写。'},
 {id:'demo-letter',title:'写给未来的自己',kind:'essay',body:'不必急着把故事写完。\n\n把今天真正想说的话留在这里。'},
 {id:'demo-character',title:'旅人 · 岚',kind:'oc',body:'带着一册空白笔记走过山谷的人。喜欢收集路上遇见的故事。'}
];
for(const note of notes){
 if((await call('/notes')).some(item=>item.id===note.id))continue;
 await call('/notes/'+note.id+'/operation','POST',{type:'create',noteId:note.id,operationId:note.id+'-first',body:note.body,note:{title:note.title,kind:note.kind,type:'knot'}});
}
await call('/notes/demo-river/operation','POST',{type:'append',noteId:'demo-river',operationId:'demo-river-append',body:'第二次来到这里，我发现主角已经准备好出发了。'});
const threads=await call('/meta/mk-idea-threads');
if(!(threads.value||[]).some(thread=>thread.id==='demo-thread'))await call('/meta/mk-idea-threads','PUT',[...(threads.value||[]),{id:'demo-thread',name:'沿着河流的故事',noteIds:['demo-river','demo-letter','demo-character'],createdAt:1,updatedAt:1}]);
console.log('Synthetic demo ready. Local-only account: '+account.email+' / '+account.password);
