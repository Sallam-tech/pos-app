import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{passwordInput,cookiesForRole}=require('../shared-login.cjs');
test('shared native cookie handoff keeps exact role/host and Secure HttpOnly Strict protections',()=>{
 const cookie='__Secure-pos-admin.session_token=private.signature; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600';
 const result=cookiesForRole([cookie],'ADMIN','https://localhost:4443');assert.equal(result[0].url,'https://localhost:4443/');assert.equal(result[0].value,'private.signature');assert(result[0].httpOnly&&result[0].secure);assert.equal(result[0].sameSite,'strict');
 for(const bad of [cookie.replace('Secure; ',''),cookie.replace('HttpOnly; ',''),cookie.replace('Strict','Lax'),cookie+'; Domain=localhost',cookie+'; Path=/',cookie.replace('Max-Age=3600','Max-Age=0'),cookie+'\r\nInjected: 1'])assert.throws(()=>cookiesForRole([bad],'ADMIN','https://localhost:4443'));
 assert.throws(()=>cookiesForRole([cookie],'SALESPERSON','https://127.0.0.1:4443'));assert.throws(()=>cookiesForRole([cookie],'ADMIN','https://127.0.0.1:4443'));assert.throws(()=>cookiesForRole([cookie,cookie],'ADMIN','https://localhost:4443'));assert.throws(()=>cookiesForRole([cookie],'ADMIN','http://localhost:4443'));
});
test('shared password envelope is bounded and supplies no role or origin selector',()=>{assert(passwordInput('Valid-demo-value'));for(const v of ['short','x'.repeat(129),{password:'Valid-demo-value',role:'ADMIN'},null])assert.equal(passwordInput(v),false);});
