'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.RF_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.RF_BROWSER_EXECUTABLE});
 const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/parity/screenshots');fs.mkdirSync(out,{recursive:true});
 try{const page=await browser.newPage();for(const label of ['desktop','ipad-portrait','ipad-landscape'])for(const mode of ['','-frame']){
  const uri=side=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'.runtime/parity',label+mode+'-'+side+'.png')).toString('base64');
  await page.setContent('<canvas></canvas>');
  const size=await page.evaluate(async([left,right])=>{
   const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
   const [a,b]=await Promise.all([load(left),load(right)]),canvas=document.querySelector('canvas');canvas.width=a.width+b.width;canvas.height=Math.max(a.height,b.height)+40;
   const c=canvas.getContext('2d');c.fillStyle='#080a0e';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(a,0,40);c.drawImage(b,a.width,40);c.fillStyle='white';c.font='16px sans-serif';c.fillText('ORIGINAL — OFFLINE REFERENCE',16,26);c.fillText('FIREBASE — LOCAL SAMPLE ENVIRONMENT',a.width+16,26);
   document.body.style.margin='0';return {width:canvas.width,height:canvas.height};
  },[uri('original'),uri('firebase')]);
  await page.setViewportSize({width:size.width,height:1000});await page.locator('canvas').screenshot({path:path.join(out,label+mode+'-comparison.png')});
 }console.log('Saved six side-by-side screenshot comparisons.');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
