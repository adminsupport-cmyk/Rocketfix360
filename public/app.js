import {initializeApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {firebaseConfig,functionsRegion,useEmulators} from './config.js';
import adapter from './legacy-adapter.cjs';
const app=initializeApp(firebaseConfig),auth=getAuth(app),functions=getFunctions(app,functionsRegion);
if(useEmulators){
 if(!['localhost','127.0.0.1'].includes(location.hostname)||firebaseConfig.projectId!=='demo-rocketfix-360')throw Error('Sample orders require the local demo emulators');
 connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFunctionsEmulator(functions,'127.0.0.1',5001);
}else if(firebaseConfig.projectId!=='rocketfix-360-staging')throw Error('Only the confirmed staging project is allowed');
let profile=null,pricingVersion=0;
const requests=new WeakMap(),pending=new Map();
const invoke=async(name,data={})=>(await httpsCallable(functions,name,{timeout:70000})(data)).data;
async function history(){
 const all=[];let cursor=null;
 do{const page=await invoke('listOrders',{limit:150,cursor});all.push(...page.orders.filter(o=>!o.voidedAt).map(adapter.fromFirebase));cursor=page.nextCursor||null;}while(cursor);
 return all;
}
const unsupported=label=>{throw Error(label+' is unavailable until the original source and staging configuration are verified. No payment was recorded.');};
async function dispatch(method,args){
 if(method==='rfPosGetPublishedRelease')return {release:0};
 if(method!=='rfDeviceCall')throw Error('Unsupported POS action');
 if(!auth.currentUser||!profile)throw Error('Sign in with an authorized employee account');
 const [,action,values=[]]=args;
 switch(action){
 case 'history':return history();
 case 'status':{const posId=String(values[0]),requestId=pending.get(posId);const {order,requestCommitted}=await invoke('getOrder',{posId,...(requestId?{requestId}:{})});if(requestCommitted)pending.delete(posId);return {found:true,status:requestId&&!requestCommitted?'PROCESSING':order.voidedAt?'DELETED':'SYNCED',record:order.voidedAt||requestId&&!requestCommitted?null:adapter.fromFirebase(order)};}
 case 'save':{
  const record=values[0];if(values[1])return unsupported('Google Drive proof upload');
  if(!requests.has(record))requests.set(record,crypto.randomUUID());
  pending.set(record.posId,requests.get(record));
  const result=await invoke('saveOrder',{order:adapter.toFirebase(record),expectedVersion:record.updatedAt||null,requestId:requests.get(record)});
  const {order}=await invoke('getOrder',{posId:result.posId,requestId:requests.get(record)});pending.delete(record.posId);return {ok:true,record:adapter.fromFirebase(order)};
 }
 case 'delete':await invoke('voidOrder',{posId:values[0],expectedVersion:values[1],reason:'Confirmed by employee through original POS deletion workflow'});return {ok:true,deleted:true,posId:values[0]};
 case 'tips':return ['Select','Joyce','Renz','Joy','Lerni']; // Exact source fallback; edited workbook validation export remains blocked.
 case 'directory':return unsupported('The original returning-customer directory import');
 case 'historical':return unsupported('Historical sales import');
 case 'legacyGet':case 'legacySave':return unsupported('Historical order editing');
 case 'phLocations':return unsupported('Nationwide location lookup'); // Original province fallback and manual address entry remain available.
 case 'proofStart':case 'proofChunk':return unsupported('Google Drive proof upload');
 case 'framePricingGet':{
  const cfg=await invoke('getPricing');pricingVersion=cfg.version||0;
  // Synthetic rates are allowed only in the isolated demo emulator, never normal staging quotations.
  return useEmulators?cfg:{rates:{},custom:{}};
 }
 case 'framePricingSave':{
  if(!['owner','admin'].includes(profile.role))throw Error('Only an Owner or Admin can change pricing');
  if(!useEmulators)return unsupported('Unverified pricing changes');
  const cfg=await invoke('savePricing',{config:{...values[0],fixtureOnly:true},expectedVersion:pricingVersion});pricingVersion=cfg.version;return cfg;
 }
 case 'lateAddonLookup':{
  const {order}=await invoke('getOrder',{frameId:values[0]});
  const item=order.items.find(i=>i.kind==='frame'&&i.existingId===values[0]),add=item.lateLetter||item;
  const recorded=!!item.lateLetter,closed=/SHIP|DELIVER|COMPLET|REFUND|CANCEL/i.test(item.status);
  return {id:values[0],name:[order.first,order.last].filter(Boolean).join(' '),size:item.size,status:item.status,addOnType:add.addOnType||'',latePaymentRecorded:recorded,repairNeeded:false,editable:!closed&&!add.addOnType,viberConfigured:false,viberStatus:'DISABLED',reason:closed?'This frame is already shipped or closed.':add.addOnType?'A letter is already recorded. Do not collect another payment.':''};
 }
 case 'lateAddonSave':{
  if(values[0].repairOnly||values[0].viberOnly)return unsupported('Legacy add-on repair or external notification');
  const result=await invoke('saveLateLetter',values[0]);return {...result,frameVerified:true,viberStatus:'DISABLED',viberText:''};
 }
 case 'lateAddonSales':{
  const report=await invoke('salesReport',{from:'1900-01-01',to:'2100-12-31'});
  return report.lateLetters.map(x=>({id:x.id,date:x.paymentDate,amount:x.amount,customer:x.customer||'',email:x.email||'',staff:x.recordedBy||'',method:x.method}));
 }
 default:throw Error('Unsupported POS action: '+action);
 }
}
window.google={script:{run:adapter.runner(dispatch)}};
window.firebasePOS={
 signIn:async(email,password)=>signInWithEmailAndPassword(auth,email,password),
 signOut:async()=>{await signOut(auth);location.reload();},
 isDemo:useEmulators
};
onAuthStateChanged(auth,async user=>{
 try{
  profile=null;
  if(!user){window.rfFirebaseSession(null);return;}
  const access=await invoke('myAccess');
  if(!['owner','admin','sales'].includes(access.role))throw Error('This Admin POS requires an active Owner, Admin, or Sales role.');
  profile=access;window.rfFirebaseSession(access);
 }catch(error){window.rfFirebaseSession(null,error.message);}
});
