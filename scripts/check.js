'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const roots = ['server.js', 'server', 'shared', 'public', 'scripts', 'tests'];
const files = [];
function walk(file) { if (fs.statSync(file).isDirectory()) for (const child of fs.readdirSync(file)) walk(path.join(file, child)); else if (file.endsWith('.js')) files.push(file); }
roots.forEach(walk);
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); }
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
