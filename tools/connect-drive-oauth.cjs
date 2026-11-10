'use strict';
// One-time owner-operated consent. Credentials are read from the supplied local
// Desktop client file and written only to the staging Secret Manager secret.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{randomBytes}=require('node:crypto');
const PROJECT='rocketfix-360-staging',SECRET='RF_DRIVE_OAUTH',ACCOUNT='855901392227-compute@developer.gserviceaccount.com';
async function main(){
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--project'||args[1]!==PROJECT)throw Error('Usage: node tools/connect-drive-oauth.cjs --project rocketfix-360-staging /absolute/path/to/Desktop-client.json');
 const filename=path.resolve(args[2]),repo=path.resolve(__dirname,'..');if(filename.startsWith(repo+path.sep))throw Error('Keep the OAuth client file outside the repository');
 const installed=JSON.parse(fs.readFileSync(filename,'utf8')).installed;if(!installed?.client_id||!installed.client_secret||installed.project_id!==PROJECT)throw Error('A Desktop OAuth client JSON for rocketfix-360-staging is required');
 const {OAuth2Client}=require('../functions/node_modules/google-auth-library'),state=randomBytes(24).toString('hex'),server=http.createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const redirect='http://127.0.0.1:'+server.address().port+'/oauth/callback',oauth=new OAuth2Client(installed.client_id,installed.client_secret,redirect);
 const pkce=await oauth.generateCodeVerifierAsync();
 let timer;const codePromise=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Consent timed out; no connection saved')),300000);server.on('request',(req,res)=>{const url=new URL(req.url,redirect);if(url.pathname!=='/oauth/callback'||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid consent response');return;}if(url.searchParams.has('error')){res.end('Connection was not authorized. You can close this tab.');reject(Error('Google consent was declined'));return;}const code=url.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing consent code');return;}res.setHeader('Content-Security-Policy',"default-src 'none'");res.end('Authorization received. Return to the setup terminal to confirm the connection result.');resolve(code);});});
 try{
  console.log('Open this Google consent URL in your browser. Sign in with the account that owns the private proof folder:');console.log(oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive'],state,code_challenge:pkce.codeChallenge,code_challenge_method:'S256'}));
  const code=await codePromise,{tokens}=await oauth.getToken({code,codeVerifier:pkce.codeVerifier});if(!tokens.refresh_token)throw Error('No offline authorization returned; revoke the prior app consent and reconnect');
  await require('./staging-google.cjs').clients();const lib=path.resolve(path.dirname(require('./firebase-cli.cjs').cliPath()),'..'),auth=require(path.join(lib,'auth')),account=auth.getGlobalDefaultAccount();const access=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  // Direct fetch deliberately avoids Firebase CLI request-body debug logging.
  async function sm(url,method='GET',body){const r=await fetch('https://secretmanager.googleapis.com/v1'+url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Object.assign(Error('SECRET_MANAGER_REQUEST_FAILED'),{status:r.status});return r.json();}
  const name='/projects/'+PROJECT+'/secrets/'+SECRET;
  try{await sm(name);}catch(e){if(e.status!==404)throw Error('Cannot inspect staging secret');await sm('/projects/'+PROJECT+'/secrets?secretId='+SECRET,'POST',{replication:{automatic:{}}});}
  const payload=Buffer.from(JSON.stringify({client_id:installed.client_id,client_secret:installed.client_secret,refresh_token:tokens.refresh_token})).toString('base64');await sm(name+':addVersion','POST',{payload:{data:payload}});
  const iam=await sm(name+':getIamPolicy?options.requestedPolicyVersion=3'),bindings=iam.bindings||[],member='serviceAccount:'+ACCOUNT;let role=bindings.find(b=>b.role==='roles/secretmanager.secretAccessor'&&!b.condition);if(!role){role={role:'roles/secretmanager.secretAccessor',members:[]};bindings.push(role);}if(!role.members.includes(member))role.members.push(member);await sm(name+':setIamPolicy','POST',{policy:{...iam,bindings}});
  console.log('Staging OAuth connection saved securely. No token was printed or written to the repository. Open Payment Proof Storage, Test Connection, then Save Settings.');
 }finally{clearTimeout(timer);server.close();}
}
main().catch(()=>{console.error('Drive OAuth setup was not completed. Check the Desktop client/project, consent, and staging Secret Manager permissions. No credentials are included in this error.');process.exitCode=1;});
