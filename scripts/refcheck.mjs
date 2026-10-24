import { readdirSync } from 'node:fs';
import path from 'node:path';
const root = 'dist';
const pages = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html' || e.name === '404.html') {
      const rel = path.relative(root, d).split(path.sep).join('/');
      pages.push({ file: p, url: e.name === '404.html' ? '/404.html' : '/' + (rel ? rel + '/' : '') });
    }
  }
})(root);
import { readFileSync } from 'node:fs';
const refs = new Set();
const attr = /(?:href|src)="([^"]+)"/g;
for (const p of pages) {
  const html = readFileSync(p.file, 'utf8');
  let m;
  while ((m = attr.exec(html))) {
    const v = m[1];
    if (!v || v.startsWith('#') || v.startsWith('data:') || v.startsWith('mailto:')) continue;
    if (/^https?:\/\//i.test(v)) continue;
    if (v.startsWith('//')) continue;
    refs.add(v.split('#')[0]);
  }
}
const list = [...refs].filter(Boolean);
const bad = [];
let i = 0;
async function worker() {
  while (i < list.length) {
    const u = list[i++];
    const abs = u.startsWith('/') ? u : '/' + u;
    try {
      const r = await fetch('http://localhost:4400' + abs, { method: 'GET' });
      if (r.status >= 400) bad.push(abs + ' -> ' + r.status);
    } catch (e) { bad.push(abs + ' -> ' + e.message); }
  }
}
await Promise.all(Array.from({ length: 14 }, worker));
console.log('refs=' + list.length + ' bad=' + bad.length);
[...new Set(bad)].slice(0, 40).forEach((b) => console.log('  ' + b));
