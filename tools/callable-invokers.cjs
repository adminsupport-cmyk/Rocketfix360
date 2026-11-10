'use strict';
const fs=require('node:fs'),path=require('node:path');
const PROJECT='rocketfix-360-staging',REGION='asia-southeast1';
function callableNames(){return [...fs.readFileSync(path.resolve(__dirname,'../functions/index.js'),'utf8').matchAll(/^exports\.(\w+)=(?:call|onCall)\(/gm)].map(m=>m[1]);}
function assertCallable(f,name){
 if(!callableNames().includes(name)||name==='deliverOutbox'||f.eventTrigger||f.labels?.['deployment-callable']!=='true'||f.name!==`projects/${PROJECT}/locations/${REGION}/functions/${name}`)throw Error('Refusing invocation changes outside audited HTTPS callables: '+name);
 if(!f.serviceConfig?.service?.startsWith(`projects/${PROJECT}/locations/${REGION}/services/`))throw Error('Unexpected Cloud Run service target');
}
function assertPolicyAllows(policy){
 if(!policy?.booleanPolicy||policy.booleanPolicy.enforced===true)throw Error('Invoker check change prohibited or not verifiable: '+JSON.stringify(policy));
}
async function configure(project,apply=false){
 if(project!==PROJECT)throw Error('Invoker changes are restricted to rocketfix-360-staging');
 const cli=require('./firebase-cli.cjs').cliPath(),lib=path.resolve(path.dirname(cli),'..');
 const auth=require(path.join(lib,'auth')),opts={project,nonInteractive:true};
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase authentication required');auth.setActiveAccount(opts,account);await require(path.join(lib,'requireAuth')).requireAuth(opts);
 const {Client}=require(path.join(lib,'apiv2')),gcf=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'}),run=new Client({urlPrefix:'https://run.googleapis.com',apiVersion:'v2'}),runV1=new Client({urlPrefix:'https://run.googleapis.com',apiVersion:'v1'}),crm=new Client({urlPrefix:'https://cloudresourcemanager.googleapis.com',apiVersion:'v1'});
 const policies=[];
 for(const constraint of ['constraints/run.managed.requireInvokerIam','constraints/run.requireInvokerIam']){
  try{const policy=(await crm.post(`/projects/${project}:getEffectiveOrgPolicy`,{constraint})).body;assertPolicyAllows(policy);policies.push(policy);}
  catch(e){if(e.status===404&&constraint==='constraints/run.requireInvokerIam')policies.push({constraint,notFound:true});else throw e;}
 }
 const functions=[];let pageToken;
 do{const response=(await gcf.get(`/projects/${project}/locations/${REGION}/functions`,{queryParams:{pageSize:'1000',...(pageToken?{pageToken}:{})}})).body;functions.push(...response.functions||[]);pageToken=response.nextPageToken;}while(pageToken);
 if(functions.some(f=>f.state!=='ACTIVE'))throw Error('A staging function is not ACTIVE; refusing invocation changes');
 const actualNames=functions.filter(f=>f.labels?.['deployment-callable']==='true').map(f=>f.name.split('/').pop()).sort();
 if(JSON.stringify(actualNames)!==JSON.stringify(callableNames().sort()))throw Error('Deployed HTTPS callable inventory differs from audited source: '+JSON.stringify(actualNames));
 const outbox=functions.find(f=>f.name.endsWith('/deliverOutbox'));
 if(!outbox?.eventTrigger||outbox.eventTrigger.eventFilters?.find(f=>f.attribute==='database')?.value!=='rocketfix360database')throw Error('Private named-database outbox trigger missing');
 const outboxService=(await run.get('/'+outbox.serviceConfig.service)).body;
 const outboxPolicy=(await run.get('/'+outbox.serviceConfig.service+':getIamPolicy')).body;
 if(outboxService.invokerIamDisabled===true||(outboxPolicy.bindings||[]).some(b=>b.role==='roles/run.invoker'&&b.members?.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))))throw Error('deliverOutbox is not private; refusing callable changes');
 const mirror=functions.find(f=>f.name.endsWith('/mirrorOutbox'));
 if(mirror){
  if(!mirror.eventTrigger||mirror.eventTrigger.eventFilters?.find(f=>f.attribute==='database')?.value!=='rocketfix360database')throw Error('Named-database mirror trigger missing');
  const service=(await run.get('/'+mirror.serviceConfig.service)).body,iam=(await run.get('/'+mirror.serviceConfig.service+':getIamPolicy')).body;
  if(service.invokerIamDisabled===true||(iam.bindings||[]).some(b=>b.role==='roles/run.invoker'&&b.members?.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))))throw Error('mirrorOutbox must remain private');
 }
 const rows=[];
 for(const name of callableNames()){
  const f=functions.find(f=>f.name.endsWith('/'+name));assertCallable(f,name);
  const service=f.serviceConfig.service;let state=(await run.get('/'+service)).body;
  if(state.invokerIamDisabled!==true&&apply){
   // Google's supported v1 service annotation is the same setting as
   // gcloud run services update --no-invoker-iam-check. Preserve the entire
   // existing service spec and resourceVersion; do not alter IAM bindings.
   const definition=(await runV1.get('/'+service)).body;
   definition.metadata.annotations={...definition.metadata.annotations,'run.googleapis.com/invoker-iam-disabled':'true'};
   delete definition.status;
   await runV1.put('/'+service,definition);
   const deadline=Date.now()+60000;
   do{state=(await run.get('/'+service)).body;if(state.invokerIamDisabled===true)break;await new Promise(r=>setTimeout(r,1500));}while(Date.now()<deadline);

  }
  rows.push({name,invokerIamDisabled:state.invokerIamDisabled===true});
  console.log(name+': invokerIamDisabled='+String(state.invokerIamDisabled===true));
 }
 const report={project,mode:'no-invoker-iam-check',effectivePolicies:policies,callables:rows,outbox:{name:'deliverOutbox',private:true,invokerIamDisabled:false,database:'rocketfix360database'},mirror:mirror?{private:true,invokerIamDisabled:false,database:'rocketfix360database',serviceAccount:mirror.serviceConfig.serviceAccountEmail}:null,iamGrantsChanged:false};
 console.log(JSON.stringify(report,null,2));
 if(rows.some(r=>!r.invokerIamDisabled))throw Error('Some callable Invoker IAM checks remain enabled');return report;
}
if(require.main===module){const args=process.argv.slice(2),project=args[args.indexOf('--project')+1];configure(project,args.includes('--apply')).catch(e=>{console.error(e.message);let original=e.original;for(let n=0;original&&n<4;n++,original=original.original){console.error(original.message||String(original));if(original.context?.body?.error)console.error(JSON.stringify(original.context.body.error));}process.exitCode=1;});}
module.exports={callableNames,assertCallable,assertPolicyAllows,configure};
