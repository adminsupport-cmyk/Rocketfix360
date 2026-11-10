'use strict';
// Pure, testable accounting and validation extracted from the uploaded Rocketfix POS behavior.
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nonnegative = (v, label='Amount') => {
  const n=Number(v);
  if (!Number.isFinite(n) || n<0 || n>1e9) throw Error(label+' must be nonnegative and finite');
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
  const posId=String(raw.posId??'').trim();
  if(!/^\d{8}$/.test(posId)) throw Error('POS ID must contain 8 digits');
  const paymentDate=String(raw.paymentDate??'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||(Number.isNaN(new Date(paymentDate+'T12:00:00Z').getTime())||new Date(paymentDate+'T12:00:00Z').toISOString().slice(0,10)!==paymentDate))throw Error('Invalid payment date');
  const first=str(raw.first,100),last=str(raw.last,100),email=/^n\/?a$/i.test(str(raw.email,200))?'N/A':str(raw.email,200);
  if(!first)throw Error('Customer name required');
  if(!email)throw Error('Valid email or N/A required');
  if(email && email.toUpperCase()!=='N/A'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Valid email or N/A required');
  if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>20)throw Error('1–20 services required');
  const seen=new Set();
  const items=raw.items.map((it,i)=>{
    const kind=str(it.kind,20),existingId=str(it.existingId,12).toUpperCase();
    if(!['editing','frame'].includes(kind))throw Error('Service type invalid');
    if(!new RegExp(kind==='editing'?'^RF\\d{5}[A-Z]$':'^[A-Z]{2}\\d[A-Z]\\d$').test(existingId))throw Error('Invalid '+kind+' ID '+existingId);
    const key=kind+'|'+existingId;if(seen.has(key))throw Error('Duplicate order ID '+existingId);seen.add(key);
    const base={kind,existingId,orderType:str(it.orderType||'Family',40),amount:nonnegative(it.amount,'Item amount'),notes:str(it.notes,3000),fileUrl:https(it.fileUrl),assignedTo:str(it.assignedTo,120)};
    if(!serviceTypes.includes(base.orderType))throw Error('Invalid service type');
    if(kind==='editing'){
      if(!['NORMAL FILE','RUSH FILE'].includes(it.fileType||'NORMAL FILE'))throw Error('Invalid file type');
      if(it.fileType==='RUSH FILE'&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(it.rushTargetDate))||!Number.isFinite(Date.parse(it.rushTargetDate+'T12:00:00Z'))||new Date(it.rushTargetDate+'T12:00:00Z').toISOString().slice(0,10)!==it.rushTargetDate))throw Error('Valid rush target date required');
      return {...base,fileType:str(it.fileType||'NORMAL FILE',30),rushTargetDate:str(it.rushTargetDate,10),frameOrderId:str(it.frameOrderId,12).toUpperCase(),status:editStatuses.includes(it.status)?it.status:'Not started'};
    }
    const addOnType=str(it.addOnType,60);
    if(addOnType && addOnType!=='Personalized Letter')throw Error('Unsupported add-on');
    const letter=addOnType==='Personalized Letter';
    if(letter){
      if(!['Cursive','Typewrited','Regular'].includes(it.addOnFont))throw Error('Select letter font');
      if(!['Pink','Blue','White Gold'].includes(it.addOnColor))throw Error('Select envelope color');
      if(String(it.addOnMessage||'').length>6000)throw Error('Letter must contain at most 6000 characters');
      const msg=str(it.addOnMessage,6000);
      if(msg.toUpperCase()!=='N/A' && msg.length<100)throw Error('Letter must contain 100+ characters or N/A');
      if(!employees.includes(it.addOnCommissionRecipient))throw Error('Select letter commission recipient');
    }
    return {...base,size:str(it.size,120),design:str(it.design||'Black with Acrylic Frame',120),status:frameStatuses.includes(it.status)?it.status:'HOLD',photoUrl:https(it.photoUrl),addOnType:letter?addOnType:'',addOnFont:letter?it.addOnFont:'',addOnColor:letter?it.addOnColor:'',addOnMessage:letter?(String(it.addOnMessage).trim().toUpperCase()==='N/A'?'N/A':String(it.addOnMessage)):'',addOnCommissionRecipient:letter?it.addOnCommissionRecipient:'',shippingFee:nonnegative(it.shippingFee||0,'Frame shipping fee'),shippingManual:it.shippingManual!==false,customSize:it.customSize===true,customWidth:it.customSize?nonnegative(it.customWidth):0,customHeight:it.customSize?nonnegative(it.customHeight):0,shippingTier:str(it.shippingTier,60),shippingDays:str(it.shippingDays,60)};
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
  if(received<=0)throw Error('Received payment must be greater than zero');
  const excess=round(Math.max(0,received-due));
  const tipRecipient=str(raw.tipRecipient||'Select',60);
  if(tip && !['Joyce','Renz','Joy','Lerni','Mariz'].includes(tipRecipient)) throw Error('Select tip recipient');
  // Match posFinalizeQueuedV1618_ and posServiceAmounts_: split by service,
  // then distribute each service total using item + letter + per-frame freight weights.
  const edGross=items.filter(x=>x.kind==='editing').reduce((a,x)=>a+x.amount,0);
  const net=round(subtotal-discount+shippingFee),paidBeforeTip=round(due-tip);
  const edPaid=net?round(paidBeforeTip*(edGross-(subtotal?discount*edGross/subtotal:0))/net):0;
  const framePaid=round(paidBeforeTip-edPaid);
  const allocated=items.map(x=>({...x,_discount:round(subtotal?discount*(x.amount+(x.addOnType==='Personalized Letter'?200:0))/subtotal:0),itemKey:posId+'|'+x.kind+'|'+x.existingId}));
  // Compatibility for old callers with one global freight field; server quoteOrder
  // always supplies explicit per-frame charges.
  const frames=allocated.filter(x=>x.kind==='frame');
  if(frames.length&&!frames.some(x=>x.shippingFee))frames[frames.length-1].shippingFee=shippingFee;
  if(round(frames.reduce((a,x)=>a+x.shippingFee,0))!==shippingFee)throw Error('Per-frame shipping fees do not match total');
  for(const [kind,paid] of [['editing',edPaid],['frame',framePaid]]){
    const group=allocated.filter(x=>x.kind===kind);
    const weight=x=>x.amount+(x.addOnType==='Personalized Letter'?200:0)+(kind==='frame'?x.shippingFee:0);
    const total=group.reduce((a,x)=>a+weight(x),0);let remaining=paid;
    group.forEach((x,i)=>{x._paid=i===group.length-1?remaining:round(total?paid*weight(x)/total:paid/group.length);remaining=round(remaining-x._paid);});
  }
  return {pricingStatus:items.some(x=>x.kind==='frame')?'UNVERIFIED_FIXTURE':'NOT_APPLICABLE',posId,first,last,email,paymentDate,items:allocated,shipping:shipment,shippingFee,subtotal,discount,tip,tipRecipient,received,due,excess,editPaid:round(edPaid),framePaid:round(framePaid),balance:0,method:str(raw.method||'GCash',60),proofUrl:https(raw.proofUrl),remarks:str(raw.remarks,3000)};
}
function earnings(order){
  const map={Joyce:employees[0],Renz:employees[1],Joy:employees[2],Lerni:employees[3],Mariz:employees[4]};
  const rows=[];
  if(order.tip>0)rows.push({key:'TIP:'+order.posId,type:'Tip',employee:map[order.tipRecipient],amount:order.tip,letterSale:0,frameId:''});
  for(const it of order.items){if(it.kind==='frame'&&it.addOnType==='Personalized Letter')rows.push({key:'LETTER:'+it.existingId,type:'Letter Commission',employee:it.addOnCommissionRecipient,amount:50,letterSale:200,frameId:it.existingId});}
  return rows;
}
module.exports={validate,earnings,round,nonnegative,employees,editStatuses,frameStatuses,serviceTypes};
