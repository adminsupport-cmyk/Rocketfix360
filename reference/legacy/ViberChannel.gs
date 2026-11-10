/**
 * Rocketfix POS -> REMIT - RF Viber CHANNEL (not bot/private messaging).
 * New separate file: ViberChannel.gs. Keep working POS Code.gs unchanged.
 * Apps Script Project Settings > Script Properties:
 *   RF_VIBER_CHANNEL_TOKEN        = token from Channel > Developer Tools
 *   RF_VIBER_CHANNEL_WEBHOOK_URL  = an HTTPS webhook endpoint accepted by Viber
 * Do not put your token directly into source code.
 *
 * Order of operation:
 *  1. rfChCheckAccount()          -> validates token, stores first superadmin ID
 *  2. rfChRegisterWebhook()       -> registers VERIFIED external endpoint
 *  3. rfChSendTestMessage()       -> sends one harmless TEST message
 *  4. rfChEnableNewRemittances()  -> starts new orders only (no history)
 *
 * Do not use the older private bot posViberCheckNewOrders trigger alongside this.
 * Logs claims before sending; uncertain results are REVIEW, never blindly retried.
 * Google Drive proof is shown as a LINK last; only public direct .jpeg under 1 MB
 * may be posted as a photo, always after the text. The proof is sensitive—only
 * add trusted staff to the Channel.
 */
const RF_CH_CFG = Object.freeze({
  token: 'RF_VIBER_CHANNEL_TOKEN',
  webhook: 'RF_VIBER_CHANNEL_WEBHOOK_URL',
  sender: 'RF_VIBER_CHANNEL_SENDER_ID',
  activated: 'RF_VIBER_CHANNEL_ACTIVATED_AT',
  log: 'POS Viber Channel Log',
  header: ['Date', 'POS ID', 'Result', 'Text token', 'Photo token', 'Details']
});
function rfChProps_(){return PropertiesService.getScriptProperties();}
function rfChConfig_(){
  const p=rfChProps_();
  return {token:String(p.getProperty(RF_CH_CFG.token)||'').trim(),
    webhook:String(p.getProperty(RF_CH_CFG.webhook)||'').trim(),
    sender:String(p.getProperty(RF_CH_CFG.sender)||'').trim(),
    activated:String(p.getProperty(RF_CH_CFG.activated)||'').trim()};
}
function rfChRequest_(path,body){
  const res=UrlFetchApp.fetch('https://chatapi.viber.com/pa/'+path,{
    method:'post',contentType:'application/json',payload:JSON.stringify(body),
    muteHttpExceptions:true,followRedirects:true
  });
  const text=res.getContentText();let obj={};
  try{obj=JSON.parse(text);}catch(e){}
  if(res.getResponseCode()!==200||obj.status!==0){
    throw new Error('Viber '+path+' HTTP '+res.getResponseCode()+' status '+obj.status+': '+String(obj.status_message||'Request failed').slice(0,170));
  }
  return obj;
}
/** Verifies Channel token and captures the first superadmin sender ID. */
function rfChCheckAccount(){
  const cfg=rfChConfig_();if(!cfg.token)throw new Error('Set RF_VIBER_CHANNEL_TOKEN in Script Properties first.');
  const info=rfChRequest_('get_account_info',{auth_token:cfg.token});
  const admins=(info.members||[]).filter(m=>String(m.role).toLowerCase()==='superadmin'&&m.id);
  if(!admins.length)throw new Error('No superadmin sender ID in Channel account info.');
  const chosen=admins[0];rfChProps_().setProperty(RF_CH_CFG.sender,String(chosen.id));
  return {channel:info.chat_hostname||info.name||'Channel',senderName:chosen.name||'Superadmin',
    senderIdStored:true,superadminCount:admins.length};
}
/** Requires a public Viber-compatible webhook, NOT the Apps Script /exec URL if it redirects. */
function rfChRegisterWebhook(){
  const cfg=rfChConfig_();
  if(!cfg.token)throw new Error('Channel token is missing.');
  if(!/^https:\/\//i.test(cfg.webhook))throw new Error('Set RF_VIBER_CHANNEL_WEBHOOK_URL to a valid HTTPS receiver first.');
  const res=rfChRequest_('set_webhook',{url:cfg.webhook,auth_token:cfg.token});
  return 'Webhook registered successfully: '+String(res.status_message||'ok');
}
function rfChPost_(payload){const c=rfChConfig_();if(!c.token||!c.sender)throw new Error('Run rfChCheckAccount first.');
  return rfChRequest_('post',Object.assign({auth_token:c.token,from:c.sender},payload));}
/** Sends precisely one test to the live Channel when run manually. */
function rfChSendTestMessage(){
  const r=rfChPost_({type:'text',text:'✅ Rocketfix POS connection test\nThis is a test message only. No remittance was processed.'});
  return 'Test message accepted by Viber: '+String(r.message_token||'');
}
function rfChLog_(){
  const book=SpreadsheetApp.openById(POS_MASTER_ID);
  let sh=book.getSheetByName(RF_CH_CFG.log);
  if(!sh){sh=book.insertSheet(RF_CH_CFG.log);sh.getRange(1,1,1,6).setValues([RF_CH_CFG.header]);sh.setFrozenRows(1);}
  else if(sh.getRange(1,1,1,6).getDisplayValues()[0].join('|')!==RF_CH_CFG.header.join('|'))
    throw new Error('Existing Viber Channel log has different headers. Stopped.');
  return sh;
}
/** Safe one-time activation: only orders created AFTER this call will be posted. */
function rfChEnableNewRemittances(){
  const cfg=rfChConfig_();
  if(!cfg.token||!cfg.sender)throw new Error('Run rfChCheckAccount first.');
  rfChLog_();
  const p=rfChProps_();
  if(!p.getProperty(RF_CH_CFG.activated))p.setProperty(RF_CH_CFG.activated,new Date().toISOString());
  const fn='rfChProcessNewRemittances';
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===fn))
    ScriptApp.newTrigger(fn).timeBased().everyMinutes(1).create();
  return 'Enabled for new POS transactions only; earlier orders excluded.';
}
function rfChDisableNotifications(){
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='rfChProcessNewRemittances')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  return 'Disabled; existing logs preserved.';
}
function rfChMoney_(amount){return '₱'+Number(amount||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function rfChMessage_(rec,ledgerRow){
  const items=Array.isArray(rec.items)?rec.items:[];
  const desc=items.map(i=>i.kind==='editing'?'• Edit: '+String(i.orderType||'Editing')+(i.existingId?' ('+i.existingId+')':''):
    i.kind==='frame'?'• Frame: '+String(i.size||'Frame')+(i.existingId?' ('+i.existingId+')':''):'').filter(Boolean);
  const tip=Number(rec.tip||0),discount=Number(rec.discount||0);
  return [
    '✅ ROCKETFIX REMITTANCE SAVED','',
    'POS ID: '+String(rec.posId||''),
    'Date: '+String(rec.paymentDate||''),
    'Customer: '+String([rec.first,rec.last].filter(Boolean).join(' ')||'—'),
    'Services:',...desc,
    ...(discount>0?['Discount: '+rfChMoney_(discount)]:[]),
    ...(tip>0?['Tip: '+rfChMoney_(tip)+(rec.tipRecipient&&rec.tipRecipient!=='Select'?' ('+rec.tipRecipient+')':'')]:[]),
    'Amount paid: '+rfChMoney_(rec.received),
    'Payment: '+String(rec.method||'—'),
    'Recorded by: '+String(rec.admin||'—')
  ].join('\n').slice(0,6000);
}
function rfChProof_(rec){return String(rec.proof||rec.paymentProofUrl||rec.proofUrl||'').trim();}
function rfChIsPublicJpeg_(url){
  return /^https:\/\/[^\s]+\.jpe?g(?:[?#]|$)/i.test(url)&&!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(url);
}
/** Interval worker. Sends only SYNCED, not deleted/archived; never backfills old POS. */
function rfChProcessNewRemittances(){
  const cfg=rfChConfig_();
  if(!cfg.token||!cfg.sender||!cfg.activated)return 'Disabled or incomplete settings.';
  const since=Date.parse(cfg.activated);if(!Number.isFinite(since))throw new Error('Invalid activation time.');
  const book=SpreadsheetApp.openById(POS_MASTER_ID), ledger=book.getSheetByName('POS Ledger');
  if(!ledger)throw new Error('POS Ledger not found.');
  const n=ledger.getLastRow();if(n<2)return 'No POS orders.';
  const log=rfChLog_();
  const rows=ledger.getRange(2,1,n-1,16).getValues();
  const prev=log.getLastRow()>1?log.getRange(2,2,log.getLastRow()-1,1).getDisplayValues().flat():[];
  const seen=new Set(prev.map(String));let processed=0;
  for(let i=0;i<rows.length&&processed<15;i++){
    const v=rows[i],id=String(v[0]||'').trim();
    if(!/^\d{8}$/.test(id)||seen.has(id)||String(v[13]||'').trim()!=='SYNCED')continue;
    const created=Date.parse(String(v[2]||''));
    if(!Number.isFinite(created)||created<since)continue;
    let rec;try{rec=JSON.parse(String(v[15]||'{}'));}catch(e){continue;}
    if(String(rec.posId)!==id||rec.deletedAt)continue;
    // Claim first, under lock, so overlapping triggers do not duplicate posts.
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(1500))return 'POS currently busy; will check next run.';
    let logRow;
    try{
      const last=log.getLastRow();
      const fresh=last>1?log.getRange(2,2,last-1,1).getDisplayValues().flat().map(String):[];
      if(fresh.includes(id)){seen.add(id);continue;}
      logRow=last+1;
      if(logRow>log.getMaxRows())log.insertRowsAfter(log.getMaxRows(),Math.max(100,logRow-log.getMaxRows()));
      log.getRange(logRow,1,1,6).setValues([[new Date(),id,'SENDING','','','']]);
      SpreadsheetApp.flush();seen.add(id);
    }finally{lock.releaseLock();}
    try{
      const proof=rfChProof_(rec),picture=rfChIsPublicJpeg_(proof);
      // A proof link (Google Drive) is last in text. Direct public JPEG follows as a separate message.
      const msg=rfChMessage_(rec,i+2)+(proof&&!picture?'\n\nPayment proof: '+proof:'');
      const textResult=rfChPost_({type:'text',text:msg});
      const textToken=String(textResult.message_token||'');
      if(picture){
        try{
          const pr=rfChPost_({type:'picture',text:'Payment proof',media:proof});
          log.getRange(logRow,3,1,4).setValues([['SENT',textToken,String(pr.message_token||''),'']]);
        }catch(e){
          log.getRange(logRow,3,1,4).setValues([['PHOTO_REVIEW',textToken,'','Text sent. Check photo manually: '+String(e.message||e).slice(0,180)]]);
        }
      }else{
        log.getRange(logRow,3,1,4).setValues([['SENT',textToken,'',proof?'Proof link included last.':'No proof URL on POS order.']]);
      }
    }catch(e){
      log.getRange(logRow,3,1,4).setValues([['REVIEW','','','Possible ambiguous send result; no automatic retry: '+String(e.message||e).slice(0,180)]]);
    }
    processed++;
  }
  return 'Checked '+processed+' new remittances.';
}
