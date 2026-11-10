'use strict';
// Deterministic migration of the audited reference. CSS, controls and placement
// remain source-owned; narrowly scoped changes below replace backend boundaries.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function generate(){
 const version=require('node:crypto').createHash('sha256');
 for(const file of ['public/app.js','public/legacy-adapter.cjs','public/config.js','package-lock.json','reference/Original_Index.html','tools/templates/login.html','tools/templates/login.css','tools/restore-original-ui.cjs','tools/templates/modern.html','tools/templates/modern.css','tools/templates/settings.html','public/workspace.js','public/modern.js','public/proofs.js'])version.update(fs.readFileSync(path.join(root,file)));
 const assetVersion=version.digest('hex').slice(0,16);
 let html=fs.readFileSync(path.join(root,'reference/Original_Index.html'),'utf8');
 const start=html.indexOf('// V16.3: verified company PIN'),end=html.indexOf('const ROCKETFIX_LOGO_URL');
 if(start<0||end<start)throw Error('Original authentication boundary changed');
 const auth=`let posAuthorized=false;
function loadPaymentCorrection(record){const fixture=document.getElementById('fixtureMode');if(fixture)fixture.checked=record.stagingTest===true;const index=tx.findIndex(o=>o.posId===record.posId);if(index>=0)tx[index]=record;else tx.unshift(record);editRecord(record.posId);}
function updateHistoryRecords(records){tx=records;renderReports();}
function acceptCommittedReceipt(record){const index=tx.findIndex(o=>o.posId===record.posId);if(index>=0)tx[index]=record;else tx.unshift(record);resetForm();renderReports();rfRefreshLive(true);}
function setPOSAccess(profile){
 posAuthorized=!!profile;
 const label=document.getElementById('employeeBadge');label.hidden=!profile;
 if(!profile)return;
 label.textContent='Staff: '+profile.name;
 document.querySelector('nav [data-tab="settings"]').hidden=!['owner','admin'].includes(profile.role);
 startPOS();window.modernPOS?.authorized();
}
`;
 html=html.slice(0,start)+auth+html.slice(end);
 html=html.replace(/<style>\s*\/\* Rocketfix secure workstation[\s\S]*?<\/style>/,'');
 const gateStart=html.indexOf('<div id="rfDeviceGate">'),gateEnd=html.indexOf('<aside id="rfPosUpdateBanner"');
 if(gateStart<0||gateEnd<gateStart)throw Error('Original login boundary changed');
 html=html.slice(0,gateStart)+fs.readFileSync(path.join(root,'tools/templates/login.html'),'utf8')+html.slice(gateEnd);
 html=html.replace(/<title>[^<]*<\/title>/,'<title>Rocketfix360 · Admin Workspace</title>');
 html=html.replace('</head>','<style>'+fs.readFileSync(path.join(root,'tools/templates/login.css'),'utf8')+'</style></head>');
 html=html.replaceAll('<?= rfPosWebUrl ?>','/');
 html=html.replaceAll('Save Remittance (LIVE)','Save Remittance').replaceAll('Update Transaction (LIVE)','Update Transaction');
 html=html.replaceAll('Saving to Google Sheets','Saving remittance').replace('waiting list checks Google Sheets','waiting list checks the saved payment');
 html=html.replace('Viber Channel delivery is a separate scheduled step.','Email and Viber sending are disabled.');
 html=html.replace('The original Viber-connected project reports it automatically.','Email and Viber sending are disabled.');
 html=html.replace('Viber reporting is handled by the original remittance project. Payment will be saved first, then queued for Viber; delivery is not yet confirmed.','External Viber delivery is disabled. Payment is saved independently.');
 html=html.replace('Viber is waiting for the original sender. No new payment needed.','External Viber delivery is disabled. No new payment needed.');
 html=html.replace('stored in your account’s live Drive folder.','available after the staging Drive folder is connected.');
 html=html.replace('Stored in your account’s live Drive folder.','Private Google Drive upload; up to 25 MB.');
 html=html.replace('It will upload to Google Drive when you save.','Upload will be verified in Google Drive before saving.');
 html=html.replace('.withFailureHandler(err=>rfHandleAmbiguousSave(job,err))',`.withFailureHandler(err=>['functions/unavailable','functions/deadline-exceeded','functions/internal'].includes(err.code)?rfHandleAmbiguousSave(job,err):rfFailJob(job,err))`);
 html=html.replace("if(state==='SENT'||state==='ALREADY_RECORDED'){","if(state==='DISABLED'||state==='SIMULATED'||state==='SENT'||state==='ALREADY_RECORDED'){");
 html=html.replace("const viberText=state==='SENT'?'Viber report SENT.':","const viberText=['DISABLED','SIMULATED'].includes(state)?'Email and Viber sending are disabled.':state==='SENT'?'Viber report SENT.':");
 html=html.replace("vOnly.hidden=!(r.latePaymentRecorded","vOnly.hidden=true; /* External sending disabled. */ void (r.latePaymentRecorded");
 html=html.replace("c.fillText('PAYMENT CONFIRMED',540,278)","c.fillText(r.stagingTest?'FICTIONAL TEST ORDER':'PAYMENT CONFIRMED',540,278)");
 html=html.replace('editingId=id;editingVersion=r.updatedAt;',"if($('fixtureMode'))$('fixtureMode').checked=r.stagingTest===true;editingId=id;editingVersion=r.updatedAt;");
 html=html.replace('function rfLateSave(){',"function rfLateSave(){if(!window.firebasePOS?.fixtureMode){document.getElementById('rfLateMsg').textContent='Payment changes are unavailable while original business rules are being verified.';return;}");
 html=html.replace('function saveTransaction(){',`function saveTransaction(){
 if(!window.firebasePOS?.fixtureMode){const entered=totals();if(entered.items.some(i=>i.kind!=='editing'||i.frameOrderId))return rfNotify('Real payments are available for standalone editing orders only. Frame payments await verified pricing.',true);if(entered.discount||entered.tip||entered.shippingFee||Math.abs(entered.received-entered.due)>0.001)return rfNotify('Enter the exact agreed editing payment. Discounts, tips, Excess and shipping await approved rules.',true);}`);
 html=html.replace("amount:kind==='frame'?799:0", "amount:kind==='frame'&&window.firebasePOS?.fixtureMode?799:0");
 html=html.replace('function setFramePrice(uid,size){',`function setFramePrice(uid,size){
 if(!window.firebasePOS?.fixtureMode){const field=document.querySelector('[data-id="'+uid+'"][data-name="amount"]');if(field)field.value=0;compute();return;}`);
 html=html.replace("$('due').textContent=money(t.due);","$('due').textContent=!window.firebasePOS?.fixtureMode&&t.items.some(x=>x.kind==='frame')?'Awaiting approved quote':money(t.due);");
 html=html.replace("$('frameSum').textContent=money(t.frame);","$('frameSum').textContent=!window.firebasePOS?.fixtureMode&&t.items.some(x=>x.kind==='frame')?'Awaiting approved quote':money(t.frame);");
 html=html.replace("$('rfShippingQuote').innerHTML=b.length?", "$('rfShippingQuote').innerHTML=!window.firebasePOS?.fixtureMode&&b.length?'Pricing and shipping approval is pending. Customer quotations and payments are unavailable.':b.length?");
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
 html=html.replace(/<title>[^<]*<\/title>/,'<title>Rocketfix360 · Admin Workspace</title>');
 html=html.replace('</head>','<style>'+fs.readFileSync(path.join(root,'tools/templates/modern.css'),'utf8')+'</style></head>');
 html=html.replace(/<section class="tab" id="settings">[\s\S]*?<\/section>/,fs.readFileSync(path.join(root,'tools/templates/settings.html'),'utf8'));
 html=html.replace(/<nav>[\s\S]*?<\/nav>/,'<nav><button class="active" data-tab="dashboard">Dashboard</button><button data-tab="new">Admin POS</button><button data-tab="editingDatabase">Editing Database</button><button data-tab="frameDatabase">Frame Database</button><button data-tab="history">Remittances</button><button data-tab="daily">Reports</button><button data-tab="settings">Settings</button></nav>');
 html=html.replace('<span id="employeeBadge" hidden>Staff sign-in required</span>','<button type="button" id="employeeBadge" class="btn ghost" hidden>Staff sign-in required</button>');
 html=html.replace('rfRenderPricingSettings();rfUpdateShipping();}',"rfRenderPricingSettings();rfUpdateShipping();window.dispatchEvent(new Event('rf:pricing-loaded'));}");
 html=html.replace('<section class="tab active" id="new">','<section class="tab" id="new"><div class="panel"><label><input type="checkbox" id="fixtureMode" onchange="rfLoadFramePricing();compute()"> FICTIONAL STAGING TEST ONLY — no real payment; unverified fixture prices</label><p>Unchecked: real editing-only payment at the staff-entered agreed price, paid exactly. Discounts, tips, Excess and frame payments are not enabled. Checked: fictional tests only; use a TEST or SAMPLE name and N/A or .invalid email. Real payments do not send test Viber notifications or mirror to test Sheets.</p></div>');
 html=html.replace('</main>',fs.readFileSync(path.join(root,'tools/templates/modern.html'),'utf8')+'</main>');
 html=html.replace(/<div id="rfQueueDock"[\s\S]*?<div id="rfSubmitOverlay"/,'<div id="rfSubmitOverlay"');
 html=html.replaceAll('Save Remittance','Submit Remittance').replace('Your remittance will upload while you prepare the next order.','Payment confirmation waits only for the Firebase commit.');
 const queueStart=html.indexOf(' if(rfJobs.some(j=>j.record.posId===record.posId))');
 const queueEnd=html.indexOf('function resetForm()',queueStart);
 if(queueStart<0||queueEnd<0)throw Error('Remittance submit boundary changed');
 html=html.slice(0,queueStart)+" return window.modernPOS.submit(record,file);\n}\n"+html.slice(queueEnd);
 html=html.replace("$('historyRows').innerHTML=liveMatches.concat(legacyMatches,lateMatches).join('')", "const historyResults=liveMatches.concat(legacyMatches,lateMatches);window.workspaceHistoryPage=Math.min(window.workspaceHistoryPage||0,Math.max(0,Math.ceil(historyResults.length/25)-1));window.dispatchEvent(new CustomEvent('rf:page-rendered',{detail:{id:'historyRows',total:historyResults.length}}));$('historyRows').innerHTML=historyResults.slice(window.workspaceHistoryPage*25,window.workspaceHistoryPage*25+25).join('')");
 html=html.replace("$('dailyRows').innerHTML=daily.map(dailyLive).concat(legacy.map(dailyOld),lateRows).join('')", "const dailyResults=daily.map(dailyLive).concat(legacy.map(dailyOld),lateRows);window.workspaceReportPage=Math.min(window.workspaceReportPage||0,Math.max(0,Math.ceil(dailyResults.length/25)-1));window.dispatchEvent(new CustomEvent('rf:page-rendered',{detail:{id:'dailyRows',total:dailyResults.length}}));$('dailyRows').innerHTML=dailyResults.slice(window.workspaceReportPage*25,window.workspaceReportPage*25+25).join('')");
 html=html.replace('id="historySearch" oninput="renderReports()"','id="historySearch" oninput="clearTimeout(window.rfHistorySearchTimer);window.rfHistorySearchTimer=setTimeout(()=>{window.workspaceHistoryPage=0;renderReports()},180)"');
 // Late-letter submission uses the same direct Firebase result, never the old sheet queue.
 const lateStart=html.indexOf('function rfLateSave(){'),lateEnd=html.indexOf('function rfLateRepair(){',lateStart);
 html=html.slice(0,lateStart)+"function rfLateSave(){return window.modernPOS.submitLetter(rfLateOrder); }\n"+html.slice(lateEnd);
 html=html.replace('function resetForm(){',"function resetForm(){window.modernPOS?.resetSubmission();");
 html=html.replace('Transaction History</h1>','Remittances</h1>');

 return html.replace('src="/app.bundle.js"','src="/app.bundle.js?v='+assetVersion+'"').replace(/[ \t]+$/gm,'');
}
if(require.main===module)fs.writeFileSync(path.join(root,'public/index.html'),generate());
module.exports={generate};
