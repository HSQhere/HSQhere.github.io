// scripts/view.mjs — viewport-only screenshot (fixed elements land correctly).
// node scripts/view.mjs <url> <W> <H> <out.png> [clipX clipY clipW clipH scale]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [url, W, H, out, cx0, cy0, cw0, ch0, sc0] = process.argv.slice(2);
const Wn = Number(W || 390), Hn = Number(H || 844);

const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9900 + Math.floor(Math.random() * 90);

const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${Wn},${Hn}`,
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + path.resolve('.shots/prof5'), 'about:blank',
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
const send = (m, p = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Wn, height: Hn, deviceScaleFactor: 1, mobile: Wn < 700 });
if (Wn < 700) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
await sleep(3200);

const clip = cx0 !== undefined
  ? { x: Number(cx0), y: Number(cy0), width: Number(cw0), height: Number(ch0), scale: Number(sc0 || 1) }
  : undefined;
const shot = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
writeFileSync(path.resolve(out), Buffer.from(shot.data, 'base64'));
console.log(`view ${url} @${Wn}x${Hn} -> ${out}`);
ws.close(); child.kill(); process.exit(0);
