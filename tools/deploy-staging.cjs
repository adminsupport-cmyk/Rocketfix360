'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function validateTarget(config,confirmation){
 const id=config?.projectId;
 if(config?.confirmedSeparateStaging!==true||!id||!/^[a-z][a-z0-9-]*-staging(?:-[a-z0-9]+)*$/.test(id)||confirmation!==id)throw Error('Confirm a separate project ending in -staging (or -staging-<suffix>); production/default projects are refused');
 const web=config.firebaseConfig;
 if(web?.projectId!==id||web.authDomain!==id+'.firebaseapp.com'||!web.apiKey||/REPLACE/.test(web.apiKey)||!/^1:/.test(web.appId||''))throw Error('Matching Firebase staging web app configuration required');
 if(require('../functions/notification-policy').externalSendingAuthorized!==false)throw Error('External notifications must remain disabled');
 return id;
}
async function main(){
 const args=process.argv.slice(2),configPath=args[args.indexOf('--config')+1],confirmation=args[args.indexOf('--confirm-project')+1];
 if(!args.includes('--config')||!args.includes('--confirm-project'))throw Error('Usage: npm run deploy:staging -- --config staging/project.json --confirm-project YOUR_PROJECT-staging');
 const config=JSON.parse(fs.readFileSync(path.resolve(root,configPath),'utf8')),id=validateTarget(config,confirmation),cli=require('./firebase-cli.cjs').cliPath();
 const run=(exe,argv,options={})=>{const r=spawnSync(exe,argv,{cwd:root,stdio:'inherit',...options});if(r.error)throw r.error;if(r.status!==0)throw Error('Staging command failed; deployment stopped');};
 // Contact only the explicitly confirmed staging project; never enumerate or select other projects.
 const out=path.join(root,'.runtime/deploy');fs.mkdirSync(out,{recursive:true});
 fs.cpSync(path.join(root,'public'),path.join(out,'public'),{recursive:true});
 fs.cpSync(path.join(root,'functions'),path.join(out,'functions'),{recursive:true,filter:src=>!src.split(path.sep).some(part=>part==='node_modules'||part.startsWith('.env')||part.startsWith('.secret'))});
 fs.writeFileSync(path.join(out,'functions/deployment-target.json'),JSON.stringify({environment:'staging',projectId:id}));
 const client=path.join(out,'public/config.js');fs.writeFileSync(client,'export const firebaseConfig='+JSON.stringify(config.firebaseConfig)+';\nexport const functionsRegion="asia-southeast1";\nexport const useEmulators=false;\n');
 await require('esbuild').build({entryPoints:[path.join(root,'public/app.js')],bundle:true,outfile:path.join(out,'public/app.bundle.js'),format:'esm',plugins:[{name:'staging-config',setup(build){build.onResolve({filter:/^\.\/config\.js$/},()=>({path:client}));}}]});
 const firebase=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));delete firebase.emulators;
 firebase.functions.source='functions';firebase.hosting.public='public';firebase.firestore.rules='firestore.rules';firebase.firestore.indexes='firestore.indexes.json';
 for(const name of ['firestore.rules','firestore.indexes.json'])fs.copyFileSync(path.join(root,name),path.join(out,name));
 const file=path.join(out,'firebase.json');fs.writeFileSync(file,JSON.stringify(firebase,null,2));
 if(args.includes('--prepare-only')){console.log('Prepared staging artifact for '+id+' at '+out);return;}
 run(process.execPath,[cli,'apps:list','WEB','--project',id,'--json']);
 run('npm',['ci','--prefix',path.join(out,'functions'),'--ignore-scripts','--no-audit','--no-fund']);
 run(process.execPath,[cli,'deploy','--config',file,'--project',id,'--only','firestore:rules,firestore:indexes,functions,hosting','--non-interactive']);
 console.log('Staging URL: https://'+id+'.web.app');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateTarget};
