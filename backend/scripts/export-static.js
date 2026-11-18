'use strict';
/** Exports signed bundles, release manifest, news and changelog as static JSON (for GitHub Pages). */
const path = require('path');
const cfg = require('../config');
const { createContext } = require('../app');
const { exportStatic } = require('../services/publishing');
const out = path.resolve(process.argv[2] || path.join(__dirname, '../../apps/community-hub/public/data'));
const ctx = createContext(cfg);
const files = exportStatic(ctx, out);
console.log(`wrote ${files.join(', ')} to ${out}`);
ctx.db.close();
