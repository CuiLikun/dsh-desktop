const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const runtimeRequire = createRequire(path.join(root, 'package.json'));
runtimeRequire('koffi');
runtimeRequire('node-pty');
runtimeRequire(path.join(root, 'node_modules/node-pty/prebuilds/win32-x64/conpty.node'));
console.log('PASS: bundled native terminal and FFI modules load.');
process.exit(0);
