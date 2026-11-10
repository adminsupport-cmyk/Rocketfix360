'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateTarget}=require('../tools/deploy-staging.cjs'),{assertStaging}=require('../functions/runtime');
const config={confirmedSeparateStaging:true,projectId:'rocketfix-pos-staging',firebaseConfig:{projectId:'rocketfix-pos-staging',authDomain:'rocketfix-pos-staging.firebaseapp.com',apiKey:'fixture-public-key',appId:'1:123:web:fixture'}};
test('deployment refuses default, mismatched, unconfirmed and production targets',()=>{
 assert.equal(validateTarget(config,config.projectId),config.projectId);
 for(const bad of [{...config,confirmedSeparateStaging:false},{...config,projectId:'rocketfix-production'},{...config,firebaseConfig:{...config.firebaseConfig,projectId:'other'}}])assert.throws(()=>validateTarget(bad,bad.projectId));
 assert.throws(()=>validateTarget(config,'different-project'));
});
test('remote runtime accepts only its generated staging target and denies production or client override',()=>{
 const target={environment:'staging',projectId:config.projectId};
 assert.doesNotThrow(()=>assertStaging({GCLOUD_PROJECT:config.projectId},target));
 assert.throws(()=>assertStaging({GCLOUD_PROJECT:'rocketfix-production'},target));
 assert.throws(()=>assertStaging({GCLOUD_PROJECT:config.projectId}));
});
