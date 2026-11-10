const fs = require('node:fs');
const required = [
  'README.md', 'firebase.json', 'firestore.rules', 'firestore.indexes.json',
  'functions/core.js', 'functions/index.js', 'functions/package.json',
  'public/index.html', 'public/app.js', 'public/config.js', 'public/styles.css',
  'tests/core.test.js', 'tools/preview-legacy.js', 'tools/package.json',
  'reference/Original_Index.html', 'reference/Original_Code.gs.txt'
];
let missing = 0;
for (const path of required) {
  const exists = fs.existsSync(path);
  console.log(`${exists ? 'OK     ' : 'MISSING'} ${path}`);
  if (!exists) missing++;
}
console.log(`\n${required.length - missing}/${required.length} required source files present.`);
if (missing) process.exitCode = 1;
else console.log('Source completeness check passed. Business-feature parity and live integrations still require verification.');
