// scripts/looptest.mjs — navigate back and forth several times through real
// clicks and verify (a) the dock keeps the same node and keeps playing,
// (b) per-page bindings still work after many swaps, (c) no console errors.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4321/';
const ROUNDS = Number(process.argv[3] || 3);
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
    '--user-data-dir=' + path.resolve('.shots/prof-loop'),
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
    logs.push('ERR ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + String(msg.params.exceptionDetails.exception?.description || '').slice(0, 160));
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url });
await sleep(3200);

const evalIn = async (expression, gesture = false) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: gesture });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 200) };
  return out.result.value;
};

const click = async (sel, idx = 0) => {
  const p = await evalIn(`(() => { const els = document.querySelectorAll('${sel}'); const el = els[${idx}];
    if (!el) return null; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p || p.err) return p;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return p;
};

await evalIn(`(() => { const a = document.querySelector('[data-dock-audio]'); if (a) a.__id = 'original';
  const d = document.querySelector('[data-dock]'); if (d) d.__id = 'original'; return true; })()`);
await click('[data-dock-toggle]');
await sleep(1200);

const state = () =>
  evalIn(`(() => { const d = document.querySelector('[data-dock]'); const a = document.querySelector('[data-dock-audio]');
    return { url: location.pathname, playing: d?.dataset.playing, sameAudio: a ? a.__id === 'original' : false,
      paused: a?.paused, t: a ? Number(a.currentTime.toFixed(1)) : null,
      search: Boolean(document.querySelector('[data-search-form]')),
      clock: document.querySelector('[data-clock]')?.textContent?.trim() || null,
      revealHidden: document.querySelectorAll('[data-reveal]:not(.is-in)').length }; })()`);

const out = { start: await state(), rounds: [] };

for (let i = 0; i < ROUNDS; i++) {
  // to a post page (exercises Toc + PostLayout inline script)
  await click('.header__nav a[href^="/archive"], a[href^="/archive"]');
  await sleep(1800);
  const onArchive = await state();

  // open the first post from the archive
  await click('.archive a[href*="/posts/"], .arc__item a, a[href*="/posts/"]');
  await sleep(1800);
  const onPost = await state();

  // back home through the brand link
  await click('.header__brand, a[href="/"]');
  await sleep(1800);
  const home = await state();

  // the search card must still respond after this many swaps
  await evalIn(`(() => { const i = document.querySelector('[data-search-input]');
    if (!i) return false; i.value = 'linux'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(700);
  const hits = await evalIn(`(() => { const b = document.querySelector('[data-search-hits]');
    return b ? b.children.length : null; })()`);

  out.rounds.push({ onArchive, onPost, home, searchHits: hits });
}

out.end = await state();
out.logs = logs.slice(0, 10);
console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
