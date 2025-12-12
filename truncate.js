const fs = require('fs');
const path = 'frontend/app/actions.ts';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
const truncated = lines.slice(0, 946).join('\n');
fs.writeFileSync(path, truncated);
console.log('Truncated to 946 lines');
