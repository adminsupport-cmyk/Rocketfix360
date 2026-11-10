'use strict';
const source=require('./real-pricing-source.json'),{pricingConfig,quoteOrder}=require('./workflows'),{validate}=require('./core');
function realPricing(input=source){
 const c=pricingConfig(input),required=Object.keys(source.custom);
 for(const key of required){if(input.custom?.[key]===undefined||input.custom[key]===null||input.custom[key]===''||!Number.isFinite(Number(input.custom[key])))throw Error('Complete verified product pricing is required: '+key);if(!/Min|Max/.test(key)&&Number(input.custom[key])>100000)throw Error('Product pricing exceeds the original allowed range');}
 for(const kind of ['framed','print','canvas'])for(const axis of ['Width','Height'])if(!(c.custom[kind+'Min'+axis]>0&&c.custom[kind+'Max'+axis]>=c.custom[kind+'Min'+axis]))throw Error('Positive product dimension limits required');
 for(const key of Object.keys(source.rates))if(!c.rates[key]||!c.rates[key].days.trim()||c.rates[key].rate>100000)throw Error('Complete shipping fee and delivery estimate required: '+key);
 const standards={};for(const key of Object.keys(source.standards)){const n=Number((input.standards||source.standards)[key]);if(!Number.isFinite(n)||n<=0||n>100000)throw Error('Valid standard frame prices required');standards[key]=n;}
 return {...c,standards,sourceVerified:true,fixtureOnly:false,source:input.source||source.source,tipRecipients:[...source.tipRecipients]};
}
function activePricing(cfg){return {...realPricing(cfg?.sourceVerified===true?cfg:source),version:Number(cfg?.version||0)};}
function realContext(order,cfg){
 if(order?.stagingTest!==false||order.paymentMode!=='REAL_POS_V1'||order.fixtureVersion||order.fixtureAcknowledgement)throw Error('Real order mode required; fictional submissions are disabled');
 const config=activePricing(cfg);if(!['GCash','BDO','BPI','GoTyme','Cash','Bank Transfer','Other'].includes(order.method))throw Error('Select a valid payment method');
 if(Number(order.tip||0)>0&&!config.tipRecipients.includes(order.tipRecipient))throw Error('Select a tip recipient from the verified employee list');
 validate(quoteOrder(order,config,true));return {config,stagingTest:false,fixtureVersion:null,paymentMode:'REAL_POS_V1',pricingVersion:config.version};
}
function assertRealSavedOrder(o){
 if(!o||o.stagingTest!==false||o.environment!=='staging'||o.status!=='SYNCED'||o.voidedAt||!['AGREED_EDITING_V1','REAL_POS_V1'].includes(o.paymentMode))throw Error('REAL_CONFIRMED_ORDER_REQUIRED');
 if(o.items.some(i=>i.kind==='frame')&&o.pricingStatus!=='SOURCE_VERIFIED')throw Error('VERIFIED_SAVED_FRAME_PRICE_REQUIRED');
 const checked=validate(o);for(const key of ['received','due','discount','tip','excess','editPaid','framePaid','shippingFee','subtotal'])if(o[key]!==checked[key])throw Error('SAVED_FINANCIAL_ALLOCATION_MISMATCH');
 for(const i of o.items){const c=checked.items.find(c=>c.itemKey===i.itemKey);if(!c||i._paid!==c._paid||i._discount!==c._discount)throw Error('SAVED_FINANCIAL_ALLOCATION_MISMATCH');}return checked;
}
module.exports={realPricing,activePricing,realContext,assertRealSavedOrder};
