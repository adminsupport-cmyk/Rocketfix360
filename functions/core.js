'use strict';
// Pure, testable accounting and validation extracted from the uploaded Rocketfix POS behavior.
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nonnegative = (v, label='Amount') => {
  const n=Number(v);
  if (!Number.isFinite(n) || n<0) throw Error(label+' must be nonnegative and finite');
  return round(n);
};
const employees=['Joyce Marianne Legaspi','Renz Malenab','Joy Deplomo','Lerni Belino','Mariz Osabel'];
const serviceTypes=['Family','Solo','Couple','Manipulation','Enhancement','Restoration','Graduation','Wedding'];
const frameStatuses=['HOLD','READY TO PROCESS','READY TO PRINT','PRINTED','ASSEMBLING','SHIPPED OUT','COMPLETED','REFUNDED'];
const editStatuses=['Not started','On going','Finalizing','Delivered'];
function validate(raw){
  if(!raw || typeof raw!=='object')throw Error('Missing order');
  const str=(x,max=300)=>String(x??'').trim().slice(0,max);
  const https=(x)=>{const u=str(x,2000);if(u&&!/^https:\/\//i.test(u))throw Error('File and proof links must begin with https://');return u;};
  const posId=str(raw.posId,8);
  if(!/^\d{8}$/.test(posId)) throw Error('POS ID must contain 8 digits');
  const paymentDate=str(raw.paymentDate,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||Number.isNaN(new Date(paymentDate+'T12:00:00Z').getTime()))throw Error('Invalid payment date');
  const first=str(raw.first,100),last=str(raw.last,100),email=str(raw.email,200);
  if(!first)throw Error('Customer name required');
  if(email && email.toUpperCase()!=='N/A'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Valid email or N/A required');
  if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>20)throw Error('1–20 services required');
  const seen=new Set();
  const items=raw.items.map((it,i)=>{
    const kind=str(it.kind,20),existingId=str(it.existingId,12).toUpperCase();
    if(!['editing','frame'].includes(kind))throw Error('Service type invalid');
    if(!new RegExp(kind==='editing'?'^RF\\d{5}[A-Z]$':'^[A-Z]{2}\\d[A-Z]\\d$').test(existingId))throw Error('Invalid '+kind+' ID '+existingId);
    const key=kind+'|'+existingId;if(seen.has(key))throw Error('Duplicate order ID '+existingId);seen.add(key);
    const base={kind,existingId,orderType:str(it.orderType||'Family',40),amount:nonnegative(it.amount,'Item amount'),notes:str(it.notes,3000),fileUrl:https(it.fileUrl),assignedTo:str(it.assignedTo,120)};
    if(kind==='editing'){
      return {...base,fileType:str(it.fileType||'NORMAL FILE',30),rushTargetDate:str(it.rushTargetDate,10),frameOrderId:str(it.frameOrderId,12).toUpperCase(),status:editStatuses.includes(it.status)?it.status:'Not started'};
    }
    const addOnType=str(it.addOnType,60);
    if(addOnType && addOnType!=='Personalized Letter')throw Error('Unsupported add-on');
    const letter=addOnType==='Personalized Letter';
    if(letter){
      if(!['Cursive','Typewrited','Regular'].includes(it.addOnFont))throw Error('Select letter font');
      if(!['Pink','Blue','White Gold'].includes(it.addOnColor))throw Error('Select envelope color');
      const msg=str(it.addOnMessage,6000);
      if(msg.toUpperCase()!=='N/A' && msg.length<100)throw Error('Letter must contain 100+ characters or N/A');
      if(!employees.includes(it.addOnCommissionRecipient))throw Error('Select letter commission recipient');
    }
    return {...base,size:str(it.size,120),design:str(it.design||'Black with Acrylic Frame',120),status:frameStatuses.includes(it.status)?it.status:'HOLD',photoUrl:https(it.photoUrl),addOnType:letter?addOnType:'',addOnFont:letter?it.addOnFont:'',addOnColor:letter?it.addOnColor:'',addOnMessage:letter?str(it.addOnMessage,6000):'',addOnCommissionRecipient:letter?it.addOnCommissionRecipient:'',shippingTier:str(it.shippingTier,60),shippingDays:str(it.shippingDays,60)};
  });
  for(const item of items.filter(x=>x.kind==='editing'&&x.frameOrderId)) if(!items.some(x=>x.kind==='frame'&&x.existingId===item.frameOrderId))throw Error('Frame link missing: '+item.frameOrderId);
  const shipping=raw.shipping&&typeof raw.shipping==='object'?raw.shipping:{};
  const shipment={ship:str(shipping.ship||'LBC',20),receiverName:str(shipping.receiverName,160),contactPhone:str(shipping.contactPhone,50),street:str(shipping.street,250),barangay:str(shipping.barangay,120),city:str(shipping.city,120),province:str(shipping.province,120),postal:str(shipping.postal,20),area:str(shipping.area,100),notes:str(shipping.notes,1000)};
  if(items.some(x=>x.kind==='frame')&&!['LBC','LALAMOVE'].includes(shipment.ship))throw Error('Shipping method must be LBC or LALAMOVE');
  const discount=nonnegative(raw.discount||0,'Discount'),tip=nonnegative(raw.tip||0,'Tip'),received=nonnegative(raw.received,'Received'),shippingFee=nonnegative(raw.shippingFee||0,'Shipping fee');
  const subtotal=round(items.reduce((sum,x)=>sum+x.amount+(x.addOnType==='Personalized Letter'?200:0),0));
  if(discount>subtotal)throw Error('Discount exceeds subtotal');
  if(!items.some(x=>x.kind==='frame')&&shippingFee)throw Error('Editing-only order cannot have frame shipping charge');
  const due=round(subtotal-discount+tip+shippingFee);
  if(received+0.001<due)throw Error('Received below amount due; underpayments need a separate workflow');
  const excess=round(Math.max(0,received-due));
  const tipRecipient=str(raw.tipRecipient||'Select',60);
  if(tip && !['Joyce','Renz','Joy','Lerni','Mariz'].includes(tipRecipient)) throw Error('Select tip recipient');
  // Discount allocation mirrors the source POS proportion of item prices including letter add-ons.
  let edPaid=0,framePaid=0;
  const allocated=items.map(x=>{
    const gross=x.amount+(x.addOnType==='Personalized Letter'?200:0);
    const allocatedDiscount=round(subtotal?discount*gross/subtotal:0);
    const net=round(gross-allocatedDiscount);
    if(x.kind==='editing')edPaid+=net; else framePaid+=net;
    return {...x,_discount:allocatedDiscount,_paid:net,itemKey:posId+'|'+x.kind+'|'+x.existingId};
  });
  const frameItems=allocated.filter(x=>x.kind==='frame');
  if(frameItems.length){frameItems[frameItems.length-1]._paid=round(frameItems[frameItems.length-1]._paid+shippingFee);framePaid+=shippingFee;}
  // Avoid rounding drift: last item's payment amount is residual of charge excluding tips.
  const paidBeforeTip=round(due-tip);
  const allocatedSum=round(allocated.reduce((a,x)=>a+x._paid,0));
  if(allocated.length&&allocatedSum!==paidBeforeTip){
    const delta=round(paidBeforeTip-allocatedSum),last=allocated[allocated.length-1];last._paid=round(last._paid+delta);
    if(last.kind==='editing')edPaid+=delta; else framePaid+=delta;
  }
  return {posId,first,last,email,paymentDate,items:allocated,shipping:shipment,shippingFee,subtotal,discount,tip,tipRecipient,received,due,excess,editPaid:round(edPaid),framePaid:round(framePaid),balance:0,method:str(raw.method||'GCash',60),proofUrl:https(raw.proofUrl),remarks:str(raw.remarks,3000)};
}
function earnings(order){
  const map={Joyce:employees[0],Renz:employees[1],Joy:employees[2],Lerni:employees[3],Mariz:employees[4]};
  const rows=[];
  if(order.tip>0)rows.push({key:'TIP:'+order.posId,type:'Tip',employee:map[order.tipRecipient],amount:order.tip,letterSale:0,frameId:''});
  for(const it of order.items){if(it.kind==='frame'&&it.addOnType==='Personalized Letter')rows.push({key:'LETTER:'+it.existingId,type:'Letter Commission',employee:it.addOnCommissionRecipient,amount:50,letterSale:200,frameId:it.existingId});}
  return rows;
}
module.exports={validate,earnings,round,nonnegative,employees,editStatuses,frameStatuses,serviceTypes};
