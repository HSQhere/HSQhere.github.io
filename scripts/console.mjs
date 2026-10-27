// scripts/console.mjs — load a page and report console errors / page errors.
// node scripts/console.mjs <url> <W> <H>
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const [url, W, H] = process.argv.slice(2);
const Wn = Number(W || 1440);
const Hn = Number(H || 1000);

const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9600 + Math.floor(Math.random() * 90);

const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${Wn},${Hn}`,
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + path.resolve('.shots/prof9'), 'about:blank',
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
const events = [];
const send = (m, p = {}) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const lvl = msg.params.type;
    if (lvl === 'error' || lvl === 'warning') {
      events.push(`${lvl}: ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
    }
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    events.push(`exception: ${d.text} ${d.exception?.description ?? ''}`.slice(0, 400));
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') events.push(`log: ${e.text} ${e.url ?? ''}`.slice(0, 400));
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Wn, height: Hn, deviceScaleFactor: 1, mobile: Wn < 700,
});
await send('Page.navigate', { url });
await sleep(4500);

console.log(events.length ? events.join('\n') : 'no console errors');
ws.close();
child.kill();
process.exit(0);
