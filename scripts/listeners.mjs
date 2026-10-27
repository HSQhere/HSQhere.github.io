// scripts/listeners.mjs — prove the per-page teardown works: navigate several
// times and count the listeners actually attached to window/document. If a
// page-scoped binding were never removed these counts would climb every swap.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4321/';
const ROUNDS = Number(process.argv[3] || 5);

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
    '--user-data-dir=' + path.resolve('.shots/prof-listen'),
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
await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url });
await sleep(3200);

const evalIn = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 160) };
  return out.result.value;
};

/** count listeners on a global object by type */
const countListeners = async (expr) => {
  const obj = await send('Runtime.evaluate', { expression: expr });
  if (!obj.result?.objectId) return { err: 'no objectId for ' + expr };
  const res = await send('DOMDebugger.getEventListeners', { objectId: obj.result.objectId, depth: 0, pierce: false });
  const byType = {};
  for (const l of res.listeners || []) byType[l.type] = (byType[l.type] || 0) + 1;
  return byType;
};

const sample = async () => ({
  window: await countListeners('window'),
  document: await countListeners('document'),
});

const out = { rounds: [] };
out.rounds.push({ at: 'initial', ...(await sample()) });

for (let i = 0; i < ROUNDS; i++) {
  await evalIn(`(() => { const a = Array.from(document.querySelectorAll('a[href]'))
      .find((x) => x.getAttribute('href') === '/archive/'); if (a) a.click(); return true; })()`);
  await sleep(1600);
  await evalIn(`(() => { const a = Array.from(document.querySelectorAll('a[href]'))
      .find((x) => x.getAttribute('href') === '/'); if (a) a.click(); return true; })()`);
  await sleep(1800);
  out.rounds.push({ at: `after round ${i + 1}`, ...(await sample()) });
}

console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
