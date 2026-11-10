'use strict';
const {round,nonnegative,employees}=require('./core');
const standards={'10"x13" - Small':799,'13"x17" - Medium':999,'18"x26.5" - Large':2299,'25.5"x35" - X-Large':3199};
const methods=['GCash','BDO','BPI','GoTyme','Cash','Bank Transfer','Other'];
function date(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid payment date');
 return value;
}
function dimensions(item){
 const m=String(item.size||'').match(/([\d.]+)\s*"?\s*[x×]\s*([\d.]+)/i);
 const w=Number(item.customSize?item.customWidth:m?.[1]),h=Number(item.customSize?item.customHeight:m?.[2]);
 if(!(w>0&&h>0&&Number.isFinite(w)&&Number.isFinite(h)))throw Error('Frame dimensions required');
 return {w,h};
}
function tier(item){const {w,h}=dimensions(item),a=Math.min(w,h),b=Math.max(w,h);return [['Small',10,13],['Medium',13,17],['Large',18,26.5],['XL',25.5,35]].find(t=>a<=t[1]&&b<=t[2])?.[0]||'MANUAL';}
function productQuote(item,cfg={}){
 const design=item.design||'Black with Acrylic Frame';
 const kind=({'Black with Acrylic Frame':'framed','Print Only':'print','Canvas without frame':'canvas'})[design];
 if(!kind)throw Error('Unsupported frame design; authoritative pricing required');
 const {w,h}=dimensions(item),c=cfg.custom||{};
 if(w<Number(c[kind+'MinWidth']??4)||w>Number(c[kind+'MaxWidth']??60)||h<Number(c[kind+'MinHeight']??4)||h>Number(c[kind+'MaxHeight']??60))throw Error('Frame dimensions exceed configured production limits');
 if(kind==='framed'&&!item.customSize&&Object.hasOwn(standards,item.size))return {price:standards[item.size],kind};
 const rate=Number(c[kind+'Rate']),base=Number(c[kind+'Base']||0),minimum=Number(c[kind+'Minimum']||0);
 if(!(rate>0&&Number.isFinite(rate)))throw Error('Configure '+design+' pricing before quoting');
 return {price:Math.max(minimum,Math.ceil(w*h*rate+base)),kind};
}
function quoteOrder(raw,cfg={},enforcePrice=true){
 const items=(raw.items||[]).map(x=>({...x}));let fee=0;
 if(items.some(x=>x.kind==='frame')&&cfg.fixtureOnly!==true)throw Error('Frame pricing is unverified. Await legacy source audit, or explicitly enable synthetic staging fixtures.');
 for(const item of items.filter(x=>x.kind==='frame')){
  const quote=productQuote(item,cfg);
  if(enforcePrice&&(!Number.isFinite(Number(item.amount))||Math.abs(Number(item.amount)-quote.price)>0.01))throw Error('Product price changed; refresh calculator: '+item.existingId);
  item.amount=quote.price;
  const t=tier(item),rate=cfg.rates?.[(raw.shipping?.area||'')+'|'+t];
  const explicit=item.shippingFee!==''&&item.shippingFee!=null&&item.shippingManual!==false;
  if(explicit){item.shippingFee=nonnegative(item.shippingFee,'Shipping fee');item.shippingManual=true;}
  else if(raw.shipping?.ship==='LBC'&&rate&&t!=='MANUAL'){item.shippingFee=nonnegative(rate.rate,'Shipping fee');item.shippingManual=false;}
  else throw Error('Enter a confirmed shipping quotation for each frame');
  item.shippingTier=t;item.shippingDays=rate?.days||'';fee=round(fee+item.shippingFee);
  if(item.customSize)item.size=item.customWidth+'"x'+item.customHeight+'" - Custom '+quote.kind;
 }
 return {...raw,items,shippingFee:fee,pricingStatus:items.some(x=>x.kind==='frame')?'UNVERIFIED_FIXTURE':'NOT_APPLICABLE'};
}
function pricingConfig(input){
 const custom={},rates={};
 for(const kind of ['framed','print','canvas']){
  for(const field of ['Rate','Base','Minimum','MinWidth','MaxWidth','MinHeight','MaxHeight']){
   const key=kind+field,v=input.custom?.[key];
   if(v!==undefined&&v!==null&&v!=='')custom[key]=nonnegative(v,key);
  }
  for(const axis of ['Width','Height'])if((custom[kind+'Min'+axis]??4)>(custom[kind+'Max'+axis]??60))throw Error('Invalid dimension limits');
 }
 for(const area of ['Luzon','Visayas','Mindanao'])for(const t of ['Small','Medium','Large','XL']){
  const key=area+'|'+t,r=input.rates?.[key];
  if(r&&r.rate!==''&&r.rate!=null)rates[key]={rate:nonnegative(r.rate,key),days:String(r.days||'').slice(0,50)};
 }
 return {custom,rates,fixtureOnly:input.fixtureOnly===true};
}
function letter(payload){
 if(!employees.includes(payload.commissionEmployee))throw Error('Select letter commission recipient');
 if(!['Cursive','Typewrited','Regular'].includes(payload.font))throw Error('Select letter font');
 if(!['Pink','Blue','White Gold'].includes(payload.color))throw Error('Select envelope color');
 const message=String(payload.message||'');
 if(message.length>6000||(message.trim().toUpperCase()!=='N/A'&&message.trim().length<100))throw Error('Letter must contain 100–6000 characters or N/A');
 if(payload.confirmation!=='PAYMENT RECEIVED')throw Error('Confirm the ₱200 payment was received');
 if(!methods.includes(payload.method))throw Error('Invalid payment method');
 return {paymentDate:date(payload.paymentDate),method:payload.method,paymentRef:String(payload.paymentRef||'').slice(0,150),amount:200,commission:50,addOnType:'Personalized Letter',addOnFont:payload.font,addOnColor:payload.color,addOnMessage:message.trim().toUpperCase()==='N/A'?'N/A':message,addOnCommissionRecipient:payload.commissionEmployee};
}
// Explicit allowlists prevent newly added financial fields leaking to operational roles.
function projection(o,actor){
 if(['owner','admin','sales'].includes(actor.role))return o;
 const items=o.items.filter(i=>actor.role==='editor'?i.kind==='editing'&&i.assignedTo===actor.uid:actor.role==='production'?i.kind==='frame':true).map(i=>Object.fromEntries(['kind','existingId','itemKey','orderType','size','design','fileType','rushTargetDate','frameOrderId','status','fileUrl','photoUrl','assignedTo','notes','trackingNumber','mockupUrl','addOnType','addOnFont','addOnColor','addOnMessage'].filter(k=>i[k]!==undefined).map(k=>[k,i[k]])));
 for(const item of items){const source=o.items.find(i=>i.itemKey===item.itemKey);if(source?.lateLetter)item.lateLetter=Object.fromEntries(['addOnType','addOnFont','addOnColor','addOnMessage'].map(k=>[k,source.lateLetter[k]]));}
 return {posId:o.posId,first:o.first,last:o.last,version:o.version,voidedAt:o.voidedAt,createdAt:o.createdAt,updatedAt:o.updatedAt,items,shipping:Object.fromEntries(['ship','receiverName','contactPhone','street','barangay','city','province','postal','area','notes'].map(k=>[k,o.shipping?.[k]||'']))};
}
module.exports={date,standards,dimensions,tier,productQuote,quoteOrder,pricingConfig,letter,projection};
