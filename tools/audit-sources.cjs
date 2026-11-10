const fs = require('node:fs');
const required = [
  'README.md', 'firebase.json', 'firestore.rules', 'firestore.indexes.json',
  'functions/core.js', 'functions/index.js', 'functions/package.json',
  'public/index.html', 'public/app.js', 'public/config.js', 'public/styles.css',
  'tests/core.test.js', 'tools/preview-legacy.js', 'tools/package.json',
  'reference/Original_Index.html', 'reference/Original_Code.gs.txt',
  'functions/workflows.js','functions/notifications.js','functions/runtime.js',
  'functions/package-lock.json','package-lock.json','tests/workflows.test.js','tests/integration/emulators.test.cjs',
  'tools/build-client.cjs','tools/run-emulator-tests.cjs','tools/start-emulators.cjs','tools/seed-emulator.cjs',
  'tools/browser-smoke.cjs','tools/smoke-auth-hosting.cjs','docs/FEATURE_PARITY.md','docs/PROGRESS.md','docs/source-inventory.json',
  'reference/legacy/manifest.json','reference/legacy/README.md','docs/LEGACY_MIGRATION.md',
  'functions/provider-adapters.js','functions/notification-policy.js','tools/audit-legacy.cjs','tools/cache-firestore-emulator.cjs',
  'tests/provider-adapters.test.js','tests/notification-processing.test.js','tests/migration-safety.test.js','tests/local-provider-wire.test.js','tests/helpers/memory-db.cjs','docs/NOTIFICATIONS.md','docs/VALIDATION.md'
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
