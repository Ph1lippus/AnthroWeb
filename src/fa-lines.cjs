const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');
lines.forEach((l, i) => {
    if (/fa-/.test(l)) console.log((i + 1) + ': ' + l.replace(/\s+/g, ' ').trim());
});
