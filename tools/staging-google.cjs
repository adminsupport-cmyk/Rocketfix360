'use strict';
const path=require('node:path');
async function clients(){
 const project='rocketfix-360-staging',lib=path.resolve(path.dirname(require('./firebase-cli.cjs').cliPath()),'..'),auth=require(path.join(lib,'auth')),opts={project,nonInteractive:true},account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase authentication required');auth.setActiveAccount(opts,account);await require(path.join(lib,'requireAuth')).requireAuth(opts);
 const {Client}=require(path.join(lib,'apiv2'));return {project,firestore:new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'}),functions:new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'}),serviceUsage:new Client({urlPrefix:'https://serviceusage.googleapis.com',apiVersion:'v1'})};
}
module.exports={clients};
