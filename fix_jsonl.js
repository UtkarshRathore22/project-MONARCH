const fs = require('fs');
const content = fs.readFileSync('train.jsonl', 'utf8');
// Replace literal \n only when followed by the start of a new message object
const fixed = content.replace(/\\n(?=\{"messages")/g, '\n');
fs.writeFileSync('train.jsonl', fixed);
console.log('Fixed train.jsonl');
