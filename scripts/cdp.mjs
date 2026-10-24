// scripts/cdp.mjs — one headless-Chrome session, real device emulation.
// Usage: node scripts/cdp.mjs <url> <W> <H> <out.png | expr.js> [scale]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2];
const W = Number(process.argv[3] || 1440);
const H = Number(process.argv[4] || 1000);
const target2 = process.argv[5] || '.shots/out.png';
const scale = Number(process.argv[6] || 1);

const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9400 + Math.floor(Math.random() * 400);

const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + path.resolve('.shots/prof3'),
  'about:blank',
], { stdio: 'ignore' });

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

const mobile = W < 700;
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: scale, mobile,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });

await send('Page.navigate', { url });
await sleep(3000);

if (/\.js$/i.test(target2)) {
  const expr = readFileSync(target2, 'utf8');
  const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) {
    console.log('EXCEPTION ' + JSON.stringify(out.exceptionDetails.exception, null, 1));
  } else {
    const v = out.result.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  }
} else {
  const metrics = await send('Page.getLayoutMetrics');
  const fullH = Math.ceil(metrics.cssContentSize.height);
  const height = Math.min(fullH, 6000);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height, deviceScaleFactor: scale, mobile });
  await sleep(1200);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync(path.dirname(path.resolve(target2)), { recursive: true });
  writeFileSync(path.resolve(target2), Buffer.from(shot.data, 'base64'));
  console.log(`shot ${url} @${W}x${H} -> ${target2} (page ${fullH}px)`);
}

ws.close();
child.kill();
process.exit(0);