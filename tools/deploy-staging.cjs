'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function validateViberActivation(policy,evidence){
 if(!policy.automaticDeliveryActivatedAt)return;
 if(policy.controlledVerificationEnabled!==false||!Number.isFinite(Date.parse(policy.automaticDeliveryActivatedAt))||evidence?.project!=='rocketfix-360-staging'||evidence.database!=='rocketfix360database'||evidence.orderSaved!==true||evidence.orderVersion<2||evidence.notificationEventCount!==1||evidence.eventStatus!=='SENT'||evidence.provider!=='VIBER'||evidence.providerResponseRecorded!==true||evidence.attempts!==1||evidence.attemptLogCount!==1||evidence.refreshAndEditVerified!==true)throw Error('Automatic Viber activation requires successful controlled Firebase remittance and duplicate-protection evidence');
}
function validateRealViberActivation(policy,evidence){
 if(!policy.realAutomaticDeliveryActivatedAt)return;
 if(policy.controlledRealVerificationEnabled!==false||!Number.isFinite(Date.parse(policy.realAutomaticDeliveryActivatedAt))||evidence?.project!=='rocketfix-360-staging'||evidence.database!=='rocketfix360database'||evidence.posId!==policy.realVerificationPosId||evidence.eventStatus!=='SENT'||evidence.provider!=='VIBER'||evidence.providerResponseRecorded!==true||evidence.realProviderAttempts!==1||evidence.notificationEventCount!==1||evidence.paymentUnchanged!==true||evidence.refreshAndReplayVerified!==true)throw Error('Real automatic Viber activation requires one verified real delivery with unchanged payment and no duplicate event');
}
function validateTarget(config,confirmation){
 const id=config?.projectId;
 if(config?.confirmedSeparateStaging!==true||!id||!/^[a-z][a-z0-9-]*-staging(?:-[a-z0-9]+)*$/.test(id)||confirmation!==id)throw Error('Confirm a separate project ending in -staging (or -staging-<suffix>); production/default projects are refused');
 const web=config.firebaseConfig;
 if(web?.projectId!==id||web.authDomain!==id+'.firebaseapp.com'||!web.apiKey||/REPLACE/.test(web.apiKey)||!/^1:/.test(web.appId||''))throw Error('Matching Firebase staging web app configuration required');
 if(require('../functions/notification-policy').externalSendingAuthorized!==false)throw Error('External notifications must remain disabled');
 return id;
}
function assertFunctionInventory(functions,source,project){
 if(!Array.isArray(functions))throw Error('Staging function inventory is unavailable');
 const names=[...source.matchAll(/^exports\.(\w+)=/gm)].map(m=>m[1]);
 if(!names.length||functions.some(f=>f.project!==project||f.region!=='asia-southeast1'||f.platform!=='gcfv2'||!names.includes(f.id)))throw Error('Unrelated staging functions found; refusing forced deployment');
 return names;
}
function isInvokerOnlyFailure(output,names){
 const errors=String(output).split('\n').map(s=>s.trim()).filter(s=>s.startsWith('- Error '));
 return errors.length>0&&errors.every(line=>{const match=line.match(/^- Error Failed to set invoker function (\w+) in region asia-southeast1$/);return !!match&&names.includes(match[1]);});
}
async function main(){
 const args=process.argv.slice(2),configPath=args[args.indexOf('--config')+1],confirmation=args[args.indexOf('--confirm-project')+1];
 if(!args.includes('--config')||!args.includes('--confirm-project'))throw Error('Usage: npm run deploy:staging -- --config staging/project.json --confirm-project YOUR_PROJECT-staging');
 const viberPolicy=require('../functions/viber-policy.json');
 const evidencePath=path.join(root,'staging/viber-remittance-verification.json');
 validateViberActivation(viberPolicy,fs.existsSync(evidencePath)?JSON.parse(fs.readFileSync(evidencePath,'utf8')):null);
 const realEvidencePath=path.join(root,'staging/real-viber-verification.json');
 validateRealViberActivation(viberPolicy,fs.existsSync(realEvidencePath)?JSON.parse(fs.readFileSync(realEvidencePath,'utf8')):null);
 const config=JSON.parse(fs.readFileSync(path.resolve(root,configPath),'utf8')),id=validateTarget(config,confirmation),cli=require('./firebase-cli.cjs').cliPath();
 const run=(exe,argv,options={})=>{const r=spawnSync(exe,argv,{cwd:root,stdio:'inherit',...options});if(r.error)throw r.error;if(r.status!==0)throw Error('Staging command failed; deployment stopped');};
 // Contact only the explicitly confirmed staging project; never enumerate or select other projects.
 const hostedHtml=require('./restore-original-ui.cjs').generate({hosted:true});
 const out=path.join(root,'.runtime/deploy');fs.mkdirSync(out,{recursive:true});
 fs.cpSync(path.join(root,'public'),path.join(out,'public'),{recursive:true});
 fs.writeFileSync(path.join(out,'public/index.html'),hostedHtml);
 fs.cpSync(path.join(root,'functions'),path.join(out,'functions'),{recursive:true,filter:src=>!src.split(path.sep).some(part=>part==='node_modules'||part.startsWith('.env')||part.startsWith('.secret'))});
 fs.writeFileSync(path.join(out,'functions/deployment-target.json'),JSON.stringify({environment:'staging',projectId:id}));
 const client=path.join(out,'public/config.js');fs.writeFileSync(client,'export const firebaseConfig='+JSON.stringify(config.firebaseConfig)+';\nexport const functionsRegion="asia-southeast1";\nexport const useEmulators=false;\n');
 await require('esbuild').build({entryPoints:[path.join(root,'public/app.js')],bundle:true,outfile:path.join(out,'public/app.bundle.js'),format:'esm',minifyWhitespace:true,minifySyntax:true,plugins:[{name:'staging-config',setup(build){build.onResolve({filter:/^\.\/config\.js$/},()=>({path:client}));}}]});
 const firebase=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));delete firebase.emulators;
 firebase.functions.source='functions';firebase.hosting.public='public';
 if(!Array.isArray(firebase.firestore)||firebase.firestore.length!==1||firebase.firestore[0].database!=='rocketfix360database')throw Error('Deployment must target only existing rocketfix360database');
 firebase.firestore=[{database:'rocketfix360database',rules:'firestore.rules',indexes:'firestore.indexes.json'}];
 for(const name of ['firestore.rules','firestore.indexes.json'])fs.copyFileSync(path.join(root,name),path.join(out,name));
 const file=path.join(out,'firebase.json');fs.writeFileSync(file,JSON.stringify(firebase,null,2));
 if(args.includes('--prepare-only')){console.log('Prepared staging artifact for '+id+' at '+out);return;}
 run(process.execPath,[cli,'apps:list','WEB','--project',id,'--json']);
 run(process.execPath,[cli,'firestore:databases:get','rocketfix360database','--project',id,'--json']);
 run('npm',['ci','--prefix',path.join(out,'functions'),'--ignore-scripts','--no-audit','--no-fund']);
 const inventory=spawnSync(process.execPath,[cli,'functions:list','--project',id,'--json'],{cwd:root,encoding:'utf8'});
 if(inventory.status!==0)throw Error('Cannot verify staging function inventory');
 const names=assertFunctionInventory(JSON.parse(inventory.stdout).result,fs.readFileSync(path.join(root,'functions/index.js'),'utf8'),id);
 const only=['firestore:rules','firestore:indexes',...names.map(name=>'functions:'+name),'hosting'].join(',');
 // --force explicitly approves the tested event retry policy. Named targets and
 // the inventory guard prevent deleting any unrelated Cloud Function.
 const deployment=spawnSync(process.execPath,[cli,'deploy','--config',file,'--project',id,'--only',only,'--non-interactive','--force'],{cwd:root,encoding:'utf8'});
 process.stdout.write(deployment.stdout||'');process.stderr.write(deployment.stderr||'');
 if(deployment.error)throw deployment.error;
 if(deployment.status!==0&&!isInvokerOnlyFailure((deployment.stdout||'')+'\n'+(deployment.stderr||''),names))throw Error('Staging code deployment failed; stopped before invocation changes');
 // The Firebase CLI always attempts allUsers for newly created onCall services.
 // Only an IAM-only failure may use the already-approved supported Cloud Run
 // option; the helper verifies active callable inventory, policy and private workers.
 run(process.execPath,[path.join(root,'tools/callable-invokers.cjs'),'--project',id,'--apply']);
 if(deployment.status!==0)run(process.execPath,[cli,'deploy','--config',file,'--project',id,'--only','firestore:rules,firestore:indexes,hosting','--non-interactive']);
 console.log('Staging URL: https://'+id+'.web.app');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateViberActivation,validateRealViberActivation,validateTarget,assertFunctionInventory,isInvokerOnlyFailure};
