// scripts/shotrect.mjs — screenshot the bounding box of a selector, in the same
// session that measures it. node scripts/shotrect.mjs <url> <W> <H> <selector> <out> [scale]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [url, W, H, sel, out, sc0] = process.argv.slice(2);
const Wn = Number(W || 390), Hn = Number(H || 844);
const cands = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const chrome = cands.find((p) => existsSync(p));
const port = 9500 + Math.floor(Math.random() * 200);

const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${Wn},${Hn}`,
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + path.resolve('.shots/prof6'), 'about:blank',
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
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Wn, height: Hn, deviceScaleFactor: 1, mobile: Wn < 700 });
if (Wn < 700) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
await sleep(3200);

const expr = `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const anc = [];
  let p = el.parentElement;
  while (p && anc.length < 8) {
    const s = getComputedStyle(p);
    anc.push({ tag: p.tagName, cls: String(p.className).slice(0, 30), transform: s.transform, filter: s.filter, contain: s.contain, overflow: s.overflow, position: s.position });
    p = p.parentElement;
  }
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    hidden: el.hidden, display: cs.display, opacity: cs.opacity, visibility: cs.visibility,
    position: cs.position, zIndex: cs.zIndex, transform: cs.transform,
    offsetParent: el.offsetParent ? el.offsetParent.tagName : null,
    anc,
  };
})()`;
const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const info = res.result.value;
console.log(JSON.stringify(info, null, 1));

if (!info.missing) {
  const r = info.rect;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.w + 20, height: r.h + 20, scale: Number(sc0 || 3) },
  });
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(path.resolve(out), Buffer.from(shot.data, 'base64'));
  console.log('shot -> ' + out);
}
ws.close(); child.kill(); process.exit(0);
