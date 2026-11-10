'use strict';
const assert=require('node:assert/strict');
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Local demo emulators required');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright');
const admin=require('../functions/node_modules/firebase-admin');
const {getFirestore}=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'))('firebase-admin/firestore');
admin.initializeApp({projectId:'demo-rocketfix-360'});const db=getFirestore(admin.app(),'rocketfix360database');
(async()=>{
 for(const [name,staff] of [['missing',null],['inactive',{role:'owner',active:false}],['invalid-role',{role:'unexpected',active:true}]]){
  const uid='auth-check-'+name;try{await admin.auth().deleteUser(uid);}catch(error){if(error.code!=='auth/user-not-found')throw error;}await admin.auth().createUser({uid,email:name+'@auth-check.invalid',password:'Local-Auth-Test-2026!'});if(staff)await db.doc('staff/'+uid).set({name,...staff});
 }
 const browser=await chromium.launch({headless:true,executablePath:process.env.RF_BROWSER_EXECUTABLE});
 try{
  for(const name of ['owner','sales','missing','inactive','invalid-role']){
   const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
   let accessCalls=0;page.on('request',r=>{if(r.url().endsWith('/myAccess'))accessCalls++;});
   await page.goto('http://127.0.0.1:5050');await page.locator('#firebaseLoginForm').waitFor({state:'visible'});assert.equal(accessCalls,0);
   assert.equal(await page.locator('form#firebaseLoginForm').count(),1);assert.equal(await page.locator('[id^="rfDevice"]').count(),0);
   const permitted=['owner','sales'].includes(name);
   if(name==='owner'){await page.locator('#loginEmail').fill('owner@rocketfix.local');await page.locator('#loginPassword').fill('Incorrect-Local-Password');await page.locator('#loginSubmit').click();await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('incorrect'));assert.equal(await page.locator('#firebaseLogin').isVisible(),true);}
   await page.locator('#loginEmail').fill(permitted?name+'@rocketfix.local':name+'@auth-check.invalid');await page.locator('#loginPassword').fill(permitted?'Rocketfix-Staging-2026!':'Local-Auth-Test-2026!');await page.locator('#loginPassword').press('Enter');
   if(permitted){
    await page.locator('#firebaseLogin').waitFor({state:'hidden'});assert.ok(accessCalls>0);assert.equal(await page.locator('[data-tab="settings"]').isVisible(),name==='owner');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#employeeBadge').click();await page.locator('#firebaseLogin').waitFor({state:'visible'});
   }else{await page.waitForFunction(()=>document.getElementById('loginError').textContent.includes('Access denied'));assert.equal(await page.locator('#firebaseLogin').isVisible(),true);assert.equal(await page.evaluate(()=>posAuthorized),false);if(name==='inactive'){await db.doc('staff/auth-check-inactive').update({active:true});await page.locator('#loginPassword').fill('Local-Auth-Test-2026!');await page.locator('#loginSubmit').click();await page.locator('#firebaseLogin').waitFor({state:'hidden'});}}
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: signed-out form; invalid password rejection; Firebase Owner/Sales login and sign-out; missing, inactive and invalid-role staff denied; no legacy device controls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>admin.app().delete());
