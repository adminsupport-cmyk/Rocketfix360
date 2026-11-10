'use strict';
if(process.env.GCLOUD_PROJECT!=='demo-rocketfix-360'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Explicit local demo emulator variables required');
const admin=require('../functions/node_modules/firebase-admin');
admin.initializeApp({projectId:'demo-rocketfix-360'});
(async()=>{for(const role of ['owner','admin','sales','encoder','editor','production']){
 const uid='fixture-'+role,email=role+'@rocketfix.local';
 try{await admin.auth().getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;await admin.auth().createUser({uid,email,password:'Rocketfix-Staging-2026!'});}
 const ref=admin.firestore().doc('staff/'+uid);if(!(await ref.get()).exists)await ref.create({name:'Staging '+role,role,active:true});
 }if(process.argv.includes('--fixtures')){await admin.firestore().doc('stagingConfig/pricing').set({fixtureOnly:true,version:1,rates:{'Luzon|Small':{rate:50,days:'SYNTHETIC FIXTURE'}},custom:{}});}
 console.log('Local fixture accounts ready: owner@rocketfix.local / Rocketfix-Staging-2026!; synthetic frame fixtures '+(process.argv.includes('--fixtures')?'enabled':'disabled'));await admin.app().delete();})().catch(e=>{console.error(e);process.exitCode=1;});
