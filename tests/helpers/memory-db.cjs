'use strict';
// A serialized transaction double, not a Firestore emulator or rules engine.
// This tests application claims/state transitions; real Firestore semantics still
// require tests/integration/emulators.test.cjs.
function memoryDb(){
 const docs=new Map();let tail=Promise.resolve();
 const copy=value=>value===undefined?undefined:structuredClone(value);
 const apply=ops=>{for(const [kind,ref] of ops){if(kind==='create'&&docs.has(ref.path))throw Error('Already exists');if(kind==='update'&&!docs.has(ref.path))throw Error('Missing document');}for(const [kind,ref,value] of ops)docs.set(ref.path,kind==='update'?{...docs.get(ref.path),...copy(value)}:copy(value));};
 const transaction=()=>{const ops=[];return {get:async ref=>({exists:docs.has(ref.path),data:()=>copy(docs.get(ref.path))}),set:(ref,value)=>ops.push(['set',ref,value]),update:(ref,value)=>ops.push(['update',ref,value]),create:(ref,value)=>ops.push(['create',ref,value]),commit:()=>apply(ops)};};
 const db={
  failNextBatch:false,
  doc:path=>({path,id:path.split('/').at(-1),update:async value=>apply([['update',{path},value]]),get:async()=>({exists:docs.has(path),data:()=>copy(docs.get(path))})}),
  put:(path,value)=>docs.set(path,copy(value)),data:path=>copy(docs.get(path)),entries:()=>[...docs.entries()].map(([p,v])=>[p,copy(v)]),
  runTransaction:fn=>{const run=tail.then(async()=>{const t=transaction(),result=await fn(t);t.commit();return result;});tail=run.catch(()=>{});return run;},
  batch:()=>{const t=transaction();return {update:t.update,create:t.create,commit:async()=>{if(db.failNextBatch){db.failNextBatch=false;throw Error('Persistence unavailable');}t.commit();}};}
 };return db;
}
module.exports={memoryDb};
