'use strict';
const assert=require('node:assert/strict');
if(process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.GCLOUD_PROJECT!=='demo-rocketfix-360')throw Error('Requires local demo Auth emulator');
const auth='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';
async function request(action,data){const r=await fetch(auth+action+'?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {ok:r.ok,data:await r.json()};}
(async()=>{
 const fixture={email:'smoke@rocketfix.local',password:'[REDACTED_SECRET]!',returnSecureToken:true};
 const create=await request('signUp',fixture);assert.ok(create.ok);assert.ok(create.data.idToken);
 const login=await request('signInWithPassword',fixture);assert.ok(login.ok);assert.equal(login.data.localId,create.data.localId);
 const bad=await request('signInWithPassword',{...fixture,password:'[REDACTED_SECRET]'});assert.equal(bad.ok,false);
 const html=await fetch('http://127.0.0.1:5050');assert.ok(html.ok);assert.match(await html.text(),/app.bundle.js/);
 const js=await fetch('http://127.0.0.1:5050/app.bundle.js');assert.ok(js.ok);assert.match(await js.text(),/connectAuthEmulator/);
 console.log('PASS: real local Auth signup, successful sign-in, rejected bad password, Hosting HTML and compiled client. Firestore/callables not exercised.');
})().catch(e=>{console.error(e);process.exitCode=1;});
