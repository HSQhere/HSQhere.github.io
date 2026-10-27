// scripts/navtest.mjs — drive a REAL click through CDP so the audio unlock is
// trusted, then navigate client-side and check the dock survived.
// Usage: node scripts/navtest.mjs <url> <W> <H>
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
    '--user-data-dir=' + path.resolve('.shots/prof-nav'),
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

const mobile = W < 700;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });

await send('Page.navigate', { url });
await sleep(3200);

const evalIn = async (expression) => {
  const out = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (out.exceptionDetails) return { err: JSON.stringify(out.exceptionDetails.exception?.description || out.exceptionDetails) };
  return out.result.value;
};

const rectOf = (sel) =>
  evalIn(`(() => { const el = document.querySelector('${sel}'); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

const clickAt = async (sel) => {
  const p = await rectOf(sel);
  if (!p) return false;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
  return true;
};

const out = {};

out.router = await evalIn(`Boolean(document.querySelector('meta[name="astro-view-transitions-enabled"]'))`);
await evalIn(`(() => { const d = document.querySelector('[data-dock]'); const a = document.querySelector('[data-dock-audio]');
  if (d) d.__id = 'original'; if (a) a.__id = 'original'; return true; })()`);

out.clickedToggle = await clickAt('[data-dock-toggle]');
await sleep(1400);

out.playingBefore = await evalIn(`(() => { const a = document.querySelector('[data-dock-audio]');
  return a ? { paused: a.paused, t: Number(a.currentTime.toFixed(2)), src: a.src.split('/').pop() } : null; })()`);

// navigate client-side through a real click on an internal link
out.clickedLink = await evalIn(`(() => {
  const a = Array.from(document.querySelectorAll('a[href^="/"]')).find((x) => {
    const h = x.getAttribute('href');
    return h && h !== '/' && h !== location.pathname && !x.hasAttribute('data-astro-reload');
  });
  if (!a) return null;
  const r = a.getBoundingClientRect();
  a.scrollIntoView({ block: 'center' });
  const r2 = a.getBoundingClientRect();
  return { href: a.getAttribute('href'), x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 };
})()`);

if (out.clickedLink && out.clickedLink.href) {
  const p = out.clickedLink;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  }
  await sleep(2600);
}

out.afterNav = await evalIn(`(() => {
  const d = document.querySelector('[data-dock]');
  const a = document.querySelector('[data-dock-audio]');
  return {
    url: location.pathname,
    dock: Boolean(d),
    sameDockNode: d ? d.__id === 'original' : false,
    sameAudioNode: a ? a.__id === 'original' : false,
    paused: a ? a.paused : null,
    t: a ? Number(a.currentTime.toFixed(2)) : null,
    searchCard: Boolean(document.querySelector('[data-search-form]')),
    headerMenu: (() => { const t = document.querySelector('[data-menu-toggle]');
      if (!t) return 'no-toggle'; t.click(); const s = t.getAttribute('aria-expanded'); t.click(); return s; })(),
  };
})()`);

// back home — the search card must be re-bound by page.ts
await evalIn(`history.back()`);
await sleep(2400);
out.backHome = await evalIn(`(() => {
  const a = document.querySelector('[data-dock-audio]');
  const d = document.querySelector('[data-dock]');
  const form = document.querySelector('[data-search-form]');
  const input = document.querySelector('[data-search-input]');
  let typed = null;
  if (input) { input.value = 'linux'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  return {
    url: location.pathname,
    sameDockNode: d ? d.__id === 'original' : false,
    paused: a ? a.paused : null,
    t: a ? Number(a.currentTime.toFixed(2)) : null,
    searchCard: Boolean(form),
    hasInput: Boolean(input),
  };
})()`);
await sleep(900);
out.afterTyping = await evalIn(`(() => {
  const box = document.querySelector('[data-search-hits]');
  return box ? { hidden: box.hidden, items: box.children.length, first: (box.textContent || '').slice(0, 60) } : null;
})()`);

// how many page-scoped listeners pile up? the registry is internal, but a
// repeated back/forward loop would blow up if teardown were missing
out.console = await evalIn(`(() => ({ errors: (window.__errs || []).slice(0, 5) }))()`);

console.log(JSON.stringify(out, null, 1));

ws.close();
child.kill();
process.exit(0);
