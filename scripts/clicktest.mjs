// scripts/clicktest.mjs — real CDP mouse click on the dock disc, then report
// whether playback actually started and whether it survives a client-side nav.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4321/';
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 900);

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
    '--user-data-dir=' + path.resolve('.shots/prof-click'),
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || ''));
  }
});

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');

const mobile = W < 700;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });

await send('Page.navigate', { url });
await sleep(3400);

const evalIn = async (expression, gesture = false) => {
  const out = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: gesture,
  });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 200) };
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

const state = () =>
  evalIn(`(() => { const r = document.querySelector('[data-dock]'); const a = document.querySelector('[data-dock-audio]');
    return { playing: r?.dataset.playing, paused: a?.paused, t: a ? Number(a.currentTime.toFixed(2)) : null,
      spin: r?.style.getPropertyValue('--spin') || '', aria: document.querySelector('[data-dock-toggle]')?.getAttribute('aria-pressed'),
      url: location.pathname, sameNode: a ? a.__id === 'original' : false }; })()`);

const out = {};
out.initial = await state();
out.click1 = await clickSel('[data-dock-toggle]');
await sleep(1600);
out.afterClick = await state();

// tag the audio, then navigate via a real click on a header link
await evalIn(`(() => { const a = document.querySelector('[data-dock-audio]'); if (a) a.__id = 'original';
  const d = document.querySelector('[data-dock]'); if (d) d.__id = 'original'; return true; })()`);

const link = await evalIn(`(() => {
  const a = Array.from(document.querySelectorAll('.header__nav a[href^="/"], a[href^="/archive"]'))
    .find((x) => { const h = x.getAttribute('href'); return h && h !== '/' && h !== location.pathname; });
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { href: a.getAttribute('href'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
out.link = link;

if (link && !link.err) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: link.x, y: link.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: link.x, y: link.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: link.x, y: link.y, button: 'left', clickCount: 1 });
  await sleep(2800);
}

out.afterNav = await state();
out.dockAfter = await evalIn(`(() => { const d = document.querySelector('[data-dock]');
  return { present: Boolean(d), sameDock: d ? d.__id === 'original' : false }; })()`);

out.logs = logs.slice(0, 8);
console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
