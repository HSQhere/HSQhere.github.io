// scripts/searchtest.mjs — the homepage search card submits a GET form to
// /search/?q=…  With ClientRouter on, that submit is intercepted too, so the
// search page's own script must still re-bind after the swap.
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
    '--user-data-dir=' + path.resolve('.shots/prof-search'),
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
    logs.push('EXC ' + String(msg.params.exceptionDetails.exception?.description || '').slice(0, 180));
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
  if (out.exceptionDetails) return { err: String(out.exceptionDetails.exception?.description || '').slice(0, 180) };
  return out.result.value;
};

const out = {};

// type in the homepage card and submit the form
out.typed = await evalIn(`(() => {
  const input = document.querySelector('[data-search-input]');
  const form = document.querySelector('[data-search-form]');
  if (!input || !form) return null;
  input.value = 'linux';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { action: form.getAttribute('action'), method: form.getAttribute('method') };
})()`);
await sleep(800);

out.hitsBefore = await evalIn(`(() => { const b = document.querySelector('[data-search-hits]');
  return b ? b.children.length : null; })()`);

// press Enter — the browser submits the form
await evalIn(`(() => { const f = document.querySelector('[data-search-form]');
  f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return true; })()`);
await sleep(2600);

out.afterSubmit = await evalIn(`(() => ({
  url: location.pathname + location.search,
  title: document.title,
  hasSearchPage: Boolean(document.querySelector('[data-q]')),
  qValue: document.querySelector('[data-q]')?.value ?? null,
  stat: document.querySelector('[data-stat]')?.textContent?.trim() ?? null,
  hits: document.querySelectorAll('[data-list] li').length,
  dock: Boolean(document.querySelector('[data-dock]')),
}))()`);

// the search page's own controls must be bound after a client-side nav:
// switch to full-text mode and re-query
out.modeClick = await evalIn(`(() => { const b = Array.from(document.querySelectorAll('[data-mode]'))
    .find((x) => x.dataset.mode === 'full'); if (!b) return null; b.click();
  return { pressed: b.getAttribute('aria-pressed') }; })()`);
await sleep(700);
out.afterMode = await evalIn(`(() => ({ stat: document.querySelector('[data-stat]')?.textContent?.trim() ?? null,
  hits: document.querySelectorAll('[data-list] li').length }))()`);

out.clearClick = await evalIn(`(() => { const c = document.querySelector('[data-clear]');
  if (!c) return null; c.click(); return { value: document.querySelector('[data-q]').value }; })()`);
await sleep(500);
out.afterClear = await evalIn(`(() => ({ stat: document.querySelector('[data-stat]')?.textContent?.trim() ?? null,
  emptyHidden: document.querySelector('[data-empty]')?.hidden ?? null }))()`);

out.logs = logs.slice(0, 6);
console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
