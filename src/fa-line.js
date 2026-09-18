const fs = require('fs');
const target = process.argv[2];
const c = fs.readFileSync(target, 'utf8');
const lines = c.split('\n');
lines.forEach((l, i) => {
    if (/fa-/.test(l)) console.log((i + 1) + ': ' + l.replace(/\s+/g, ' ').trim());
});
