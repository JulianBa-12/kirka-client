'use strict';
// Minimal stand-in for the `electron` module so main-process modules can be unit-tested in Node.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-client-test-'));
const stub = { app: { getPath: () => userData, getVersion: () => '1.0.0', isPackaged: false } };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'electron' ? 'electron-stub' : origResolve.call(this, request, ...rest); };
require.cache['electron-stub'] = { id: 'electron-stub', filename: 'electron-stub', loaded: true, exports: stub };
module.exports = { userData };
