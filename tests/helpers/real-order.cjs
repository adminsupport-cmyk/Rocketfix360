'use strict';
const source=require('../../functions/real-pricing-source.json'),{realContext}=require('../../functions/real-orders'),{quoteOrder}=require('../../functions/workflows'),{validate}=require('../../functions/core');
const frame={kind:'frame',existingId:'AB7C8',amount:799,size:'10"x13" - Small',design:'Black with Acrylic Frame',shippingFee:220,shippingManual:false},base={posId:'76543210',paymentDate:'2026-11-11',first:'Customer',email:'N/A',method:'GCash',stagingTest:false,paymentMode:'REAL_POS_V1',shipping:{ship:'LBC',area:'Luzon'},received:2000,discount:10,tip:5,tipRecipient:'Joyce',items:[frame]};
function saved(raw=base){const p=realContext(raw,source);return {...validate(quoteOrder(raw,p.config,true)),environment:'staging',stagingTest:false,paymentMode:'REAL_POS_V1',pricingStatus:'SOURCE_VERIFIED',status:'SYNCED',version:1,createdAt:'2026-11-11T00:00:00.000Z',updatedAt:'2026-11-11T00:00:00.000Z'};}
module.exports={saved,base,frame};
