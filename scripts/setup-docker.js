'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = '.env';
let content = fs.existsSync(file)
  ? fs.readFileSync(file, 'utf8')
  : fs.readFileSync('.env.example', 'utf8');
if (
  !/^POSTGRES_PASSWORD=.+$/m.test(content) ||
  /^POSTGRES_PASSWORD=change-me$/m.test(content)
) {
  const line = `POSTGRES_PASSWORD=${crypto.randomBytes(32).toString('hex')}`;
  content = /^POSTGRES_PASSWORD=.*$/m.test(content)
    ? content.replace(/^POSTGRES_PASSWORD=.*$/m, line)
    : content + '\n' + line + '\n';
  fs.writeFileSync(file, content, { mode: 0o600 });
}
console.log(
  'Docker environment is ready. Database credentials are stored in .env.',
);
