'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {auditLegacy}=require('../tools/audit-legacy.cjs');
const {cacheVerifiedArtifact,artifactSpec}=require('../tools/cache-firestore-emulator.cjs');
const {assertStagingOrder}=require('../functions/runtime');
const {validate}=require('../functions/core');
const staging={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'demo-rocketfix-360'};
test('production/approval claims are rejected and fixture classification cannot be supplied by the client',()=>{
 const fixture={environment:'staging',pricingStatus:'UNVERIFIED_FIXTURE'};assert.doesNotThrow(()=>assertStagingOrder(fixture,staging));
 assert.throws(()=>assertStagingOrder({...fixture,environment:'production'},staging),/Production orders/);assert.throws(()=>assertStagingOrder({...fixture,productionEligible:true},staging),/cannot be approved/);
 assert.throws(()=>assertStagingOrder(fixture,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'production'}),/demo Firebase/);
 const o=validate({pricingStatus:'VERIFIED',posId:'12345678',first:'Fixture',email:'N/A',paymentDate:'2026-11-10',received:100,items:[{kind:'frame',existingId:'AB1C2',amount:100}]});assert.equal(o.pricingStatus,'UNVERIFIED_FIXTURE');
});
test('legacy audit distinguishes missing, unreviewed, reviewed, changed and ambiguous sources',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rocketfix-legacy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const manifest={sources:[{name:'FramePricing.gs',aliases:['OriginalPricing.gs'],reviewedSha256:null}]},file=path.join(dir,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest));assert.equal(auditLegacy(dir).exitCode,1);
 const source='function quoteFixture() { return 1; }';fs.writeFileSync(path.join(dir,'FramePricing.gs'),source);assert.equal(auditLegacy(dir).exitCode,2);
 manifest.sources[0].reviewedSha256=createHash('sha256').update(source).digest('hex');fs.writeFileSync(file,JSON.stringify(manifest));assert.equal(auditLegacy(dir).exitCode,0);
 fs.appendFileSync(path.join(dir,'FramePricing.gs'),'\n// changed');assert.equal(auditLegacy(dir).exitCode,2);
 fs.writeFileSync(path.join(dir,'OriginalPricing.gs'),source);assert.equal(auditLegacy(dir).sources[0].status,'AMBIGUOUS');
});
test('artifact importer rejects truncated/tampered content without replacing a valid cache',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rocketfix-artifact-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source.jar'),dest=path.join(dir,'cache/emulator.jar'),content=Buffer.from('Synthetic verifier fixture; not a Firestore artifact');fs.writeFileSync(source,content);
 const spec={expectedSize:content.length,expectedChecksumSHA256:createHash('sha256').update(content).digest('hex'),expectedChecksum:createHash('md5').update(content).digest('hex')};
 await cacheVerifiedArtifact(source,dest,spec);assert.deepEqual(fs.readFileSync(dest),content);
 for(const bad of [Buffer.from('truncated'),Buffer.from(content.toString().replace('Synthetic','Tampered!'))]){fs.writeFileSync(source,bad);await assert.rejects(cacheVerifiedArtifact(source,dest,spec),/checksum/);assert.deepEqual(fs.readFileSync(dest),content);}
 assert.equal(fs.readdirSync(path.dirname(dest)).length,1);
});
test('official artifact metadata requires a pinned SHA-256 and matching versioned filename',()=>{
 const spec=artifactSpec();assert.match(spec.expectedChecksumSHA256,/^[a-f0-9]{64}$/);assert.equal(spec.downloadPathRelativeToCacheDir,'cloud-firestore-emulator-v'+spec.version+'.jar');
});
