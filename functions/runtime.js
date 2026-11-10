'use strict';
const deploymentTarget=require('./deployment-target.json');
function assertStaging(env=process.env,target=deploymentTarget){
 if(env.FUNCTIONS_EMULATOR==='true'&&env.GCLOUD_PROJECT==='demo-rocketfix-360')return;
 if(env.FUNCTIONS_EMULATOR!=='true'&&target.environment==='staging'&&typeof target.projectId==='string'&&/^[a-z][a-z0-9-]*-staging(?:-[a-z0-9]+)*$/.test(target.projectId)&&env.GCLOUD_PROJECT===target.projectId)return;
 throw Error('This build runs only in the demo Firebase emulators or its confirmed separate staging project');
}
function assertStagingOrder(order,env=process.env){
 assertStaging(env);
 if(order?.environment&&order.environment!=='staging')throw Error('Production orders are disabled; staging only');
 if(order?.productionEligible===true)throw Error('UNVERIFIED_FIXTURE pricing cannot be approved for production');
}
function assertFinancialTesting(env=process.env){
 if(env.FUNCTIONS_EMULATOR==='true'&&env.GCLOUD_PROJECT==='demo-rocketfix-360')return;
 throw Error('Financial changes are blocked while original POS business-rule parity is under review. Use local sample orders only.');
}
module.exports={assertStaging,assertStagingOrder,assertFinancialTesting};
