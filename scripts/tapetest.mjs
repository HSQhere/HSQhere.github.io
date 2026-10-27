// scripts/tapetest.mjs — the homepage cassette lives only on /, so its
// bindings must be re-established by register('motion:tape') every time the
// visitor lands back on the homepage through a client-side navigation.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321';

const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9800 + Math.floor(Math.random() * 300);

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + path.resolve('.shots/prof-tape'),
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
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + String(msg.params.exceptionDetails.exception?.description || '').slice(0, 160));
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const evalIn = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 160) };
  return out.result.value;
};

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function clickSel(sel) {
  const box = await evalIn(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!box || box.err) return null;
  await clickAt(box.x, box.y);
  return box;
}

const tapeState = () =>
  evalIn(`(() => { const a = document.querySelector('[data-tape-audio]');
    return a ? { paused: a.paused, t: Math.round(a.currentTime * 100) / 100, src: a.currentSrc.split('/').pop() } : null; })()`);

const out = {};

await send('Page.navigate', { url: base + '/' });
await sleep(3200);
out.home1Tape = Boolean(await evalIn(`Boolean(document.querySelector('[data-tape]'))`));

// round 1: play on the homepage
out.toggle1 = await clickSel('[data-tape-toggle]');
await sleep(900);
out.play1 = await tapeState();

// navigate away with a real click, come back, play again
out.nav1 = await clickSel('.header__nav a[href="/archive/"]');
await sleep(2200);
out.away = await evalIn(`({ url: location.pathname, tape: Boolean(document.querySelector('[data-tape]')) })`);

out.navBack = await clickSel('.header__nav a[href="/"]');
await sleep(2400);
out.home2Tape = Boolean(await evalIn(`Boolean(document.querySelector('[data-tape]'))`));
out.play2 = await tapeState();

out.toggle2 = await clickSel('[data-tape-toggle]');
await sleep(1000);
out.play3 = await tapeState();

// and the dock must be the same node the whole time
out.dock = await evalIn(`(() => { const d = document.querySelector('[data-dock]');
  return { same: d?.dataset.dockReady === '1', playing: d?.dataset.playing ?? null }; })()`);

out.logs = logs.slice(0, 5);
console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
