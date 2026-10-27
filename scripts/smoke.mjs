// scripts/smoke.mjs — visit every top-level page through client-side
// navigation and report anything broken: console errors, a missing dock, a
// page whose own script did not re-bind.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321';
const W = 1440;
const H = 900;

const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9400 + Math.floor(Math.random() * 400);

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    `--window-size=${W},${H}`,
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + path.resolve('.shots/prof-smoke'),
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const ws = new WebSocket(await targetWs());
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push('ERR ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + String(msg.params.exceptionDetails.exception?.description || '').slice(0, 200));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('NET ' + String(msg.params.entry.text || '').slice(0, 160));
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: base + '/' });
await sleep(3400);

const evalIn = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 200) };
  return out.result.value;
};

const clickSel = async (sel, idx = 0) => {
  const p = await evalIn(`(() => { const el = document.querySelectorAll('${sel}')[${idx}]; if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p || p.err) return p;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return p;
};

await evalIn(`(() => { const a = document.querySelector('[data-dock-audio]'); if (a) a.__id = 'original';
  const d = document.querySelector('[data-dock]'); if (d) d.__id = 'original'; return true; })()`);
await clickSel('[data-dock-toggle]');
await sleep(1200);

const probe = () =>
  evalIn(`(() => { const d = document.querySelector('[data-dock]'); const a = document.querySelector('[data-dock-audio]');
    return {
      url: location.pathname,
      title: document.title,
      dock: Boolean(d),
      sameAudio: a ? a.__id === 'original' : false,
      playing: d?.dataset.playing ?? null,
      t: a ? Number(a.currentTime.toFixed(1)) : null,
      bodyLocked: document.body.classList.contains('is-locked'),
      revealOff: document.querySelectorAll('[data-reveal]:not(.is-in)').length,
      searchCard: Boolean(document.querySelector('[data-search-form]')),
    }; })()`);

const targets = ['/archive/', '/tags/', '/categories/', '/gallery/', '/plan/', '/about/', '/search/'];
const out = { start: await probe(), steps: [] };

for (const t of targets) {
  const ok = await evalIn(`(() => { const a = Array.from(document.querySelectorAll('a[href]'))
      .find((x) => x.getAttribute('href') === '${t}'); if (!a) return false; a.click(); return true; })()`);
  await sleep(2000);
  const s = await probe();
  out.steps.push({ wanted: t, linked: ok, ...s });
}

// and one post page, reached from the archive
await evalIn(`(() => { const a = Array.from(document.querySelectorAll('a[href]'))
    .find((x) => x.getAttribute('href') === '/archive/'); if (a) a.click(); return true; })()`);
await sleep(1800);
const postLink = await evalIn(`(() => { const a = document.querySelector('a[href^="/20"]');
  return a ? a.getAttribute('href') : null; })()`);
if (postLink) {
  await evalIn(`document.querySelector('a[href^="/20"]').click()`);
  await sleep(2200);
  out.post = await probe();
  out.postToc = await evalIn(`({ links: document.querySelectorAll('[data-toc-link]').length,
    active: document.querySelectorAll('[data-toc-link].is-active').length })`);
}

out.logs = logs.slice(0, 12);
console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
