'use strict';
// Deterministic migration of the audited reference. CSS, controls and placement
// remain source-owned; narrowly scoped changes below replace backend boundaries.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function generate(){
 let html=fs.readFileSync(path.join(root,'reference/Original_Index.html'),'utf8');
 const start=html.indexOf('// V16.3: verified company PIN'),end=html.indexOf('const ROCKETFIX_LOGO_URL');
 if(start<0||end<start)throw Error('Original authentication boundary changed');
 const auth=`let rfDeviceReady=false,rfDeviceToken='';
function rfDeviceError(msg){document.getElementById('rfDeviceMsg').textContent=String(msg||'');}
function rfDeviceShowMode(mode,title,description){
 document.getElementById('rfDeviceLoading').hidden=mode!=='loading';document.getElementById('rfDeviceRegisterForm').hidden=mode!=='register';
 if(title)document.getElementById('rfDeviceLoadingTitle').textContent=title;
 if(description)document.getElementById('rfDeviceLoadingDescription').textContent=description;
 rfDeviceError('');
}
function rfFirebaseSession(profile,error){
 rfDeviceReady=!!profile;rfDeviceToken=profile?.uid||'';
 document.getElementById('rfDeviceGate').hidden=!!profile;
 document.getElementById('rfDeviceRequestButton').disabled=false;
 if(!profile){rfDeviceShowMode('register');rfDeviceError(error||'');return;}
 const label=document.getElementById('rfDeviceUser');label.hidden=false;label.textContent='Staff: '+profile.name;label.onclick=rfStaffSignOut;label.style.cursor='pointer';
 document.querySelector('nav [data-tab="settings"]').hidden=!['owner','admin'].includes(profile.role);
 rfDeviceStartApp();
}
async function rfDeviceStartRequest(){
 if(!window.firebasePOS)return rfDeviceError('Connection is starting. Please try again.');
 const btn=document.getElementById('rfDeviceRequestButton');if(btn.disabled)return;btn.disabled=true;
 rfDeviceShowMode('loading','Signing you in…','Verifying your employee account.');
 try{await window.firebasePOS.signIn(document.getElementById('rfDeviceNameInput').value.trim(),document.getElementById('rfCompanyPinInput').value);document.getElementById('rfCompanyPinInput').value='';}
 catch(error){btn.disabled=false;rfDeviceShowMode('register');rfDeviceError(error.message);}
}
function rfStaffSignOut(){if(confirm('Sign out and change staff?'))window.firebasePOS.signOut();}
function rfDeviceInit(){rfDeviceShowMode('loading','Starting staff session…','Connecting to Rocketfix POS…');}
`;
 html=html.slice(0,start)+auth+html.slice(end);
 html=html.replace('Enter your staff name and the company PIN. You will remain signed in for up to 24 hours on this browser.','Enter your employee email and password.');
 html=html.replace('24-HOUR SESSION','EMPLOYEE ACCESS').replace('>Staff name</label>','>Employee email</label>').replace('maxlength="60" autocomplete="name" placeholder="e.g. Joyce Legaspi"','type="email" maxlength="200" autocomplete="username" placeholder="Employee email"');
 html=html.replace('>Company PIN</label>','>Password</label>').replace('inputmode="numeric" pattern="[0-9]*" minlength="8" maxlength="12" autocomplete="off" placeholder="8–12 digit PIN"','autocomplete="current-password" placeholder="Password"');
 html=html.replace('For your security, the PIN is checked by the server and is never saved in this browser.','Use your authorized employee account.');
 html=html.replaceAll('<?= rfPosWebUrl ?>','/');
 html=html.replaceAll('Save Remittance (LIVE)','Save Remittance').replaceAll('Update Transaction (LIVE)','Update Transaction');
 html=html.replaceAll('Saving to Google Sheets','Saving remittance').replace('waiting list checks Google Sheets','waiting list checks the saved payment');
 html=html.replace('Viber Channel delivery is a separate scheduled step.','Email and Viber sending are disabled.');
 html=html.replace('The original Viber-connected project reports it automatically.','Email and Viber sending are disabled.');
 html=html.replace('stored in your account’s live Drive folder.','available after the staging Drive folder is connected.');
 html=html.replace('Stored in your account’s live Drive folder.','Drive upload is not connected yet.');
 html=html.replace('It will upload to Google Drive when you save.','Drive upload is not connected yet; no payment will be saved with this attachment.');
 html=html.replace('rfDeviceCall(rfDeviceToken,\'save\',[record,proof]);','rfDeviceCall(rfDeviceToken,\'save\',[record,proof]);');
 html=html.replace('.withFailureHandler(err=>rfHandleAmbiguousSave(job,err))',`.withFailureHandler(err=>['functions/unavailable','functions/deadline-exceeded','functions/internal'].includes(err.code)?rfHandleAmbiguousSave(job,err):rfFailJob(job,err))`);
 html=html.replace("if(state==='SENT'||state==='ALREADY_RECORDED'){","if(state==='DISABLED'||state==='SIMULATED'||state==='SENT'||state==='ALREADY_RECORDED'){");
 html=html.replace("const viberText=state==='SENT'?'Viber report SENT.':","const viberText=['DISABLED','SIMULATED'].includes(state)?'Email and Viber sending are disabled.':state==='SENT'?'Viber report SENT.':");
 html=html.replace("vOnly.hidden=!(r.latePaymentRecorded","vOnly.hidden=true; /* External sending disabled. */ void (r.latePaymentRecorded");
 html=html.replace('function rfLateSave(){',"function rfLateSave(){if(!window.firebasePOS?.isDemo){document.getElementById('rfLateMsg').textContent='Payment changes are unavailable while original business rules are being verified.';return;}");
 html=html.replace('function saveTransaction(){',`function saveTransaction(){
 if(!window.firebasePOS?.isDemo)return rfNotify('Saving is unavailable while original pricing and payment rules are being verified. No payment has been recorded.',true);`);
 html=html.replace("amount:kind==='frame'?799:0", "amount:kind==='frame'&&window.firebasePOS?.isDemo?799:0");
 html=html.replace('function setFramePrice(uid,size){',`function setFramePrice(uid,size){
 if(!window.firebasePOS?.isDemo){const field=document.querySelector('[data-id="'+uid+'"][data-name="amount"]');if(field)field.value=0;compute();return;}`);
 html=html.replace("$('due').textContent=money(t.due);","$('due').textContent=!window.firebasePOS?.isDemo&&t.items.some(x=>x.kind==='frame')?'Awaiting approved quote':money(t.due);");
 html=html.replace("$('frameSum').textContent=money(t.frame);","$('frameSum').textContent=!window.firebasePOS?.isDemo&&t.items.some(x=>x.kind==='frame')?'Awaiting approved quote':money(t.frame);");
 html=html.replace("$('rfShippingQuote').innerHTML=b.length?", "$('rfShippingQuote').innerHTML=!window.firebasePOS?.isDemo&&b.length?'Pricing and shipping approval is pending. Customer quotations and payments are unavailable.':b.length?");
 html=html.replace("rfSetLookupInfo('REMIT customer refresh failed: '+msg.slice(0,170));","rfSetLookupInfo('Customer directory import pending.');");
 html=html.replace("const RF_CUSTOMER_DIRECTORY_CACHE='rocketfix-pos-remit-customers-v25';", "const RF_CUSTOMER_DIRECTORY_CACHE='rocketfix-firebase-customers-parity-v1';");
 // Avoid stale customer PII crossing employee sign-ins; no legacy directory cache.
 html=html.replace("function rfSaveDirectoryCache(customers){", "function rfSaveDirectoryCache(customers){return; /* Directory caching disabled across identities. */");
 html=html.replace("if(!force){try{", "if(false){try{");
 html=html.replace('Settings & Sheet Mappings','Settings & Mappings').replace('Editable workflow design for the eventual Apps Script version.','Owner pricing controls.');
 html=html.replace('Shipping area and rates are saved in the private Master Sheet. Standard rates shown are from the current Rocketfix shipping reference.','Approved pricing values are required before customer quotations are available.');
 html=html.replace('DELETE POS \'+id+\' and its connected REMIT / Frame Orders records?', 'VOID POS \'+id+\' and its linked orders?');
 html=html.replace('Please wait while this order is removed from the connected sheets.', 'Please wait while this order is voided in the payment register.');
 // Release checks may never navigate back to the live Apps Script POS.
 const release=html.indexOf('// POS release notifier.');
 html=html.slice(0,release)+"</script><script type=\"module\" src=\"/app.bundle.js\"></script></body></html>\n";
 return html.replace(/[ \t]+$/gm,'');
}
if(require.main===module)fs.writeFileSync(path.join(root,'public/index.html'),generate());
module.exports={generate};
