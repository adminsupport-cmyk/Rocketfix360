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

test('forced retry-policy deployment rejects unrelated functions and wrong projects or regions',()=>{
 const {assertFunctionInventory}=require('../tools/deploy-staging.cjs'),source="exports.safe=call([],()=>{});\nexports.worker=onDocumentCreated({},()=>{});";
 const good={project:'rocketfix-360-staging',region:'asia-southeast1',platform:'gcfv2',id:'safe'};
 assert.deepEqual(assertFunctionInventory([good],source,good.project),['safe','worker']);
 for(const bad of [{...good,id:'unrelated'},{...good,project:'production'},{...good,region:'us-central1'},{...good,platform:'gcfv1'}])assert.throws(()=>assertFunctionInventory([bad],source,good.project),/Unrelated/);
});

test('only exact IAM creation errors may proceed to approved callable invocation configuration',()=>{
 const {isInvokerOnlyFailure}=require('../tools/deploy-staging.cjs');
 assert.equal(isInvokerOnlyFailure('- Error Failed to set invoker function newCallable in region asia-southeast1',['newCallable']),true);
 for(const message of ['- Error function source build failed','- Error Failed to set invoker function unknown in region asia-southeast1','- Error Failed to set invoker function newCallable in region us-central1','- Error Failed to set invoker function newCallable in region asia-southeast1\n- Error database rules failed'])assert.equal(isInvokerOnlyFailure(message,['newCallable']),false);
});
