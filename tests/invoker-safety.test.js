'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertCallable,assertPolicyAllows}=require('../tools/callable-invokers.cjs');
const prefix='projects/rocketfix-360-staging/locations/asia-southeast1/';
test('invocation changes exclude event triggers, unaudited functions and other projects',()=>{
 const f={name:prefix+'functions/dashboard',labels:{'deployment-callable':'true'},serviceConfig:{service:prefix+'services/dashboard'}};
 assert.doesNotThrow(()=>assertCallable(f,'dashboard'));
 for(const [other,name] of [[{...f,eventTrigger:{}},'dashboard'],[{...f,labels:{}},'dashboard'],[{...f,name:f.name.replace('rocketfix-360-staging','rocketfix-360')},'dashboard'],[f,'deliverOutbox'],[f,'unknown']])assert.throws(()=>assertCallable(other,name));
});
test('effective enforced or unreadable policy prevents disabling IAM checks',()=>{
 assert.doesNotThrow(()=>assertPolicyAllows({booleanPolicy:{}}));assert.doesNotThrow(()=>assertPolicyAllows({booleanPolicy:{enforced:false}}));
 assert.throws(()=>assertPolicyAllows({booleanPolicy:{enforced:true}}));assert.throws(()=>assertPolicyAllows({}));
});
