const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const directory = path.resolve(__dirname, '..', 'dist');
  const lines = [];
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.exe')).sort()) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(directory, name))) hash.update(chunk);
    lines.push(hash.digest('hex') + '  ' + name);
  }
  if (!lines.length) throw new Error('No built executables found.');
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  console.log('SHA256SUMS.txt generated.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
