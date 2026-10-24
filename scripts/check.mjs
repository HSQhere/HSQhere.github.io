// scripts/check.mjs — probe a running dev/preview server and print statuses.
// Usage: node scripts/check.mjs http://localhost:4331 [paths...]
const base = process.argv[2] || 'http://localhost:4331';
const paths = process.argv.slice(3);
const targets = paths.length
  ? paths
  : [
      '/',
      '/archive/',
      '/gallery/',
      '/gallery/sun/',
      '/gallery/friends/',
      '/plan/',
      '/friends/',
      '/about/',
      '/search/',
      '/search-index.json',
      '/rss.xml',
      '/404/',
      '/2026/07/02/有感FOC(SVPWM)/',
    ];

const marker = 'class="katex-error"';
let bad = 0;

for (const p of targets) {
  const url = base + p;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
    const body = res.ok ? await res.text() : '';
    let hits = 0;
    for (let i = body.indexOf(marker); i !== -1; i = body.indexOf(marker, i + 1)) hits++;
    console.log(`${res.status}  ${String(body.length).padStart(7)}  kerr=${hits}  ${p}`);
    if (!res.ok) bad++;
  } catch (err) {
    console.log(`ERR   ${p}  ${err.message}`);
    bad++;
  }
}

console.log(bad ? `\n${bad} failed` : '\nall ok');
process.exit(bad ? 1 : 0);