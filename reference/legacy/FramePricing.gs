/** Rocketfix V14 — Shipping & 3-product Custom Size Settings. No standalone public functions. */
const RF_FRAME_CFG_TAB='POS Frame Pricing';
const RF_FRAME_AREAS=['Luzon','Visayas','Mindanao'];
const RF_FRAME_TIERS=['Small','Medium','Large','XL'];
const RF_FRAME_DEFAULTS=[
  ['Luzon','Small',220,'1-3 days'],['Luzon','Medium',220,'1-3 days'],['Luzon','Large',220,'1-3 days'],['Luzon','XL',390,'1-3 days'],
  ['Visayas','Small',240,'3-5 days'],['Visayas','Medium',240,'3-5 days'],['Visayas','Large',240,'3-5 days'],['Visayas','XL',393,'3-5 days'],
  ['Mindanao','Small',220,'5-7 days'],['Mindanao','Medium',230,'5-7 days'],['Mindanao','Large',249,'5-7 days'],['Mindanao','XL',393,'5-7 days']
];
const RF_FRAME_PRODUCT_EXTRA=[
 ['printRate','Print Only: rate per sq. inch',0],
 ['printBase','Print Only: base fee',0],
 ['printMinimum','Print Only: minimum price',0],
 ['framedMinWidth','Black Frame: minimum width (in)',4],
 ['framedMaxWidth','Black Frame: maximum width (in)',60],
 ['framedMinHeight','Black Frame: minimum height (in)',4],
 ['framedMaxHeight','Black Frame: maximum height (in)',60],
 ['printMinWidth','Print Only: minimum width (in)',4],
 ['printMaxWidth','Print Only: maximum width (in)',60],
 ['printMinHeight','Print Only: minimum height (in)',4],
 ['printMaxHeight','Print Only: maximum height (in)',60],
 ['canvasMinWidth','Canvas Only: minimum width (in)',4],
 ['canvasMaxWidth','Canvas Only: maximum width (in)',60],
 ['canvasMinHeight','Canvas Only: minimum height (in)',4],
 ['canvasMaxHeight','Canvas Only: maximum height (in)',60]
];
function rfFrameProductKind_(design){
 const s=String(design||'').trim().toLowerCase();
 if(s==='black with acrylic frame')return 'framed';
 if(s==='print only')return 'print';
 if(s==='canvas without frame')return 'canvas';
 throw Error('Unknown frame product type: '+String(design||''));
}
function rfFrameValidateLimits_(w,h,kind,c){
 const pre=kind==='framed'?'framed':kind;
 const a=Number(c[pre+'MinWidth']),b=Number(c[pre+'MaxWidth']),d=Number(c[pre+'MinHeight']),e=Number(c[pre+'MaxHeight']);
 if(![w,h,a,b,d,e].every(Number.isFinite)||w<a||w>b||h<d||h>e)
  throw Error((kind==='framed'?'Black Frame with Acrylic':kind==='print'?'Print Only':'Canvas Only')+' dimensions must be within width '+a+'–'+b+' in and height '+d+'–'+e+' in.');
}
function rfFrameExtraSettingsInit_(sh){
 // Legacy H2:H9 settings are retained; extensions begin at G10/H10.
 const old=sh.getRange(10,7,RF_FRAME_PRODUCT_EXTRA.length,2).getValues();
 const legacy=sh.getRange('H8:H9').getValues().flat();
 const legacyMin=Number(legacy[0])>0?Number(legacy[0]):4;
 const legacyMax=Number(legacy[1])>=legacyMin?Number(legacy[1]):60;
 const rowValues=RF_FRAME_PRODUCT_EXTRA.map((entry,i)=>{
   const existingLabel=String(old[i][0]||'').trim();
   if(existingLabel&&existingLabel!==entry[1])throw Error('POS Frame Pricing extra-setting label conflict at G'+(10+i)+'; review sheet before upgrading.');
   const value=old[i][1];
   const defaultValue=entry[0].includes('MinWidth')||entry[0].includes('MinHeight')?legacyMin:entry[0].includes('MaxWidth')||entry[0].includes('MaxHeight')?legacyMax:entry[2];
   return [entry[1],value===''||value===null?defaultValue:value];
 });
 // Only initialize when needed; never overwrite existing edited values.
 if(rowValues.some((r,i)=>String(old[i][0]||'')!==r[0]||old[i][1]===''||old[i][1]===null))
  sh.getRange(10,7,rowValues.length,2).setValues(rowValues);
}
function rfFrameCfgSheet_(){
  const ss=SpreadsheetApp.openById(POS_MASTER_ID);let sh=ss.getSheetByName(RF_FRAME_CFG_TAB);
  if(!sh){
    sh=ss.insertSheet(RF_FRAME_CFG_TAB);
    const head=['Area','Size Tier','Rate PHP','Delivery Estimate','Updated At'];
    sh.getRange(1,1,1,5).setValues([head]);
    sh.getRange(2,1,RF_FRAME_DEFAULTS.length,5).setValues(RF_FRAME_DEFAULTS.map(x=>[...x,'']));
    sh.getRange('G1:H9').setValues([
      ['Custom Pricing Configuration','PHP'],['Framed: rate per sq. inch',''],['Framed: base fee',''],['Framed: minimum price',''],
      ['Canvas unframed: rate per sq. inch',''],['Canvas unframed: base fee',''],['Canvas unframed: minimum price',''],
      ['Minimum dimension inches','4'],['Maximum dimension inches','60']
    ]);
    sh.setFrozenRows(1);sh.getRange('A1:E1').setFontWeight('bold').setBackground('#174d37').setFontColor('#ffffff');
    sh.getRange('G1:H1').setFontWeight('bold').setBackground('#174d37').setFontColor('#ffffff');
    sh.autoResizeColumns(1,5);sh.autoResizeColumns(7,2);
  }
  rfFrameExtraSettingsInit_(sh);
  return sh;
}
function rfFrameCfgRead_(){
  const sh=rfFrameCfgSheet_(),grid=sh.getRange(2,1,12,4).getValues();
  const rates={};grid.forEach(x=>{const area=String(x[0]||'').trim(),tier=String(x[1]||'').trim();if(RF_FRAME_AREAS.includes(area)&&RF_FRAME_TIERS.includes(tier)&&Number.isFinite(Number(x[2]))&&Number(x[2])>=0){rates[area+'|'+tier]={rate:Number(x[2]),days:String(x[3]||'').slice(0,50)};}});
  const vals=sh.getRange('H2:H9').getValues().flat();
  const custom={framedRate:Number(vals[0]||0),framedBase:Number(vals[1]||0),framedMinimum:Number(vals[2]||0),canvasRate:Number(vals[3]||0),canvasBase:Number(vals[4]||0),canvasMinimum:Number(vals[5]||0),minDim:Number(vals[6]||4),maxDim:Number(vals[7]||60)};
  const ext=sh.getRange(10,8,RF_FRAME_PRODUCT_EXTRA.length,1).getValues();
  RF_FRAME_PRODUCT_EXTRA.forEach((setting,i)=>custom[setting[0]]=Number(ext[i][0]??setting[2]));
  return {rates,custom};
}
function rfFrameSettingsGet_(){return rfFrameCfgRead_();}
function rfFrameSettingsSave_(data,device){
  if(!data||!data.rates||!data.custom)throw Error('Shipping settings missing.');
  const sh=rfFrameCfgSheet_(),vals=RF_FRAME_DEFAULTS.map(d=>{
    const key=d[0]+'|'+d[1],entry=data.rates[key];if(!entry)throw Error('Missing rate '+key);
    const n=Number(entry.rate);if(!Number.isFinite(n)||n<0||n>100000)throw Error('Invalid shipping fee '+key);
    const days=String(entry.days||'').trim().slice(0,50);if(!days)throw Error('Enter estimated delivery days for '+key);
    return [d[0],d[1],n,days,new Date()];
  });
  const c=data.custom,keys=['framedRate','framedBase','framedMinimum','canvasRate','canvasBase','canvasMinimum'];
  const nums=keys.map(k=>{const raw=c[k];if(raw===''||raw===null||raw===undefined)return '';const n=Number(raw);if(!Number.isFinite(n)||n<0||n>100000)throw Error('Invalid custom pricing input: '+k);return n;});
  // V14.1: Legacy H8:H9 are retained, not part of the new per-product Settings form.
  // Do not require or overwrite these unused legacy dimensions when saving.
  const extra=RF_FRAME_PRODUCT_EXTRA.map(([key,_,fallback])=>{
    const n=Number(c[key]===undefined?fallback:c[key]);
    const isDimension=/^(framed|print|canvas)(Min|Max)(Width|Height)$/.test(key);
    if(!Number.isFinite(n)||n<0||(!isDimension&&n>100000))throw Error('Invalid value for '+key);
    return n;
  });
  for(const pre of ['framed','print','canvas']){
    const all={};RF_FRAME_PRODUCT_EXTRA.forEach((entry,i)=>all[entry[0]]=extra[i]);
    const a=all[pre+'MinWidth'],b=all[pre+'MaxWidth'],d=all[pre+'MinHeight'],e=all[pre+'MaxHeight'];
    if(!(a>0&&d>0&&b>=a&&e>=d))throw Error(pre+' requires positive dimensions and maximum width/height at least equal to minimum.');
  }
  const lock=LockService.getScriptLock();lock.waitLock(15000);try{
    sh.getRange(2,1,12,5).setValues(vals);
    sh.getRange(2,8,6,1).setValues(nums.map(x=>[x]));
    sh.getRange(10,8,extra.length,1).setValues(extra.map(x=>[x]));
  }finally{lock.releaseLock();}
  return rfFrameCfgRead_();
}
function rfFrameProductQuote_(item,cfg){
  const kind=rfFrameProductKind_(item.design);
  const custom=!!item.customSize;
  let w=Number(item.customWidth),h=Number(item.customHeight);
  if(!custom){
    const match=String(item.size||'').match(/([\d.]+)\s*"?\s*[x×]\s*([\d.]+)/i);
    if(!match)throw Error('Select a recognizable standard size for '+item.design+'.');
    w=Number(match[1]);h=Number(match[2]);
  }
  rfFrameValidateLimits_(w,h,kind,cfg.custom);
  // Standard framed sizes keep fixed SRP, but still obey production limits.
  if(!custom&&kind==='framed')return {price:Number(item.amount)||0,calculated:false};
  const rate=Number(cfg.custom[kind+'Rate']||0),base=Number(cfg.custom[kind+'Base']||0),minimum=Number(cfg.custom[kind+'Minimum']||0);
  if(!(rate>0))return {price:null,calculated:false,needsQuote:true};
  return {price:Math.max(minimum,Math.ceil(w*h*rate+base)),calculated:true};
}
function rfFrameTier_(item){
  const canonical=[['Small',10,13],['Medium',13,17],['Large',18,26.5],['XL',25.5,35]];
  let w,h;
  if(item.customSize){w=Number(item.customWidth);h=Number(item.customHeight);}
  else{const m=String(item.size||'').match(/([\d.]+)\s*"?\s*[x×]\s*([\d.]+)/i);if(!m)return null;w=Number(m[1]);h=Number(m[2]);}
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return null;
  const a=Math.min(w,h),b=Math.max(w,h);
  return canonical.find(x=>a<=x[1]&&b<=x[2])?.[0]||null;
}
function rfFrameShippingQuote_(r,cfg){
 const frames=(r.items||[]).filter(x=>x.kind==='frame');
 if(!frames.length)return {fee:0,tier:'NONE',days:'',manual:false,breakdown:[]};
 const area=String(r.shipping?.area||'').trim();
 if(area&&!RF_FRAME_AREAS.includes(area))throw Error('Select a valid shipping area or leave it pending and enter a confirmed fee for every frame.');
 const method=String(r.shipping?.ship||'LBC').toUpperCase();
 const breakdown=[];let total=0;
 for(const item of frames){
   const tier=rfFrameTier_(item),config=tier?cfg.rates[area+'|'+tier]:null;
   const raw=item.shippingFee;
   const explicit=raw!==undefined&&raw!==null&&String(raw).trim()!=='';
   if(!explicit&&(!area||method==='LALAMOVE'||!config))throw Error('Provide the shipping fee for frame '+item.existingId+' (courier/oversize quote or shipping area pending).');
   const fee=posMoney_(posNum_(explicit?raw:config.rate));
   item.shippingFee=fee;
   item.shippingTier=tier||'MANUAL';
   item.shippingDays=config?.days||'';
   breakdown.push({id:item.existingId,fee,tier:item.shippingTier,days:item.shippingDays});
   total=posMoney_(total+fee);
 }
 return {fee:total,tier:'PER FRAME',days:'',manual:false,breakdown};
}
