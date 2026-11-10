'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const tls=require('node:tls'),https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {sendEmail,sendViber}=require('../functions/provider-adapters');
let directory,key,cert;
before(()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'rocketfix-local-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
 key=fs.readFileSync(path.join(directory,'key.pem'));cert=fs.readFileSync(path.join(directory,'cert.pem'));
});
after(()=>{if(directory)fs.rmSync(directory,{recursive:true,force:true});});
test('real Nodemailer completes authenticated SMTP against a trusted local TLS server',async t=>{
 let data='',authenticated=false;const sockets=new Set();
 const server=tls.createServer({key,cert},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setEncoding('utf8');socket.write('220 localhost ESMTP fixture\r\n');let buffer='',inData=false;
  socket.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+2);
   if(inData){if(line==='.') {inData=false;socket.write('250 2.0.0 accepted locally\r\n');}else data+=line+'\n';continue;}
   if(/^EHLO/.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 1048576\r\n');
   else if(/^AUTH PLAIN/.test(line)){authenticated=true;socket.write('235 2.7.0 authenticated\r\n');}
   else if(/^DATA/.test(line)){inData=true;socket.write('354 End with dot\r\n');}
   else if(/^QUIT/.test(line)){socket.end('221 Bye\r\n');}
   else socket.write('250 OK\r\n');
  }});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));});
 const nodemailer=require('../functions/node_modules/nodemailer');
 const result=await sendEmail({to:'fixture@example.invalid',subject:'Local fixture',html:'<p>No external send</p>'},{eventId:'local-smtp-fixture'},{smtpHost:'smtp.example.invalid',smtpPort:'465',smtpFrom:'staging@example.invalid',smtpUser:'fixture-user',smtpPass:'fixture-password'},{createTransport:options=>nodemailer.createTransport({...options,host:'127.0.0.1',port:server.address().port,tls:{...options.tls,servername:'localhost',ca:cert}})});
 assert.equal(result.provider,'SMTP');assert.equal(authenticated,true);assert.match(data,/No external send/);assert.match(data,/Message-ID:\s+<rocketfix-/);
});
test('Viber adapter sends the expected channel payload over trusted local HTTPS only',async t=>{
 let body;
 const server=https.createServer({key,cert},(req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{body=JSON.parse(raw);res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":0,"message_token":"local-acceptance"}');});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const fetchImpl=async(url,options)=>{assert.equal(url,'https://chatapi.viber.com/pa/post');return new Promise((resolve,reject)=>{
 const req=https.request({hostname:'127.0.0.1',port:server.address().port,path:'/pa/post',method:options.method,headers:options.headers,signal:options.signal,ca:cert,servername:'localhost',rejectUnauthorized:true},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>resolve(new Response(raw,{status:res.statusCode})));});req.on('error',reject);req.end(options.body);
 });};
 const result=await sendViber({text:'Local channel fixture'},{eventId:'local-viber-fixture'},{viberToken:'local-fixture-token',viberSender:'local-sender'},{fetchImpl});assert.equal(result.id,'local-acceptance');assert.equal(body.auth_token,'local-fixture-token');assert.equal(body.text,'Local channel fixture');
});
