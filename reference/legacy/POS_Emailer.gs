/**
 * ROCKETFIX POS — CUSTOMER CONFIRMATION EMAILER (v7.1 — corrected verification for automatic tracking template)
 * Standalone add-on. DO NOT replace Code.gs, Directory.gs, Index.html,
 * HistoricalReporting.gs, TransactionMailer.gs, or the Tracking emailer.
 *
 * SAFE BY DEFAULT: sending is OFF. Existing historical POS rows are excluded.
 * 1 combined branded confirmation per newly created SYNCED POS transaction.
 * New customer emails are read from POS Ledger, originally entered in POS / REMIT.
 *
 * PROJECT SCRIPT PROPERTIES:
 *   RF_POS_EMAIL_TRACKING_URL      The verified LIVE unified tracking page URL.
 *   RF_POS_EMAIL_LEGACY_DISABLED_CONFIRMED = YES (only after old mailers off)
 *   RF_POS_EMAIL_REPLY_TO          Optional official support email
 *   RF_POS_EMAIL_ENABLED           Set by posEmailEnableNewOrders(), default FALSE
 *   RF_POS_EMAIL_ACTIVATED_AT      Set by posEmailInitializeOnce() (do not edit)
 *
 * BEFORE ENABLING: In the separate Master Sheet Apps Script project, disable
 * RF_TX_SEND_ENABLED and RF_TRACKING_EMAILS_ENABLED (and any other sender).
 * Merely removing triggers in THIS POS project does not disable Master scripts.
 */
const RF_POS_EMAIL_V1 = Object.freeze({
  logTab:'POS Email Delivery Log',
  headers:['Created At','POS ID','Customer Email','State','Sent At','Error','Subject'],
  enabled:'RF_POS_EMAIL_ENABLED',
  activated:'RF_POS_EMAIL_ACTIVATED_AT',
  track:'RF_POS_EMAIL_TRACKING_URL',
  legacyAck:'RF_POS_EMAIL_LEGACY_DISABLED_CONFIRMED',
  replyTo:'RF_POS_EMAIL_REPLY_TO',
  worker:'posEmailProcessNewOrders'
});
function posEmailProps_(){return PropertiesService.getScriptProperties();}
function posEmailEscape_(v){return String(v===null||v===undefined?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
/**
 * Attach the exact Rocketfix logo as an inline MIME image (CID), not a hotlinked URL.
 * Most Gmail/Apple Mail clients handle CID logo more reliably than remote images.
 * Failure returns null; an existing remote URL is then used as a graceful fallback.
 */
function posEmailLogoBlob_(){
  const url='https://res.cloudinary.com/dgu2kmk8y/image/upload/v1793440407/LOGO.png';
  try {
    const response=UrlFetchApp.fetch(url,{followRedirects:true,muteHttpExceptions:true});
    const status=response.getResponseCode();
    const blob=response.getBlob();
    const bytes=blob.getBytes();
    const ct=String(blob.getContentType()||'').toLowerCase();
    if(status!==200||!/^image\/(png|jpeg|webp)/.test(ct)||!bytes.length||bytes.length>2*1024*1024){
      console.warn('Logo download not usable: HTTP '+status+', MIME '+ct+', size '+bytes.length);
      return null;
    }
    // MailApp inlineImages supports PNG and JPEG reliably. Do not silently convert WebP.
    if(ct.indexOf('webp')>=0){console.warn('Logo is WebP, keeping external fallback.');return null;}
    return blob.setName('rocketfix-logo.'+(ct.indexOf('jpeg')>=0?'jpg':'png'));
  } catch(err){console.warn('Rocketfix logo could not be embedded: '+err);return null;}
}
function posEmailBuildSendArgs_(to,mail,replyTo){
  const logo=posEmailLogoBlob_();
  const args={to:to,subject:mail.subject,body:mail.body,htmlBody:mail.html.replace('RF_LOGO_SRC',logo?'cid:rfEmailLogo':'https://res.cloudinary.com/dgu2kmk8y/image/upload/v1793440407/LOGO.png'),name:'Rocketfix Editing Services'};
  if(logo)args.inlineImages={rfEmailLogo:logo};
  if(replyTo&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo))args.replyTo=replyTo;
  return args;
}
function posEmailMoney_(v){return '₱'+Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function posEmailConfig_(){
  const p=posEmailProps_();
  return {enabled:p.getProperty(RF_POS_EMAIL_V1.enabled)==='TRUE',activated:p.getProperty(RF_POS_EMAIL_V1.activated)||'',track:p.getProperty(RF_POS_EMAIL_V1.track)||'',legacyAck:p.getProperty(RF_POS_EMAIL_V1.legacyAck)||'',replyTo:p.getProperty(RF_POS_EMAIL_V1.replyTo)||''};
}
function posEmailLog_(){
  const ss=SpreadsheetApp.openById(POS_MASTER_ID);
  let s=ss.getSheetByName(RF_POS_EMAIL_V1.logTab);
  if(!s){s=ss.insertSheet(RF_POS_EMAIL_V1.logTab);s.getRange(1,1,1,RF_POS_EMAIL_V1.headers.length).setValues([RF_POS_EMAIL_V1.headers]);s.setFrozenRows(1);}
  const got=s.getRange(1,1,1,RF_POS_EMAIL_V1.headers.length).getDisplayValues()[0];
  if(got.join('|')!==RF_POS_EMAIL_V1.headers.join('|'))throw new Error('Email log headers were modified; halted for safety.');
  return s;
}
/** Setup only. Will NOT send any emails. Existing historical orders excluded. */
function posEmailInitializeOnce(){
  posRequireAuth_();
  const p=posEmailProps_();posEmailLog_();
  if(!p.getProperty(RF_POS_EMAIL_V1.activated))p.setProperty(RF_POS_EMAIL_V1.activated,new Date().toISOString());
  if(!p.getProperty(RF_POS_EMAIL_V1.enabled))p.setProperty(RF_POS_EMAIL_V1.enabled,'FALSE');
  return 'Initialized. Emails OFF. Future new orders only, after '+p.getProperty(RF_POS_EMAIL_V1.activated);
}
function posEmailSubject_(){return 'Your Rocketfix Order Is Confirmed!';}
function posEmailIds_(record){
  const items=Array.isArray(record.items)?record.items:[];
  return {ed:items.filter(x=>x.kind==='editing'&&x.existingId).map(x=>String(x.existingId)),fr:items.filter(x=>x.kind==='frame'&&x.existingId).map(x=>String(x.existingId))};
}
function posEmailRender_(r,trackingUrl){
  const e=posEmailEscape_, money=posEmailMoney_, ids=posEmailIds_(r);
  const logo='RF_LOGO_SRC';
  // Share only the non-sensitive order ID in the link. The website must implement this parameter.
  const trackLink=id=>{const sep=trackingUrl.indexOf('?')>=0?'&':'?';return trackingUrl+sep+'orderId='+encodeURIComponent(String(id));};
  const row=(label,val)=>'<tr><td style="padding:10px 2px;color:#718178;font-size:13px;vertical-align:top">'+e(label)+'</td><td style="padding:10px 2px;color:#24342a;font-size:14px;font-weight:700;text-align:right;vertical-align:top">'+e(val)+'</td></tr>';
  // Full-width ID cards for narrow mobile email clients; no inline image icons, emoji or JS.
  const card=(kind,id)=>{
    const green=kind==='Editing',color=green?'#176f4b':'#744aa2',tint=green?'#f1faf5':'#f7f1fc',line=green?'#b9e4cb':'#dfc9ed';
    return '<tr><td style="padding:5px 0 9px">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid '+line+';background:'+tint+';border-radius:12px">'+
      '<tr><td align="center" style="padding:18px 14px 5px;color:#596b60;font-size:11px;font-weight:bold;letter-spacing:1px">'+kind.toUpperCase()+' ORDER ID</td></tr>'+
      '<tr><td align="center" style="padding:5px 12px 9px">'+
       '<span style="display:inline-block;max-width:100%;font-size:28px;line-height:1.25;font-weight:800;letter-spacing:.4px;color:'+color+';overflow-wrap:anywhere;word-break:break-word">'+e(id)+'</span></td></tr>'+
      '<tr><td align="center" style="padding:2px 14px 18px">'+
        '<a href="'+e(trackLink(id))+'" style="display:inline-block;border:1px solid #0c4f35;background:#0c4f35;border-radius:6px;padding:10px 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:.7px;text-decoration:none">TRACK THIS ID</a>'+
        '<div style="padding-top:9px;color:#6c7c71;font-size:11px;line-height:1.4">Or tap and hold the ID above to copy</div>'+
      '</td></tr></table></td></tr>';
  };
  const idRows=[...ids.ed.map(x=>card('Editing',x)),...ids.fr.map(x=>card('Frame',x))].join('');
  const items=(Array.isArray(r.items)?r.items:[]).map(i=>{
    const service=i.kind==='frame'?'Frame · '+String(i.size||i.design||'Frame'):String(i.orderType||'Photo Editing')+(i.fileType?' · '+i.fileType:'');
    return '<tr><td style="padding:9px 2px;color:#35463d;font-size:13px">'+e(service)+'</td><td style="padding:9px 2px;text-align:right;color:#35463d;font-size:13px">'+e(money(i.amount))+'</td></tr>';
  }).join('');
  const discount=Number(r.discount||0)>0?row('Discount','−'+money(r.discount)) : '';
  const tip=Number(r.tip||0)>0?row('Tip',money(r.tip)) : '';
  const fullName=String((r.first||'')+' '+(r.last||'')).trim();
  const safeUrl=e(trackingUrl);
  const html='<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f2f5f2;font-family:Arial,Helvetica,sans-serif;color:#24342a">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f2"><tr><td align="center" style="padding:26px 12px">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e1eae3;border-radius:16px">'+
    '<tr><td align="center" style="background:#05291d;padding:26px 18px 22px;border-bottom:1px solid #05291d"><img src="'+logo+'" alt="Rocketfix Editing Services" width="225" style="display:block;width:225px;max-width:100%;height:auto;margin:0 auto;border:0"></td></tr>'+  
    '<tr><td align="center" style="padding:25px 26px 8px"><div style="font-size:28px;font-weight:800;color:#153f2d">Order Confirmed!</div><p style="font-size:14px;line-height:1.6;color:#66796f">We have received your payment and recorded your order.</p></td></tr>'+ 
    '<tr><td style="padding:9px 30px"><p style="font-size:15px;line-height:1.8;margin:0">Hi <strong>'+e(r.first||'Customer')+'</strong>,</p><p style="font-size:14px;line-height:1.8;color:#45584c">Thank you for choosing Rocketfix Editing Services. Please keep your order ID and use our website to follow your order progress.</p></td></tr>'+ 
    '<tr><td style="padding:10px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'+idRows+'</table></td></tr>'+  
    '<tr><td style="padding:12px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef8f0;border:1px solid #d4e9dc;border-radius:13px"><tr><td align="center" style="padding:23px 15px"><div style="font-size:19px;font-weight:800;color:#175c3a">Track Your Order Online</div><p style="color:#4b6855;font-size:13px;line-height:1.7">Enter either your Editing or Frame Order ID on our official website to check your latest available status.</p><a href="'+safeUrl+'" style="display:inline-block;padding:16px 28px;background:#19754a;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;border-radius:9px">TRACK MY ORDER</a><p style="font-size:12px;color:#577260;margin:15px 0 0">Tap a TRACK THIS ID button or enter an Order ID above.</p></td></tr></table></td></tr>'+ 
    '<tr><td style="padding:10px 30px 17px"><h3 style="font-size:17px;color:#1c4731">Payment &amp; Order Summary</h3><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4eae4">'+
    row('POS Reference',r.posId||'—')+row('Customer',fullName)+row('Payment Date',r.paymentDate||'—')+row('Payment Method',r.method||'—')+items+discount+tip+
    '<tr><td style="padding:15px 2px;border-top:1px solid #dae9dd;font-weight:800;color:#194a2e">Amount Paid</td><td style="padding:15px 2px;border-top:1px solid #dae9dd;text-align:right;font-size:21px;font-weight:800;color:#177247">'+e(money(r.received))+'</td></tr>'+ 
    '</table></td></tr><tr><td style="padding:12px 30px 26px"><p style="font-size:14px;line-height:1.8;color:#55685a">For order progress, please check our website using the IDs above. Thank you for trusting Rocketfix to preserve your meaningful memories.</p><p style="font-size:13px;color:#435849">Warm regards,<br><strong>Rocketfix Editing Services</strong></p></td></tr>'+ 
    '<tr><td align="center" style="background:#f4f7f4;padding:19px 18px;border-radius:0 0 16px 16px;color:#7b8b7f;font-size:11px">This is an automated order confirmation from Rocketfix Editing Services.<br><span style="color:#8d9b90;font-size:10px">Email template V7 · Direct Order Tracking</span></td></tr>'+ 
    '</table></td></tr></table></body></html>';
  const body=['Your Rocketfix Order Is Confirmed!','', 'Hi '+(r.first||'Customer')+',','Thank you for your payment.','POS ID: '+r.posId,
    ...ids.ed.map(x=>'Editing Order ID: '+x),...ids.fr.map(x=>'Frame Order ID: '+x),
    'Paid: '+money(r.received),'Track your Editing or Frame order: '+trackingUrl,'You can open your order directly from the links below:',...ids.ed.map(x=>x+' — '+trackLink(x)),...ids.fr.map(x=>x+' — '+trackLink(x)),'— Rocketfix Editing Services'].join('\n');
  return {subject:posEmailSubject_(),html,body};
}
/** Owner preview: sends ONE TEST email to the signed-in admin ONLY. Never to clients. */
function posEmailSendPreviewToSelf(){
  const admin=posRequireAuth_();
  const cfg=posEmailConfig_();
  const url=cfg.track||'https://www.rocketfixofficial.com/track-my-order-1';
  const sample={posId:'12345678',first:'Juan',last:'Dela Cruz',email:admin,paymentDate:'2026-10-31',method:'GCash',received:3500,discount:200,tip:100,items:[
    {kind:'editing',existingId:'RF11978P',orderType:'Family',amount:1700,fileType:'NORMAL FILE'},
    {kind:'frame',existingId:'X7K9',size:'18"x26.5" - Large',amount:1900}]};
  const mail=posEmailRender_(sample,url);
  const args=posEmailBuildSendArgs_(admin,mail,'');
  args.subject='[V7 DESIGN TEST] '+mail.subject;
  MailApp.sendEmail(args);
  return 'Preview emailed to signed-in POS admin. NO customer email was sent.';
}
function posEmailEnableNewOrders(){
  posRequireAuth_();
  const cfg=posEmailConfig_();
  if(!cfg.activated)throw new Error('Run posEmailInitializeOnce() first.');
  if(cfg.legacyAck!=='YES')throw new Error('STOP: Confirm Master Sheet editing & frame customer emailers are DISABLED. Then set RF_POS_EMAIL_LEGACY_DISABLED_CONFIRMED=YES.');
  if(!/^https:\/\/[^\s]+$/i.test(cfg.track))throw new Error('Set RF_POS_EMAIL_TRACKING_URL to the VERIFIED live unified tracker before enabling.');
  const others=ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()===RF_POS_EMAIL_V1.worker);
  if(!others.length)ScriptApp.newTrigger(RF_POS_EMAIL_V1.worker).timeBased().everyMinutes(1).create();
  posEmailProps_().setProperty(RF_POS_EMAIL_V1.enabled,'TRUE');
  return 'POS emailer enabled. Only new, SYNCED POS transactions created after initialization.';
}
function posEmailDisable(){
  posRequireAuth_();
  posEmailProps_().setProperty(RF_POS_EMAIL_V1.enabled,'FALSE');
  ScriptApp.getProjectTriggers().filter(x=>x.getHandlerFunction()===RF_POS_EMAIL_V1.worker).forEach(t=>ScriptApp.deleteTrigger(t));
  return 'POS emailer disabled. Log preserved.';
}
/** Trigger worker. No historical send, no test archives, no automatic resends. */
function posEmailProcessNewOrders(){
  const cfg=posEmailConfig_();
  if(!cfg.enabled||cfg.legacyAck!=='YES'||!cfg.activated||!/^https:\/\//i.test(cfg.track))return 'Disabled or incomplete settings.';
  const activated=Date.parse(cfg.activated);
  if(!Number.isFinite(activated))throw new Error('Activation time invalid. Stop.');
  const book=SpreadsheetApp.openById(POS_MASTER_ID),ledger=book.getSheetByName('POS Ledger');
  if(!ledger)throw new Error('POS Ledger missing');
  const log=posEmailLog_();
  const size=ledger.getLastRow()-1;
  if(size<1)return 'No ledger transactions.';
  const rows=ledger.getRange(2,1,size,16).getValues();
  const already=log.getLastRow()>1?log.getRange(2,2,log.getLastRow()-1,1).getDisplayValues().flat():[];
  const claimed=new Set(already.map(String));
  let processed=0,skippedBusy=0;
  for(let i=0;i<rows.length&&processed<10;i++){
    const v=rows[i],id=String(v[0]||'').trim();
    if(!/^\d{8}$/.test(id)||String(v[13]||'').trim()!=='SYNCED'||claimed.has(id))continue;
    const created=Date.parse(String(v[2]||''));
    if(!Number.isFinite(created)||created<activated)continue;
    let r;try{r=JSON.parse(String(v[15]||'{}'));}catch(e){continue;}
    if(r.deletedAt||String(r.posId)!==id)continue;
    const email=String(v[5]||r.email||'').trim();
    if(MailApp.getRemainingDailyQuota()<1)return 'Email daily quota exhausted; remaining orders wait.';
    // Only the log claim needs the global lock. NEVER hold it during MailApp,
    // remote-logo fetch, template rendering or other network operations.
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(1200)){skippedBusy++;return 'POS busy; will check next minute. Pending '+(rows.length-i)+' rows.';}
    let logRow=-1;
    try{
      const last=log.getLastRow();
      const fresh=last>1?log.getRange(2,2,last-1,1).getDisplayValues().flat():[];
      if(fresh.some(x=>String(x)===id)){claimed.add(id);continue;}
      // Ensure the transaction did not become deleted between snapshot and claim.
      const ledgerNow=ledger.getRange(i+2,1,1,14).getValues()[0];
      if(String(ledgerNow[0])!==id||String(ledgerNow[13])!=='SYNCED')continue;
      logRow=last+1;
      if(logRow>log.getMaxRows())log.insertRowsAfter(log.getMaxRows(),Math.max(100,logRow-log.getMaxRows()));
      log.getRange(logRow,1,1,7).setValues([[new Date(),id,email,/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'SENDING':'INVALID_EMAIL','',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'':'Recipient address missing or invalid',posEmailSubject_()]]);
      SpreadsheetApp.flush();
      claimed.add(id);
    }finally{lock.releaseLock();}
    if(logRow<0)continue;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))continue;
    try{
      const mail=posEmailRender_(r,cfg.track);
      const args=posEmailBuildSendArgs_(email,mail,cfg.replyTo);
      MailApp.sendEmail(args);
      log.getRange(logRow,4,1,3).setValues([['SENT',new Date(),'']]);
    }catch(err){
      // Ambiguous delivery: log for manual investigation; never blindly resend.
      log.getRange(logRow,4,1,3).setValues([['REVIEW','',String(err&&err.message||err).slice(0,400)]]);
    }
    processed++;
  }
  return 'Processed '+processed+' new POS emails; lock busy '+skippedBusy+'.';
}
/**
 * Read-only check to identify a stale or duplicate template function.
 * Run this after replacing the script, before sending a preview.
 */
function posEmailVerifyInstalledTemplateV7(){
  posRequireAuth_();
  const sample={posId:'12345678',first:'Preview',last:'Customer',received:1500,items:[
    {kind:'editing',existingId:'RF11978P',orderType:'Family',amount:900},
    {kind:'frame',existingId:'X7K9',size:'18\"x26.5\" - Large',amount:600}
  ]};
  const mail=posEmailRender_(sample,'https://www.rocketfixofficial.com/track-my-order-1');
  const checks={
    version7:mail.html.includes('Email template V7'),
    trackingButtons:(mail.html.match(/>TRACK THIS ID<\/a>/g)||[]).length===2,
    editingLink:mail.html.includes('orderId=RF11978P'),
    frameLink:mail.html.includes('orderId=X7K9'),
    trackingMainButton:mail.html.includes('TRACK MY ORDER'),
    isCurrentWorkerConfigured:RF_POS_EMAIL_V1.worker==='posEmailProcessNewOrders'
  };
  console.log(JSON.stringify(checks,null,2));
  if(Object.values(checks).some(v=>v!==true))throw new Error('Template check failed. Review the printed check results to see which condition is false.');
  return checks;
}
