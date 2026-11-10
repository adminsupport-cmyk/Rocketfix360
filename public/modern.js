const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'₱'+Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
const statuses={editing:['Not started','On going','Finalizing','Delivered'],frame:['HOLD','READY TO PROCESS','READY TO PRINT','PRINTED','ASSEMBLING','SHIPPED OUT','COMPLETED','REFUNDED']};
const editingTypes=['Family','Solo','Enhancement','Manipulation','Couple','Fetched','Restoration','Graduation','Wedding'];
const financial=role=>['owner','admin','sales'].includes(role),operational=role=>['owner','admin','encoder','editor','production'].includes(role);
export function bindModernPOS(api){
 let orders=[],staff=[],selected=null,page={editing:0,frame:0},busy=false,submission=null,refreshing=null,remitRecords=new Map(),mirrorBusy=new Set(),serverCursor=null,searchTimer=null,initialized=false;
 const feedback=(id,text,error=false)=>{const e=$(id);e.textContent=text;e.classList.toggle('error',error);};
 const call=api.call,profile=()=>api.profile();
 const options=(values,chosen)=>values.map(v=>`<option value="${esc(typeof v==='string'?v:v.value)}" ${chosen===(typeof v==='string'?v:v.value)?'selected':''}>${esc(typeof v==='string'?v:v.label)}</option>`).join('');
 const link=(url,label)=>{try{if(new URL(url).protocol==='https:')return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;}catch{}return '—';};
 function rows(kind){const q=$(kind+'DbSearch').value.trim().toLowerCase(),status=$(kind+'DbStatus').value,sort=$(kind+'DbSort').value;
  const all=orders.filter(o=>!o.voidedAt).flatMap(o=>o.items.filter(i=>i.kind===kind).map(i=>({o,i}))).filter(({o,i})=>(!status||i.status===status)&&[o.posId,o.first,o.last,o.email,i.existingId,o.shipping?.receiverName].join(' ').toLowerCase().includes(q));
  all.sort((a,b)=>sort==='customer'?(a.o.first+' '+a.o.last).localeCompare(b.o.first+' '+b.o.last):sort==='id'?a.i.existingId.localeCompare(b.i.existingId):sort==='oldest'?String(a.o.createdAt).localeCompare(String(b.o.createdAt)):String(b.o.createdAt).localeCompare(String(a.o.createdAt)));
  const total=all.length;page[kind]=Math.min(page[kind],Math.max(0,Math.ceil(total/25)-1));const display=all.slice(page[kind]*25,page[kind]*25+25);
  $(kind+'DbRows').innerHTML=display.map(({o,i})=>{
   const id=`<b>${esc(i.existingId)}</b><small>POS ${esc(o.posId)}</small>`,customer=`${esc(o.first+' '+(o.last||''))}<small>${esc(o.email||'')}</small>`,pay=financial(profile()?.role)?`${money(i._paid)} allocated<small>POS: ${money(o.received)} · ${esc(o.method)}</small>`:'Restricted';
   let action=(financial(profile()?.role)?link(o.proofUrl,'Open proof')+' ':'')+`<button class="btn outline" data-edit-record="${esc(o.posId)}" data-item-key="${esc(i.itemKey)}">View / Edit</button>`;
   if(['owner','admin'].includes(profile()?.role)){
    const mirror=remitRecords.get(i.itemKey),state=mirrorBusy.has(i.itemKey)?'MIRRORING':mirror?.status==='MIRRORED'&&mirror.lastSyncedVersion<o.version?'NOT MIRRORED':mirror?.status||'NOT MIRRORED',dest=kind==='frame'?'Orders':o.stagingTest?'TEST REMIT':'REMIT';
    action+=`<small class="modern-badge">${esc(state)}</small><button class="btn outline" data-remit-mirror="${esc(o.posId)}" data-remit-key="${esc(i.itemKey)}" data-remit-kind="${kind}" ${mirrorBusy.has(i.itemKey)||kind==='frame'&&o.stagingTest?'disabled':''}>${state==='REVIEW REQUIRED'?'Review / reconcile':'Mirror to '+dest}</button>${mirror?.row?`<small>${dest} row ${mirror.row} · v${mirror.lastSyncedVersion}${mirror.lastSyncedVersion<o.version?' · saved changes pending sync':''}</small>`:''}`;
   }
   if(kind==='editing')return `<tr><td>${id}</td><td>${customer}</td><td>${esc(i.orderType)}<small>${esc(i.fileType)}${i.rushTargetDate?' · '+esc(i.rushTargetDate):''}</small></td><td>${esc(staff.find(s=>s.uid===i.assignedTo)?.name||i.assignedTo||'Unassigned')}</td><td><span class="modern-badge">${esc(i.status)}</span><small>${link(i.fileUrl,'Open file')}</small></td><td>${pay}<small>Frame: ${esc(i.frameOrderId||'—')}</small></td><td>${action}</td></tr>`;
   if(['owner','admin'].includes(profile()?.role))action+='<button class="btn outline" disabled title="A verified frame test workbook is required">Mirror to Frame Orders</button><small>Test destination not configured</small>';
   const shipping=o.shipping||{},linked=o.items.filter(x=>x.kind==='editing'&&x.frameOrderId===i.existingId).map(x=>x.existingId).join(', ');
   return `<tr><td>${id}</td><td>${customer}<small>Receiver: ${esc(shipping.receiverName||[o.first,o.last].join(' '))}<br>${esc(shipping.contactPhone||o.phone||'')}</small></td><td>${esc(i.size)}<small>${esc(i.design)}</small></td><td>${esc(shipping.ship)}<small>${esc([shipping.street,shipping.barangay,shipping.city,shipping.province,shipping.postal].filter(Boolean).join(', '))}</small></td><td><span class="modern-badge">${esc(i.status)}</span><small>${esc(i.trackingNumber||'No tracking number')}</small></td><td>${pay}<small>Editing: ${esc(linked||'—')}</small></td><td>${action}</td></tr>`;
  }).join('')||`<tr><td colspan="7" class="empty">No matching ${kind==='editing'?'editing':'frame'} orders.</td></tr>`;
  $(kind+'DbPage').textContent=total?`${page[kind]*25+1}–${Math.min(total,(page[kind]+1)*25)} of ${total} orders`:'0 orders';
  document.querySelector(`[data-db-prev="${kind}"]`).disabled=page[kind]===0;document.querySelector(`[data-db-next="${kind}"]`).disabled=(page[kind]+1)*25>=total;
 }
 async function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{for(const k of ['editing','frame'])feedback(k+'DbFeedback','Loading orders…');try{
   const list=[];const result=await call('listOrders',{limit:150});list.push(...result.orders);if(!initialized)serverCursor=result.nextCursor;const cached=new Map(orders.map(o=>[o.posId,o]));for(const o of list)cached.set(o.posId,o);orders=[...cached.values()].filter(o=>api.isDemo||o.stagingTest!==true);initialized=true;
   if(financial(profile()?.role)){staff=(await call('listStaff')).staff;window.workspaceUI?.setStaff(staff);}
   if(['owner','admin'].includes(profile()?.role)){remitRecords.clear();const ids=[...new Set(orders.map(o=>o.posId))];for(let n=0;n<ids.length;n+=30){const status=await call('remitMirrorStatuses',{posIds:ids.slice(n,n+30)});for(const record of status.records)remitRecords.set(record.itemKey,record);}}
   rows('editing');rows('frame');updateMore();for(const k of ['editing','frame'])feedback(k+'DbFeedback','');
  }catch(error){for(const k of ['editing','frame'])feedback(k+'DbFeedback','Could not load orders: '+error.message,true);}finally{refreshing=null;}})();return refreshing;
 }
 function updateMore(){for(const kind of ['editing','frame']){const root=$(kind+'DbPage').closest('.panel');let button=root.querySelector('[data-load-older]');if(!button){const info=document.createElement('div');info.className='workspace-search-info';info.innerHTML='<span>Search and filters apply to loaded records.</span> <button class="btn ghost" data-load-older="'+kind+'">Load older orders</button> <button class="btn ghost" data-search-all="'+kind+'">Search all saved orders</button>';root.append(info);button=info.querySelector('[data-load-older]');button.onclick=()=>loadOlder();info.querySelector('[data-search-all]').onclick=()=>loadAll(kind);}button.hidden=!serverCursor;root.querySelector('[data-search-all]').hidden=!serverCursor;root.querySelector('.workspace-search-info>span').textContent=serverCursor?'Search and filters apply to loaded records.':'All saved records loaded.';}}
 async function loadOlder(){if(!serverCursor)return;for(const k of ['editing','frame'])feedback(k+'DbFeedback','Loading the next page…');try{const data=await call('listOrders',{limit:150,cursor:serverCursor}),map=new Map(orders.map(o=>[o.posId,o]));for(const o of data.orders)map.set(o.posId,o);orders=[...map.values()].filter(o=>api.isDemo||o.stagingTest!==true);serverCursor=data.nextCursor;if(['owner','admin'].includes(profile()?.role)){const ids=[...new Set(data.orders.map(o=>o.posId))];for(let n=0;n<ids.length;n+=30){const states=await call('remitMirrorStatuses',{posIds:ids.slice(n,n+30)});for(const record of states.records)remitRecords.set(record.itemKey,record);}}rows('editing');rows('frame');updateMore();for(const k of ['editing','frame'])feedback(k+'DbFeedback','');}catch(error){feedback('editingDbFeedback',error.message,true);feedback('frameDbFeedback',error.message,true);}}
 async function loadAll(kind){const button=document.querySelector('[data-search-all="'+kind+'"]');button.disabled=true;try{while(serverCursor){const previous=JSON.stringify(serverCursor);await loadOlder();if(JSON.stringify(serverCursor)===previous)break;}}finally{button.disabled=false;}feedback(kind+'DbFeedback',serverCursor?'Search paused. Load more to continue.':'All saved orders loaded for this search.');}
 async function dashboard(){feedback('dashboardFeedback','Loading today’s sales…');try{
  const d=await call('dashboard');for(const [id,key] of [['dashSales','salesToday'],['dashEditing','editingToday'],['dashFrames','framingToday']])$(id).textContent=money(d[key]);
  $('dashOrders').textContent=d.newOrdersToday;$('dashPendingEditing').textContent=d.pendingEditing;$('dashPendingFrames').textContent=d.pendingFrames;$('dashboardDate').textContent=d.today+(api.isDemo?' · Asia/Manila · Local test data':' · Asia/Manila · Real orders');
  $('dashboardRecent').innerHTML=d.recent.map(o=>`<tr><td>${esc(o.posId)}</td><td>${esc(o.first+' '+(o.last||''))}</td><td>${esc(o.paymentDate)}</td><td>${money(o.received)}</td><td><button class="btn ghost" data-payment-edit="${esc(o.posId)}">View</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No recorded remittances.</td></tr>';feedback('dashboardFeedback','');
 }catch(error){feedback('dashboardFeedback','Unable to load dashboard: '+error.message,true);}}
 const field=(key,label,value,{type='text',values,readonly=false,full=false}={})=>`<label class="${full?'full':''}">${esc(label)}${values?`<select data-record-field="${key}" ${readonly?'disabled':''}>${options(values,value)}</select>`:type==='textarea'?`<textarea data-record-field="${key}" ${readonly?'readonly':''}>${esc(value||'')}</textarea>`:`<input data-record-field="${key}" type="${type}" value="${esc(value||'')}" ${readonly?'readonly':''}>`}</label>`;
 async function openEditor(posId,itemKey){
  $('databaseEditor').showModal();$('databaseEditorFields').innerHTML='Loading saved record…';feedback('databaseEditorFeedback','');$('saveDatabaseEditor').disabled=true;
  try{
   const {order}=await call('getOrder',{posId}),item=order.items.find(i=>i.itemKey===itemKey)||order.items[0];selected={order,item};const role=profile().role,f=financial(role),op=operational(role);
   $('databaseEditorTitle').textContent='Edit '+item.existingId;$('databaseEditorReference').textContent='POS '+order.posId+' · Version '+order.version;
   let html=field('first','Customer given name',order.first,{readonly:!f})+field('last','Customer surname',order.last,{readonly:!f})+field('email','Email or N/A',order.email,{readonly:!f})+field('phone','Customer phone',order.phone,{readonly:!f});
   html+=field('item.status',item.kind==='editing'?'Editing status':'Production status',item.status,{values:statuses[item.kind],readonly:!op});
   if(item.kind==='editing'){
    html+=field('item.assignedTo','Assigned editor',item.assignedTo||'',{values:[{value:'',label:'Unassigned'},...staff.filter(s=>s.active&&s.role==='editor').map(s=>({value:s.uid,label:s.name}))],readonly:!['owner','admin','encoder'].includes(role)});
    html+=field('item.orderType','Editing category',item.orderType,{values:editingTypes,readonly:!f})+field('item.fileType','File type',item.fileType,{values:['NORMAL FILE','RUSH FILE','REVISION PAYMENT','ADDITIONAL PAYMENT'],readonly:!f})+field('item.rushTargetDate','Rush target date',item.rushTargetDate,{type:'date',readonly:!f})+field('item.frameOrderId','Linked frame',item.frameOrderId||'',{values:['',...order.items.filter(i=>i.kind==='frame').map(i=>i.existingId)],readonly:!f})+field('item.fileUrl','Editing file URL',item.fileUrl,{type:'url',readonly:!op,full:true})+field('item.noteFileUrl','Note file URL',item.noteFileUrl,{type:'url',readonly:!op,full:true});
   }else{
    html+=field('item.trackingNumber','Tracking number',item.trackingNumber,{readonly:!op})+field('item.photoUrl','Customer photo Drive URL',item.photoUrl,{type:'url',readonly:!op,full:true})+field('item.mockupUrl','Mockup Drive URL',item.mockupUrl,{type:'url',readonly:!op,full:true});
    for(const [k,label] of [['receiverName','Receiver Name'],['contactPhone','Receiver contact'],['street','Street / House / Unit'],['barangay','Barangay'],['city','City / Municipality'],['province','Province'],['region','Region'],['postal','Postal code'],['area','Shipping area'],['ship','Shipment method'],['notes','Shipping notes']])html+=field('shipping.'+k,label,order.shipping?.[k],{readonly:!f,values:k==='ship'?['LBC','LALAMOVE']:k==='area'?['','Luzon','Visayas','Mindanao']:undefined});
    html+=`<div class="full modern-rowdetail">${esc(item.size)} · ${esc(item.design)}${item.addOnType?'<br>Letter: '+esc(item.addOnFont)+' · '+esc(item.addOnColor)+'<br>'+esc(item.addOnMessage):''}</div>`;
   }
   html+=field('item.notes','Service notes',item.notes,{readonly:!f,full:true})+field('remarks','Remittance notes',order.remarks,{type:'textarea',readonly:!f,full:true});
   if(f)html+=`<div class="full modern-rowdetail">Received ${money(order.received)} · Due ${money(order.due)} · Tip ${money(order.tip)} · Excess ${money(order.excess)}<br>Payment: ${esc(order.method)} · ${esc(order.paymentDate)}. Financial changes use the original remittance correction form.</div>`;
   $('databaseEditorFields').innerHTML=html;$('saveDatabaseEditor').disabled=false;$('editPaymentCorrection').hidden=!f;
  }catch(error){feedback('databaseEditorFeedback',error.message,true);}
 }
 $('databaseEditorForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!selected)return;const patch={},itemPatch={itemKey:selected.item.itemKey};
  for(const input of $('databaseEditorFields').querySelectorAll('[data-record-field]')){
   if(input.disabled||input.readOnly)continue;const [scope,key]=input.dataset.recordField.split('.'),value=input.value;
   const old=key?scope==='item'?selected.item[key]||'':selected.order.shipping?.[key]||'':selected.order[scope]||'';
   if(value===old)continue;if(scope==='item')itemPatch[key]=value;else if(scope==='shipping')(patch.shipping||={})[key]=value;else patch[scope]=value;
  }
  if(Object.keys(itemPatch).length>1)patch.items=[itemPatch];if(!Object.keys(patch).length)return feedback('databaseEditorFeedback','No changes to save.');
  const button=$('saveDatabaseEditor');button.disabled=true;feedback('databaseEditorFeedback','Saving changes…');
  try{const saved=await call('editOrderRecord',{posId:selected.order.posId,expectedVersion:selected.order.version,patch});if(saved.order)orders=orders.map(o=>o.posId===saved.order.posId?saved.order:o);$('databaseEditor').close();await refresh();await dashboard();api.refreshLegacy();}
  catch(error){feedback('databaseEditorFeedback','Save not confirmed: '+error.message+' Reload this record before retrying.',true);}finally{button.disabled=false;}
 });
 async function mirrorRemit(posId,itemKey,kind='editing'){
  const feed=kind+'DbFeedback';
  if(mirrorBusy.has(itemKey))return;mirrorBusy.add(itemKey);rows(kind);feedback(feed,'Checking saved order and its REMIT destination…');
  try{
   const preview=await call('previewRemitMirror',{posId,itemKey});
   if(preview.needsReconciliation){
    if(!await window.workspaceUI.confirm('REVIEW REQUIRED · POS '+posId+' · '+preview.editingId+'\nRead destination row '+preview.row+' and reconcile the previous uncertain result? This will not resend or append a row.'))return;
    const result=await call('reconcileRemitMirror',{posId,itemKey});feedback(feed,result.status+' · '+(result.row?'Destination row '+result.row:'')+(result.status==='FAILED'?' · No write was found. Preview again to confirm a manual retry.':''));
   }else{
    if(!await window.workspaceUI.confirm((preview.alreadyMirrored?'Already mirrored — verify existing record':'Mirror saved order')+'\nPOS '+posId+' · '+preview.editingId+'\nDestination: '+preview.destinationLabel+'\nSpreadsheet: '+preview.spreadsheetId+' · GID '+preview.sheetId+'\nAction: '+preview.action+' · row '+preview.row+'\n'+(preview.testOnly?'TEST COPY ONLY.':'APPROVED LIVE DESTINATION — real saved orders only.')+' Firebase payment and Viber delivery will not be repeated.'))return;
    const result=await call('syncRemitMirror',{posId,itemKey,expectedVersion:preview.version,confirmationToken:preview.confirmationToken});feedback(feed,result.status+' · destination row '+result.row+(result.lastError?' · '+result.lastError:''),['FAILED','REVIEW REQUIRED'].includes(result.status));
   }
  }catch(error){feedback(feed,'REMIT mirror not confirmed: '+error.message+'. Your saved payment remains unchanged.',true);}
  finally{const message=$(feed).textContent,error=$(feed).classList.contains('error');mirrorBusy.delete(itemKey);await refresh();feedback(feed,message,error);}
 }
 document.addEventListener('click',event=>{const b=event.target.closest('[data-remit-mirror]');if(b)mirrorRemit(b.dataset.remitMirror,b.dataset.remitKey,b.dataset.remitKind);});
 $('closeDatabaseEditor').onclick=()=>$('databaseEditor').close();
 $('editPaymentCorrection').onclick=()=>{if(selected){$('databaseEditor').close();api.editPayment(selected.order);}};
 document.addEventListener('click',event=>{const edit=event.target.closest('[data-edit-record]'),pay=event.target.closest('[data-payment-edit]'),open=event.target.closest('[data-open]');if(edit)openEditor(edit.dataset.editRecord,edit.dataset.itemKey);if(pay)call('getOrder',{posId:pay.dataset.paymentEdit}).then(({order})=>api.editPayment(order)).catch(e=>feedback('dashboardFeedback',e.message,true));if(open)api.openTab(open.dataset.open);});
 for(const kind of ['editing','frame']){
  for(const suffix of ['Search','Status','Sort'])$(kind+'Db'+suffix).addEventListener(suffix==='Search'?'input':'change',()=>{const run=()=>{page[kind]=0;rows(kind);};if(suffix==='Search'){clearTimeout(searchTimer);searchTimer=setTimeout(run,180);}else run();});
  document.querySelector(`[data-db-prev="${kind}"]`).onclick=()=>{page[kind]--;rows(kind);};document.querySelector(`[data-db-next="${kind}"]`).onclick=()=>{page[kind]++;rows(kind);};document.querySelector(`[data-refresh-db="${kind}"]`).onclick=refresh;
 }
 $('refreshDashboard').onclick=dashboard;
 setInterval(()=>{if(document.hidden||!profile())return;const active=document.querySelector('.tab.active')?.id;if(active==='dashboard')dashboard();else if(['editingDatabase','frameDatabase'].includes(active))refresh();},15000);
 document.querySelectorAll('nav [data-tab]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.tab==='dashboard')dashboard();if(['editingDatabase','frameDatabase'].includes(button.dataset.tab))refresh();if(button.dataset.tab==='settings')integrations();}));
 async function submit(record,file){
  if(busy)return;if(submission&&!submission.confirmed)return api.notify('A previous payment is unconfirmed. Reconcile that POS ID before submitting another payment.',true);
  busy=true;submission={record,confirmed:false};const btn=$('saveButtonText').closest('button');btn.disabled=true;$('saveButtonText').textContent='Saving payment…';
  const controls=[...$('new').querySelectorAll('input,select,textarea,button')].map(e=>[e,e.disabled]);for(const [e] of controls)e.disabled=true;$('new').setAttribute('aria-busy','true');
  let paymentStarted=false;
  try{if(file){$('saveButtonText').textContent='Uploading payment proof…';Object.assign(record,await api.uploadProof(record,file));}paymentStarted=true;const result=await api.save(record);submission.confirmed=true;api.acceptReceipt(result.record);api.notify('Remittance saved · POS '+record.posId+'. You can start the next order.',false,record.posId);refresh();dashboard();}
  catch(error){
   if(!paymentStarted){submission=null;api.notify('Proof upload failed: '+error.message+'. Form preserved. Use Retry proof upload; no payment was submitted.',true);}
   else if(['functions/unavailable','functions/deadline-exceeded','functions/internal'].includes(error.code)){
    try{const result=await api.status(record.posId);if(result.status==='SYNCED'&&result.record){submission.confirmed=true;api.acceptReceipt(result.record);api.notify('Payment confirmed · POS '+record.posId,false,record.posId);return;}}catch{}
    api.notify('Payment outcome is uncertain for POS '+record.posId+'. Check Remittances before retrying. No payment was automatically resubmitted.',true);
   }else{submission=null;api.notify('Payment was not confirmed: '+error.message,true);}
  }finally{for(const [e,disabled] of controls)e.disabled=disabled;$('email').disabled=$('rfEmailPending').checked;$('new').setAttribute('aria-busy','false');busy=false;btn.disabled=false;$('saveButtonText').textContent='Submit Remittance';}
 }
 async function submitLetter(order){
  if(!order?.editable||busy)return;
  const payload={id:order.id,commissionEmployee:$('rfLateCommission').value,color:$('rfLateColor').value,font:$('rfLateFont').value,message:$('rfLateMessage').value,paymentDate:$('rfLateDate').value,method:$('rfLateMethod').value,paymentRef:$('rfLatePaymentRef').value,confirmation:$('rfLatePaid').checked?'PAYMENT RECEIVED':''};
  busy=true;$('rfLateSaveButton').disabled=true;try{await call('saveLateLetter',payload);$('rfLateOverlay').hidden=true;api.notify('Letter payment saved · '+order.id+'. External sending remains disabled.');refresh();dashboard();}catch(error){api.notify('Letter payment not confirmed: '+error.message+'. Check the existing payment before retrying.',true);}finally{busy=false;$('rfLateSaveButton').disabled=false;}
 }
 async function integrations(){
  if(!['owner','admin'].includes(profile()?.role))return;
  let panel=$('integrationPanel');if(!panel){panel=document.createElement('div');panel.id='integrationPanel';panel.className='panel';$('settings').append(panel);}
  panel.innerHTML='<h2>Background integrations</h2><p class="muted small">Loading delivery records…</p>';
  try{const data=await call('integrationStatus');window.workspaceUI?.setIntegrations(data);panel.innerHTML='<h2>Background integrations</h2><p class="muted small">Manual synchronization sends editing orders to REMIT and frame orders to Orders. Firebase remains the primary database. Email delivery is disabled. Viber: '+(data.viberEnabled?'automatic real-remittance delivery enabled':'real delivery activation awaiting verification')+'.</p><div class="modern-table"><table><thead><tr><th>POS ID</th><th>Integration</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>'+[...(data.remit||[]),...data.sheets,...data.notifications].map(n=>`<tr><td>${esc(n.posId)}</td><td>${esc(n.type)}</td><td>${esc(n.status)}<small>${esc(n.errorCode)}${n.row?' · '+(n.testOnly?'TEST ':'')+'row '+n.row+' · v'+n.version:''}</small></td><td>${n.attempts}</td><td>${n.canVerifyReal?`<button class="btn outline" data-retry-event="${esc(n.eventId)}" data-integration-type="VIBER" data-real-verification="true">Send one real confirmation</button>`:(n.status==='FAILED'&&n.type==='SHEETS'||n.status==='NOT_DELIVERED')&&n.attempts<3?`<button class="btn ghost" data-retry-event="${esc(n.eventId)}" data-integration-type="${esc(n.type)}">Retry confirmed failure</button>`:['REVIEW','REVIEW REQUIRED'].includes(n.status)?'Open Editing Database to reconcile':'—'}</td></tr>`).join('')+'</tbody></table></div>';panel.querySelectorAll('[data-retry-event]').forEach(b=>b.onclick=async()=>{if(b.dataset.realVerification&&!await window.workspaceUI.confirm('Send exactly one real remittance confirmation for POS '+b.dataset.retryEvent.split('_')[0]+' to REMIT - RF? No payment will be created or changed.',{title:'Verify real Viber delivery',label:'Send confirmation'}))return;b.disabled=true;try{await call(b.dataset.integrationType==='SHEETS'?'retrySheetsMirror':'retryNotification',{eventId:b.dataset.retryEvent});await integrations();}catch(error){api.notify(error.message,true);b.disabled=false;}});
  }catch(error){panel.textContent='Integration records unavailable: '+error.message;}
 }
 window.modernPOS={submit,submitLetter,resetSubmission(){if(submission?.confirmed)submission=null;},async authorized(){orders=[];serverCursor=null;initialized=false;remitRecords.clear();await Promise.all([refresh(),dashboard()]);},refresh};
 return window.modernPOS;
}
