'use strict';
const {round}=require('./core');
function dashboardTotals(orders,late,today){
 const active=orders.filter(o=>!o.voidedAt&&o.status==='SYNCED'),day=active.filter(o=>o.paymentDate===today),letters=late.filter(o=>o.paymentDate===today);
 const sum=key=>round(day.reduce((s,o)=>s+Number(o[key]||0),0));
 return {today,ordersToday:day.length,newOrdersToday:active.filter(o=>Number.isFinite(Date.parse(o.createdAt))&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(o.createdAt))===today).length,salesToday:round(sum('editPaid')+sum('framePaid')+letters.length*200),editingToday:sum('editPaid'),framingToday:round(sum('framePaid')+letters.length*200),tipsToday:sum('tip'),excessToday:sum('excess'),lateLettersToday:letters.length*200,pendingEditing:active.flatMap(o=>o.items).filter(i=>i.kind==='editing'&&i.status!=='Delivered').length,pendingFrames:active.flatMap(o=>o.items).filter(i=>i.kind==='frame'&&!['COMPLETED','REFUNDED'].includes(i.status)).length};
}
module.exports={dashboardTotals};
