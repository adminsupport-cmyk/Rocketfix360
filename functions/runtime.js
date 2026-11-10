'use strict';
function assertStaging(env=process.env){
 if(env.FUNCTIONS_EMULATOR!=='true'||env.GCLOUD_PROJECT!=='demo-rocketfix-360')throw Error('This build runs only in the demo Firebase emulators');
}
function assertStagingOrder(order,env=process.env){
 assertStaging(env);
 if(order?.environment&&order.environment!=='staging')throw Error('Production orders are disabled; staging only');
 if(order?.productionEligible===true)throw Error('UNVERIFIED_FIXTURE pricing cannot be approved for production');
}
module.exports={assertStaging,assertStagingOrder};
