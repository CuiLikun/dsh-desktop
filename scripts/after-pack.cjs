const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveRuntime } = require('../src/runtime.cjs');
module.exports = async context => {
  // electron-builder's resource filters omit node_modules. Harness is an
  // independent Node application, so copy its entire locked runtime verbatim.
  const source = path.resolve(__dirname, '..', 'runtime');
  const target = path.join(context.appOutDir, 'resources', 'runtime');
  await fs.cp(source, target, { recursive: true, dereference: true });
  resolveRuntime(target);
  console.log('Complete Harness runtime copied, including node_modules.');
};
