'use strict';
const {editStatuses,frameStatuses,serviceTypes}=require('./core');
const {date}=require('./workflows');
const finance=new Set(['owner','admin','sales']),workflow=new Set(['owner','admin','encoder','editor','production']);
function applyRecordEdit(order,patch,actor){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Record changes required');
 const clean=JSON.parse(JSON.stringify(order));
 const keys=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid changes');for(const k of Object.keys(value))if(!allowed.includes(k))throw Error('Unsupported record field: '+k);};
 const text=(v,max=300)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid text field');return v.trim();};
 const url=v=>{const s=text(v,2000);if(s){const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw Error('File links must use HTTPS');}return s;};
 keys(patch,['first','last','email','phone','remarks','shipping','items']);
 for(const key of ['first','last','email','phone','remarks'])if(key in patch){if(!finance.has(actor.role))throw Error('Customer changes require financial access');clean[key]=text(patch[key],key==='remarks'?3000:200);}
 if(!clean.first)throw Error('Customer name required');
 if(clean.email&&!/^N\/?A$/i.test(clean.email)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email))throw Error('Valid email or N/A required');
 if(patch.shipping){
  if(!finance.has(actor.role))throw Error('Shipping changes require financial access');
  keys(patch.shipping,['ship','receiverName','contactPhone','street','barangay','city','province','region','postal','area','notes']);
  clean.shipping={...clean.shipping};for(const [k,v] of Object.entries(patch.shipping))clean.shipping[k]=text(v,k==='notes'?1000:250);
  if(!['LBC','LALAMOVE'].includes(clean.shipping.ship))throw Error('Choose LBC or LALAMOVE');
 }
 if(patch.items!==undefined){
  if(!Array.isArray(patch.items)||patch.items.length>20)throw Error('Invalid item changes');const seen=new Set();
  for(const change of patch.items){
   keys(change,['itemKey','status','assignedTo','fileUrl','mockupUrl','photoUrl','trackingNumber','notes','orderType','fileType','rushTargetDate','frameOrderId']);
   if(seen.has(change.itemKey))throw Error('Duplicate item changes');seen.add(change.itemKey);
   const item=clean.items.find(x=>x.itemKey===change.itemKey);if(!item)throw Error('Item not found');
   if(actor.role==='editor'&&(item.kind!=='editing'||item.assignedTo!==actor.uid))throw Error('Not assigned to this editing order');
   if(actor.role==='production'&&item.kind!=='frame')throw Error('Production only updates frames');
   for(const [key,value] of Object.entries(change)){
    if(key==='itemKey')continue;
    if(['orderType','fileType','rushTargetDate','frameOrderId','notes'].includes(key)){
     if(!finance.has(actor.role))throw Error('Order details require financial access');
     if(key!=='notes'&&item.kind!=='editing')throw Error('Editing detail only');item[key]=text(value,key==='notes'?3000:100);
    }else{
     if(!workflow.has(actor.role))throw Error('Workflow changes require an authorized operational role');
     if(key==='status'){if(!(item.kind==='editing'?editStatuses:frameStatuses).includes(value))throw Error('Invalid status');item.status=value;}
     if(key==='assignedTo'){if(!['owner','admin','encoder'].includes(actor.role)||item.kind!=='editing')throw Error('Assignment requires admin or encoder');item.assignedTo=text(value,128);}
     if(key==='fileUrl'){if(item.kind!=='editing')throw Error('Editing file only');item.fileUrl=url(value);}
     if(['photoUrl','mockupUrl','trackingNumber'].includes(key)){if(item.kind!=='frame')throw Error('Frame detail only');item[key]=key==='trackingNumber'?text(value,120):url(value);}
    }
   }
  }
 }
 const frames=new Set(clean.items.filter(x=>x.kind==='frame').map(x=>x.existingId)),linked=new Set();
 for(const item of clean.items.filter(x=>x.kind==='editing')){
  if(!serviceTypes.includes(item.orderType))throw Error('Invalid service type');
  if(!['NORMAL FILE','RUSH FILE','REVISION PAYMENT','ADDITIONAL PAYMENT'].includes(item.fileType))throw Error('Invalid file type');
  if(item.fileType==='RUSH FILE')date(item.rushTargetDate);else item.rushTargetDate='';
  if(item.frameOrderId){if(!frames.has(item.frameOrderId)||linked.has(item.frameOrderId))throw Error('Invalid or duplicate linked frame');linked.add(item.frameOrderId);}
 }
 return clean;
}
module.exports={applyRecordEdit};
