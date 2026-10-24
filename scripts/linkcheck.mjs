import { readdirSync } from 'node:fs';
import path from 'node:path';
const root = 'dist';
const urls = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') {
      const rel = path.relative(root, d).split(path.sep).join('/');
      urls.push('/' + (rel ? rel + '/' : ''));
    }
  }
})(root);
const bad = [];
let i = 0;
async function worker() {
  while (i < urls.length) {
    const u = urls[i++];
    try {
      const r = await fetch('http://localhost:4400' + encodeURI(u), { method: 'GET' });
      if (r.status !== 200) bad.push(u + ' -> ' + r.status);
    } catch (e) { bad.push(u + ' -> ' + e.message); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
console.log('checked=' + urls.length + ' bad=' + bad.length);
bad.slice(0, 20).forEach((b) => console.log('  ' + b));
