'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function auditLegacy(directory=path.resolve(__dirname,'../reference/legacy')){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 const sources=manifest.sources.map(source=>{
  const candidates=[source.name,...source.aliases].filter(name=>fs.existsSync(path.join(directory,name)));
  if(candidates.length!==1)return {name:source.name,status:candidates.length?'AMBIGUOUS':'MISSING',candidates};
  const file=path.join(directory,candidates[0]),text=fs.readFileSync(file,'utf8'),sha256=createHash('sha256').update(text).digest('hex');
  return {name:source.name,path:candidates[0],sha256,status:source.reviewedSha256===sha256?'REVIEWED':'UNREVIEWED',functions:[...new Set([...text.matchAll(/\bfunction\s+([\w$]+)\s*\(/g)].map(m=>m[1]))].sort()};
 });
 return {sources,exitCode:sources.some(s=>['MISSING','AMBIGUOUS'].includes(s.status))?1:sources.some(s=>s.status!=='REVIEWED')?2:0};
}
if(require.main===module){const report=auditLegacy();console.log(JSON.stringify(report,null,2));process.exitCode=report.exitCode;}
module.exports={auditLegacy};
