'use strict';
// Deterministic migration of the audited reference. CSS, controls and placement
// remain source-owned; narrowly scoped changes below replace backend boundaries.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function generate(){
 let html=fs.readFileSync(path.join(root,'reference/Original_Index.html'),'utf8');
 const start=html.indexOf('// V16.3: verified company PIN'),end=html.indexOf('const ROCKETFIX_LOGO_URL');
 if(start<0||end<start)throw Error('Original authentication boundary changed');
 const auth=`let posAuthorized=false;
function setPOSAccess(profile){
 posAuthorized=!!profile;
 const label=document.getElementById('employeeBadge');label.hidden=!profile;
 if(!profile)return;
 label.textContent='Staff: '+profile.name;
 document.querySelector('nav [data-tab="settings"]').hidden=!['owner','admin'].includes(profile.role);
 startPOS();
}
`;
 html=html.slice(0,start)+auth+html.slice(end);
 html=html.replace(/<style>\s*\/\* Rocketfix secure workstation[\s\S]*?<\/style>/,'');
 const gateStart=html.indexOf('<div id="rfDeviceGate">'),gateEnd=html.indexOf('<aside id="rfPosUpdateBanner"');
 if(gateStart<0||gateEnd<gateStart)throw Error('Original login boundary changed');
 html=html.slice(0,gateStart)+fs.readFileSync(path.join(root,'tools/templates/login.html'),'utf8')+html.slice(gateEnd);
 html=html.replace('</head>','<style>'+fs.readFileSync(path.join(root,'tools/templates/login.css'),'utf8')+'</style></head>');
 html=html.replaceAll('<?= rfPosWebUrl ?>','/');
 html=html.replaceAll('Save Remittance (LIVE)','Save Remittance').replaceAll('Update Transaction (LIVE)','Update Transaction');
 html=html.replaceAll('Saving to Google Sheets','Saving remittance').replace('waiting list checks Google Sheets','waiting list checks the saved payment');
 html=html.replace('Viber Channel delivery is a separate scheduled step.','Email and Viber sending are disabled.');
 html=html.replace('The original Viber-connected project reports it automatically.','Email and Viber sending are disabled.');
 html=html.replace('stored in your account’s live Drive folder.','available after the staging Drive folder is connected.');
 html=html.replace('Stored in your account’s live Drive folder.','Drive upload is not connected yet.');
 html=html.replace('It will upload to Google Drive when you save.','Drive upload is not connected yet; no payment will be saved with this attachment.');
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
 // Replace the Apps Script-shaped business transport; no device token or Google runtime remains.
 html=html.replaceAll('.rfDeviceCall(rfDeviceToken,','.execute(')
  .replaceAll('google.script.run','window.posAPI.run')
  .replaceAll('window.google?.script?.run','window.posAPI?.run')
  .replaceAll(' || !rfDeviceToken','').replaceAll('||!rfDeviceToken','')
  .replaceAll('rfDeviceReady','posAuthorized').replaceAll('rfDeviceStartApp','startPOS')
  .replaceAll('rfDeviceUser','employeeBadge').replaceAll('rfDeviceInit();','');
 html=html.replace('// Device authorization controls all POS startup calls and refresh timers.','// Firebase staff authorization controls business data refreshes.');
 return html.replace(/[ \t]+$/gm,'');
}
if(require.main===module)fs.writeFileSync(path.join(root,'public/index.html'),generate());
module.exports={generate};
