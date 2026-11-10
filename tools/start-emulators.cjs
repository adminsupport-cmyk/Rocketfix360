'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'.runtime/run');require('node:fs').mkdirSync(runtime,{recursive:true});
const cli=require('./firebase-cli.cjs').cliPath();
const run=spawnSync(process.execPath,[cli,'--config',path.join(root,'firebase.json'),'emulators:start','--project','demo-rocketfix-360','--only','auth,firestore,functions,hosting'],{cwd:runtime,stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:path.join(root,'.runtime/firebase'),FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FIREBASE_EMULATORS_PATH:require('./firebase-cli.cjs').emulatorCache()}});process.exit(run.status??1);
