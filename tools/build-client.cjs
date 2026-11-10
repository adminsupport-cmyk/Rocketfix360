'use strict';
require('esbuild').buildSync({entryPoints:['public/app.js'],bundle:true,outfile:'public/app.bundle.js',format:'esm',sourcemap:true});
