'use strict';
require('node:fs').writeFileSync('public/index.html',require('./restore-original-ui.cjs').generate());
require('esbuild').buildSync({entryPoints:['public/app.js'],bundle:true,outfile:'public/app.bundle.js',format:'esm',sourcemap:true});
