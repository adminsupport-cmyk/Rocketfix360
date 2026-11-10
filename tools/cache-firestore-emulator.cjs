'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
function artifactSpec(cli=process.env.RF_FIREBASE_CLI||'/workspace/rocketfix-toolchain/node_modules/firebase-tools/lib/bin/firebase.js'){
 const spec=JSON.parse(fs.readFileSync(path.resolve(path.dirname(cli),'../emulator/downloadableEmulatorInfo.json'),'utf8')).firestore;
 if(!/^[a-f0-9]{64}$/.test(spec.expectedChecksumSHA256)||!Number.isSafeInteger(spec.expectedSize)||path.basename(spec.downloadPathRelativeToCacheDir)!==spec.downloadPathRelativeToCacheDir)throw Error('Trusted Firebase CLI artifact metadata is incomplete');
 return spec;
}
async function cacheVerifiedArtifact(source,destination,spec){
 await fs.promises.mkdir(path.dirname(destination),{recursive:true});
 const temporary=destination+'.'+crypto.randomUUID()+'.tmp';
 const sha256=crypto.createHash('sha256'),md5=crypto.createHash('md5');let bytes=0;
 try{
  await pipeline(fs.createReadStream(source),new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>spec.expectedSize){callback(Error('Artifact size or checksum does not match the installed Firebase CLI; cache unchanged'));return;}sha256.update(chunk);md5.update(chunk);callback(null,chunk);}}),fs.createWriteStream(temporary,{flags:'wx',mode:0o600}));
  if(bytes!==spec.expectedSize||sha256.digest('hex')!==spec.expectedChecksumSHA256||md5.digest('hex')!==spec.expectedChecksum)throw Error('Artifact size or checksum does not match the installed Firebase CLI; cache unchanged');
  await fs.promises.rename(temporary,destination);
  return {bytes,sha256:spec.expectedChecksumSHA256};
 }finally{await fs.promises.rm(temporary,{force:true});}
}
if(require.main===module){
 const source=process.argv[2];
 if(!source||process.argv.length!==3){console.error('Usage: node tools/cache-firestore-emulator.cjs /path/to/official-emulator.jar');process.exitCode=1;}
 else{const spec=artifactSpec(),cache=process.env.FIREBASE_EMULATORS_PATH||'/workspace/rocketfix-toolchain/emulators';cacheVerifiedArtifact(source,path.join(cache,spec.downloadPathRelativeToCacheDir),spec).then(result=>console.log('Verified official Firestore emulator cached:',JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1;});}
}
module.exports={artifactSpec,cacheVerifiedArtifact};
