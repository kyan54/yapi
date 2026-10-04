'use strict';
// Dependency-free inventory. Never opens the database or executes project code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../..'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const protectedPaths = ['server/models', 'server/controllers', 'server/utils/mongoose-auto-increment.js', 'server/middleware/mockServer.js', 'exts', 'test/swagger.v2.json', 'test/swagger.v3.json'];
const files = {};
function collect(relative) {
  const full = path.join(root, relative);
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw Error('Symlinks are not allowed in baseline: ' + relative);
  if (stat.isDirectory()) return fs.readdirSync(full).sort().forEach(name => collect(relative + '/' + name));
  files[relative] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}
protectedPaths.forEach(collect);
process.stdout.write(JSON.stringify({ format:'yapi.baseline.v1', name:pkg.name, version:pkg.version, dependencies:pkg.dependencies, devDependencies:pkg.devDependencies, protectedFiles:files }, null, 2)+'\n');
