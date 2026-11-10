'use strict';
const STAGING_ORIGIN='https://rocketfix-360-staging.web.app';
function callableOptions(env=process.env){
 return {invoker:'public',cors:env.FUNCTIONS_EMULATOR==='true'?[STAGING_ORIGIN,'http://127.0.0.1:5050','http://localhost:5050']:STAGING_ORIGIN};
}
module.exports={callableOptions,STAGING_ORIGIN};
