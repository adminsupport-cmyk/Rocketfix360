'use strict';
// Wire-format conversion only. All money and authorization remain server-side.
function toFirebase(record){
 const {updatedAt,items,shipping,...rest}=record;
 return {...rest,proofUrl:record.proof||record.proofUrl||'',shipping:{...shipping,notes:shipping?.shippingNotes??shipping?.notes??''},items:items.map(({uid,_addonOpen,...item})=>({...item,photoUrl:item.photo||item.photoUrl||''}))};
}
function fromFirebase(order){
 return {...order,updatedAt:order.version,encodedAt:order.createdAt,admin:order.recordedByName||order.admin||'',proof:order.proofUrl||'',shipping:{...order.shipping,shippingNotes:order.shipping?.notes||''},items:(order.items||[]).map(item=>({...item,photo:item.photoUrl||''}))};
}
function runner(dispatch,success=()=>{},failure=console.error){
 return new Proxy({}, {get(_target,key){
  if(key==='withSuccessHandler')return fn=>runner(dispatch,fn,failure);
  if(key==='withFailureHandler')return fn=>runner(dispatch,success,fn);
  return (...args)=>{Promise.resolve().then(()=>dispatch(key,args)).then(success,failure);};
 }});
}
module.exports={toFirebase,fromFirebase,runner};
