'use strict';
const fs=require('node:fs'),path=require('node:path');
const PROJECT='rocketfix-360-staging',REGION='asia-southeast1';
function callableNames(){return [...fs.readFileSync(path.resolve(__dirname,'../functions/index.js'),'utf8').matchAll(/^exports\.(\w+)=(?:call|onCall)\(/gm)].map(m=>m[1]);}
async function configure(project,apply=false){
 if(project!==PROJECT)throw Error('Invoker changes are restricted to rocketfix-360-staging');
 const cli=require('./firebase-cli.cjs').cliPath(),lib=path.resolve(path.dirname(cli),'..');
 const auth=require(path.join(lib,'auth')),opts={project,nonInteractive:true};
 const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase authentication required');auth.setActiveAccount(opts,account);await require(path.join(lib,'requireAuth')).requireAuth(opts);
 const {Client}=require(path.join(lib,'apiv2')),gcf=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'}),run=require(path.join(lib,'gcp/run'));
 const rows=[];
 for(const name of [...callableNames(),'deliverOutbox']){
  const f=(await gcf.get(`/projects/${project}/locations/${REGION}/functions/${name}`)).body;
  const service=f.serviceConfig?.service;if(!service?.startsWith(`projects/${project}/locations/${REGION}/services/`))throw Error('Unexpected Cloud Run service target');
  let policy=await run.getIamPolicy(service);
  const isPublic=p=>(p.bindings||[]).some(b=>b.role==='roles/run.invoker'&&b.members?.includes('allUsers')&&!b.condition);
  if(name==='deliverOutbox'){
   if(isPublic(policy)||(policy.bindings||[]).some(b=>b.role==='roles/run.invoker'&&b.members?.includes('allAuthenticatedUsers')))throw Error('deliverOutbox unexpectedly has public invocation; no callable grant applied to it');
   rows.push({name,publicInvoker:false,database:f.eventTrigger?.eventFilters?.find(v=>v.attribute==='database')?.value});continue;
  }
  if(!isPublic(policy)&&apply){
   const bindings=(policy.bindings||[]).map(b=>({...b,members:[...(b.members||[])]}));
   let binding=bindings.find(b=>b.role==='roles/run.invoker'&&!b.condition);
   if(!binding){binding={role:'roles/run.invoker',members:[]};bindings.push(binding);}
   if(!binding.members.includes('allUsers'))binding.members.push('allUsers');
   await run.setIamPolicy(service,{...policy,bindings});
   policy=await run.getIamPolicy(service);
  }
  rows.push({name,publicInvoker:isPublic(policy)});
 }
 if(rows.some(r=>r.name!=='deliverOutbox'&&!r.publicInvoker))throw Error('Some callable services remain private: '+JSON.stringify(rows));
 console.log(JSON.stringify({project,callables:rows.filter(r=>r.name!=='deliverOutbox').length,services:rows},null,2));return rows;
}
if(require.main===module){const args=process.argv.slice(2),project=args[args.indexOf('--project')+1];configure(project,args.includes('--apply')).catch(e=>{console.error(e.message);let original=e.original;for(let n=0;original&&n<4;n++,original=original.original){console.error(original.message||String(original));if(original.context?.body?.error)console.error(JSON.stringify(original.context.body.error));}process.exitCode=1;});}
module.exports={callableNames,configure};
