'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(dist, 'shared'), { recursive: true });
fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
for (const [source, target] of [
  ['jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js'],
  ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js'],
]) fs.copyFileSync(path.join(root, 'node_modules', source), path.join(dist, 'vendor', target));
fs.writeFileSync(path.join(dist, 'vendor', 'LICENSES.txt'),
  [['jspdf', 'LICENSE'], ['jspdf-autotable', 'LICENSE.txt']].map(([pkg, license]) => `${pkg}\n${fs.readFileSync(path.join(root, 'node_modules', pkg, license), 'utf8')}`).join('\n\n'));
console.log('Built frontend, shared pricing, and local PDF libraries into dist/.');
