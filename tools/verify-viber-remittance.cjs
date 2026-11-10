'use strict';
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const project='rocketfix-360-staging',lib=path.resolve(path.dirname(require('./firebase-cli.cjs').cliPath()),'..');
 const auth=require(path.join(lib,'auth')),opts={project,nonInteractive:true},account=auth.getGlobalDefaultAccount();if(!account)throw Error('Authentication required');
 auth.setActiveAccount(opts,account);await require(path.join(lib,'requireAuth')).requireAuth(opts);
 const {Client}=require(path.join(lib,'apiv2')),api=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'}),base=`/projects/${project}/databases/rocketfix360database/documents`;
 function value(v){if(v.stringValue!==undefined)return v.stringValue;if(v.booleanValue!==undefined)return v.booleanValue;if(v.integerValue!==undefined)return Number(v.integerValue);if(v.doubleValue!==undefined)return v.doubleValue;if(v.nullValue!==undefined)return null;if(v.arrayValue)return (v.arrayValue.values||[]).map(value);if(v.mapValue)return fields(v.mapValue.fields||{});return null;}
 function fields(f){return Object.fromEntries(Object.entries(f).map(([k,v])=>[k,value(v)]));}
 const marker=fields((await api.get(base+'/stagingConfig/viberControlledVerification')).body.fields);
 if(!/^\d{8}$/.test(marker.posId)||marker.eventId!==marker.posId+'_VIBER')throw Error('Invalid verification marker');
 const order=fields((await api.get(base+'/orders/'+marker.posId)).body.fields);
 const event=fields((await api.get(base+'/notificationOutbox/'+marker.eventId)).body.fields);
 async function matching(collection,field,text){const result=(await api.post(base+':runQuery',{structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:text}}}}})).body;return result.filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),...fields(x.document.fields)}));}
 const notifications=await matching('notificationOutbox','posId',marker.posId),attempts=await matching('notificationAttempts','eventId',marker.eventId);
 const report={project,database:'rocketfix360database',verifiedAt:new Date().toISOString(),posId:marker.posId,eventId:marker.eventId,orderSaved:order.stagingTest===true,orderVersion:order.version,received:order.received,due:order.due,excess:order.excess,notificationEventCount:notifications.filter(x=>x.type==='VIBER').length,eventStatus:event.status,provider:event.provider||null,providerResponseRecorded:!!event.providerId,attempts:event.attempts,attemptLogCount:attempts.length,attemptStatuses:attempts.map(x=>x.status),controlledVerification:event.controlledVerification,refreshAndEditVerified:order.version>=2&&notifications.filter(x=>x.type==='VIBER').length===1&&event.attempts===1&&attempts.length===1,automaticStagingConfigured:require('../functions/viber-policy.json').automaticDeliveryActivatedAt!==null};
 fs.writeFileSync(path.resolve(__dirname,'../staging/viber-remittance-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(()=>{console.error('Controlled remittance verification unavailable; no write or retry performed.');process.exitCode=1;});
