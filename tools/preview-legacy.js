/** Offline dry-run review of an exported Google Sheets POS Ledger CSV.
 * No firebase imports and no remote writes. Handles CSV column P = JSON Record.
 * npm install in this tools directory before running.
 * Usage: node preview-legacy.js /path/to/POS_Ledger.csv
 */
const fs=require('node:fs');const {parse}=require('csv-parse/sync');
const file=process.argv[2];if(!file)throw Error('Provide an exported POS Ledger CSV path');
const rows=parse(fs.readFileSync(file,'utf8'),{columns:true,bom:true,skip_empty_lines:true});
const results={total:rows.length,synced:0,excluded:0,errors:[],duplicates:[],ready:0};const seen=new Set();
for(let i=0;i<rows.length;i++){
 const row=rows[i],id=String(row['POS ID']||'').trim(),status=String(row['Sync Status']||'').trim().toUpperCase();
 if(status!=='SYNCED'){results.excluded++;continue;}results.synced++;
 if(seen.has(id)){results.duplicates.push(id);continue;}seen.add(id);
 try{const r=JSON.parse(row['JSON Record']||'');if(String(r.posId)!==id)throw Error('mismatched POS ID');if(!Array.isArray(r.items)||!r.items.length)throw Error('no items');results.ready++;}catch(e){results.errors.push({csvRow:i+2,id,detail:e.message});}
}
console.log(JSON.stringify(results,null,2));console.log('DRY RUN ONLY. No records were modified. No importing of old transactions occurs in this tool.');
