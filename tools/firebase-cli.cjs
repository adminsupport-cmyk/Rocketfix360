'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function cliPath(){
 const candidates=[process.env.RF_FIREBASE_CLI,path.join(os.homedir(),'.cache/firebase/tools/lib/node_modules/firebase-tools/lib/bin/firebase.js')];
 try{candidates.push(require.resolve('firebase-tools/lib/bin/firebase.js'));}catch{}
 const cli=candidates.find(p=>p&&fs.existsSync(p));if(!cli)throw Error('Set RF_FIREBASE_CLI to the installed firebase-tools/lib/bin/firebase.js');return cli;
}
function emulatorCache(){return process.env.FIREBASE_EMULATORS_PATH||path.join(os.homedir(),'.cache/firebase/emulators');}
module.exports={cliPath,emulatorCache};
