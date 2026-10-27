// scripts/bustest.mjs — real clicks so play() is gesture-trusted, then check
// that the dock and the homepage cassette never play at the same time.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4321/';

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
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + path.resolve('.shots/prof-bus'),
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

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url });
await sleep(3400);

const evalIn = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 160) };
  return out.result.value;
};

const clickSel = async (sel) => {
  const p = await evalIn(`(() => { const el = document.querySelector('${sel}'); if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!p || p.err) return p;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  return p;
};

const state = (tag) =>
  evalIn(`(() => { const d = document.querySelector('[data-dock-audio]'); const t = document.querySelector('[data-tape-audio]');
    return { tag: '${tag}',
      dock: d ? { paused: d.paused, t: Number(d.currentTime.toFixed(1)), src: decodeURIComponent(d.src).split('/').pop() } : null,
      tape: t ? { paused: t.paused, t: Number(t.currentTime.toFixed(1)) } : null }; })()`);

const out = {};

await clickSel('[data-dock-toggle]');
await sleep(1400);
out.dockPlaying = await state('dock on');

// cassette on: the bus must pause the dock
const tape = await clickSel('[data-tape-toggle]');
out.tapeClicked = Boolean(tape && !tape.err);
await sleep(1600);
out.tapePlaying = await state('tape on');

// dock back on: the bus must pause the cassette
await clickSel('[data-dock-toggle]');
await sleep(1400);
out.dockBack = await state('dock back on');

// next track keeps playing
await clickSel('[data-dock-next]');
await sleep(1400);
out.afterNext = await state('after next');

console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
