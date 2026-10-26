import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInvitation,captureInvitation,invitationLink} from '../src/account-flow.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RecoveryStep,PasswordField} from '../src/account-ui.js';
test('invitation links round trip special characters and remove secrets from address',()=>{
 const link=invitationLink('https://example.test/museknot/?old=1','sample +&邀请');
 assert.equal(new URL(link).search,'');
 assert.equal(readInvitation(link).invite,'sample +&邀请');
 assert.equal(readInvitation(link).cleanUrl,'/museknot/');
 let replaced;
 const location=new URL(link);
 assert.equal(captureInvitation(location,{state:{keep:1},replaceState(...args){replaced=args;}}),'sample +&邀请');
 assert.deepEqual(replaced,[{keep:1},'','/museknot/']);
});
test('legacy query links clean up while preserving other address state',()=>{
 assert.deepEqual(readInvitation('https://example.test/museknot/?invite=sample&view=notes#section'),{invite:'sample',cleanUrl:'/museknot/?view=notes#section'});
 assert.equal(readInvitation('https://example.test/?invite=old#invite=new').invite,'new');
 for(const suffix of ['#invite=a&invite=b','#invite=%00bad','#invite='+ 'x'.repeat(513),'?invite=']) assert.equal(readInvitation('https://example.test/'+suffix).invite,'');
 assert.throws(()=>invitationLink('javascript:alert(1)','sample'));
});
test('recovery is optional with clear later setup and one-time code guidance',()=>{
 const markup=renderToStaticMarkup(React.createElement(RecoveryStep,{code:'synthetic-code',email:'a@example.test',reason:'register',onContinue(){}}));
 assert.ok(markup.includes('开始记录'));
 assert.ok(markup.includes('设置找回方式'));
 assert.ok(markup.includes('事先保存'));
 assert.ok(!markup.includes('<details open'));
 assert.ok(markup.includes('保存到文件'));
 const password=renderToStaticMarkup(React.createElement(PasswordField,{}));
 assert.ok(password.includes('minLength="12"'));
 assert.ok(password.includes('显示密码'));
 assert.ok(password.includes('new-password'));
});
