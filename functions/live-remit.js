'use strict';
const cfg=require('./remit-live-config.json'),{mirrorPlan}=require('./sheets-mirror');
function assertLiveConfig(c=cfg){
 if(c.environment!=='approved-live-remit'||c.enabled!==true||c.productionWritesEnabled!==true||c.authorization!=='USER_APPROVED_REAL_EDITING_MANUAL_REMIT_2026_11_11'||c.spreadsheetId!=='10W8zrKf9rX-BFH2VLDyj8dwNlVJDca2_yArN9eIyNwY'||c.sheetId!==1830742337||c.tab!=='REMIT'||c.firstRow!==6||c.lastRow!==10630||c.timeZone!=='Asia/Hong_Kong'||c.writerServiceAccount!=='OWNER_OAUTH'||JSON.stringify(c.headers)!==JSON.stringify(require('./remit-config.json').headers))throw Error('APPROVED_LIVE_REMIT_REQUIRED');return c;
}
function livePlan(o,itemKey){
 assertLiveConfig();if(o?.stagingTest!==false||o.environment!=='staging'||o.voidedAt||o.status!=='SYNCED')throw Error('REMIT_REAL_CONFIRMED_EDITING_ORDER_REQUIRED');
 const checked=require('./real-orders').assertRealSavedOrder(o);
 const p=mirrorPlan(o).find(p=>p.destination==='master'&&p.key===itemKey);if(!p)throw Error('REMIT_SAVED_EDITING_ITEM_REQUIRED');const i=o.items.find(i=>i.itemKey===itemKey),clean=checked.items.find(i=>i.itemKey===itemKey);if(!clean||i._paid!==clean._paid||i._discount!==clean._discount)throw Error('REMIT_SAVED_FINANCIAL_ALLOCATION_MISMATCH');
 delete p.cells[27];delete p.formats[27];p.cells[7]=i.fileUrl||'';p.cells[9]=i.noteFileUrl||'';return p;
}
function createLiveRemit(db,{transport}={}){
 const {createRemitTransport}=require('./remit-transport');
 if(!transport){const auth=require('./drive-proof-transport').createDriveProofTransport();transport=createRemitTransport({cfg,validateConfig:assertLiveConfig,appendAfterLast:true,clientFactory:()=>{if(process.env.FUNCTIONS_EMULATOR==='true'||process.env.GCLOUD_PROJECT!=='rocketfix-360-staging')throw Error('REMIT_EMULATOR_EXTERNAL_ACCESS_DISABLED');return auth.serverOAuthClient();}});}
 return require('./manual-remit').createManualRemit(db,{cfg,transport,planOrder:livePlan,validateConfig:assertLiveConfig});
}
module.exports={cfg,assertLiveConfig,livePlan,createLiveRemit};
