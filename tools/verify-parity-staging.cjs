'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
(async()=>{
 const project='rocketfix-360-staging',origin='https://'+project+'.web.app',rows=[];
 for(const name of require('./callable-invokers.cjs').callableNames()){
  const url='https://asia-southeast1-'+project+'.cloudfunctions.net/'+name;
  const pre=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(pre.status,204,name+' preflight');assert.equal(pre.headers.get('access-control-allow-origin'),origin);
  const res=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({data:{}})}),body=await res.json();
  assert.equal(res.status,401,name+' authentication');assert.equal(body.error.status,'UNAUTHENTICATED');rows.push({name,preflight:pre.status,unauthenticated:res.status});
 }
 const hash=b=>createHash('sha256').update(b).digest('hex'),assets=[];
 for(const name of ['index.html','app.bundle.js']){
  const res=await fetch(origin+'/'+name,{cache:'no-store'});assert.equal(res.status,200);const bytes=Buffer.from(await res.arrayBuffer()),local=fs.readFileSync(path.resolve(__dirname,'../.runtime/deploy/public',name));assert.equal(hash(bytes),hash(local),'Deployed '+name+' matches tested artifact');assets.push({name,sha256:hash(bytes)});
 }
 const report={checkedAt:new Date().toISOString(),project,database:'rocketfix360database',website:origin,callables:rows,assets,realNotificationsEnabled:false,financialWrites:'BLOCKED_OUTSIDE_LOCAL_DEMO',ownerDeployedAcceptance:'NOT_VERIFIED; no authorized browser session used',fullParity:false};
 fs.writeFileSync(path.resolve(__dirname,'../docs/parity/DEPLOYED-CHECKS.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: '+rows.length+' deployed preflights/authentication checks; deployed HTML and bundle match tested staging artifact.');
})().catch(e=>{console.error(e);process.exitCode=1;});
