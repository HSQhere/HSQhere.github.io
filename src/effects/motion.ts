/**
 * motion.ts — the only place animation lives.
 *
 * House rules (HANDOFF §4):
 *   1. no requestAnimationFrame — every tween is a setInterval
 *   2. no @keyframes for anything data-driven — clock, parallax, intro, reveal
 *   3. every loop self-clears when nothing is moving, and every entry point
 *      bails out when prefers-reduced-motion is set
 *   4. the site navigates client-side, so every binding made here goes through
 *      `listen` / `onTeardown` and is undone before the next swap — see page.ts
 */

import { addCleanup, bootPage, register } from './page';
import { joinAudioBus } from './audio-bus';

const REDUCE = '(prefers-reduced-motion: reduce)';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia(REDUCE).matches;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const lerp = (a: number, b: number, k: number) => {
  const v = a + (b - a) * k;
  return Math.abs(b - v) < 0.0005 ? b : v;
};

const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = (p: number) =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

type Timer = ReturnType<typeof setInterval>;
const timers: Timer[] = [];
const clearTimers = () => {
  while (timers.length) clearTimeout(timers.pop()! as unknown as number);
};

/** `later` queues a one-shot; a navigation must not let one fire into a DOM
 *  that no longer exists, so the queue is emptied before every swap. The
 *  cleanup arms itself on the first use of each page. */
let timerCleanupArmed = false;

const later = (fn: () => void, ms: number) => {
  if (!timerCleanupArmed) {
    timerCleanupArmed = true;
    addCleanup(() => {
      timerCleanupArmed = false;
      clearTimers();
    });
  }
  const t = setTimeout(fn, ms);
  timers.push(t as unknown as Timer);
  return t;
};

/* ------------------------------------------------------------------ *
 * page lifetime — with the ClientRouter on, a navigation swaps the body
 * but keeps the document. Anything bound to window/document, or left
 * ticking, therefore outlives the nodes it was written for. Every such
 * binding registers its own undo with page.ts, which runs them before
 * each swap.
 * ------------------------------------------------------------------ */

/** addEventListener that remembers how to unbind itself */
const listen = <E extends Event = Event>(
  target: EventTarget,
  type: string,
  fn: (e: E) => void,
  opts?: AddEventListenerOptions | boolean
) => {
  const h = fn as unknown as EventListener;
  target.addEventListener(type, h, opts);
  addCleanup(() => target.removeEventListener(type, h, opts));
};

/** register an undo for something that cannot unbind itself (a timer) */
const onTeardown = (fn: () => void) => addCleanup(fn);

/* ------------------------------------------------------------------ *
 * 0. shared aim — one -1..1 vector, written by the pointer or by the
 *    gyroscope. Everything that used to listen for `pointermove` now
 *    reads this instead, so a phone can drive the same motion.
 * ------------------------------------------------------------------ */

type AimSource = 'pointer' | 'gyro' | 'touch';

const aim = { x: 0, y: 0, source: 'pointer' as AimSource, gyro: false };
const aimHooks = new Set<() => void>();

const writeAim = (x: number, y: number, source: AimSource) => {
  aim.x = x;
  aim.y = y;
  aim.source = source;
  document.documentElement.style.setProperty('--pointer-x', x.toFixed(4));
  document.documentElement.style.setProperty('--pointer-y', y.toFixed(4));
  aimHooks.forEach((fn) => fn());
};

/** the desktop path: mouse position, normalised to -1..1 */
function initPointerAim() {
  listen<PointerEvent>(
    window,
    'pointermove',
    (e) => {
      /* once the gyro is running on a phone, a stray tap should not fight it */
      if (aim.gyro) return;
      writeAim(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1,
        'pointer'
      );
    },
    { passive: true }
  );
}

/** the finger path: a touch device has no mouse, and an iOS Simulator has no
 *  motion sensors at all, so without this the scene would be dead to the hand
 *  in both places. Dragging a finger steers the very same aim vector, which
 *  means the parallax and the card tilt can be driven — and demonstrated —
 *  before any permission is granted. */
function initTouchAim() {
  if (prefersReduced()) return;
  if (!(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return;

  const steer = (t: Touch) => {
    if (aim.gyro) return;
    writeAim(
      clamp((t.clientX / window.innerWidth) * 2 - 1, -1, 1),
      clamp((t.clientY / window.innerHeight) * 2 - 1, -1, 1),
      'touch'
    );
  };

  listen<TouchEvent>(
    window,
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (t) steer(t);
    },
    { passive: true }
  );

  listen<TouchEvent>(
    window,
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (t) steer(t);
    },
    { passive: true }
  );
}

/* ------------------------------------------------------------------ *
 * 1. parallax — pointer + scroll driven, setInterval(16)
 * ------------------------------------------------------------------ */

type Layer = { el: HTMLElement; fx: number; fy: number; fz: number; spin?: number };

function initParallax() {
  const root = document.querySelector<HTMLElement>('[data-parallax]');
  if (!root) return;

  const pick = (sel: string, fx: number, fy: number, fz: number, spin?: number) => {
    const el = root.querySelector<HTMLElement>(sel);
    return el ? ({ el, fx, fy, fz, spin } as Layer) : null;
  };

  const layers = [
    pick('[data-pl="photo"]', -42, -30, 0.3),
    pick('[data-pl="aura1"]', -110, -86, 0.14),
    pick('[data-pl="aura2"]', 86, 64, 0.08),
    pick('[data-pl="aura3"]', 34, -26, 0.11),
    pick('[data-pl="grid"]', -46, -30, 0.22),
    pick('[data-pl="beam"]', -64, 52, 0.26),
    pick('[data-pl="copy"]', 24, 18, -0.16),
    pick('[data-pl="pet"]', -22, -16, -0.1),
  ].filter(Boolean) as Layer[];

  if (!layers.length) return;

  if (prefersReduced()) {
    layers.forEach((l) => {
      l.el.style.setProperty('--plx', '0px');
      l.el.style.setProperty('--ply', '0px');
    });
    return;
  }

  let cx = 0, cy = 0, tx = 0, ty = 0, sc = 0, tsc = 0;
  let running = false;
  let id = 0;

  /* the parallax writes custom properties, never `transform` — the CSS owns the
     transform so positioning, rotation and scale keep composing with the motion */
  const apply = () => {
    cx = lerp(cx, tx, 0.08);
    cy = lerp(cy, ty, 0.08);
    sc = lerp(sc, tsc, 0.1);

    for (const l of layers) {
      l.el.style.setProperty('--plx', `${(cx * l.fx).toFixed(2)}px`);
      l.el.style.setProperty('--ply', `${(cy * l.fy + sc * l.fz).toFixed(2)}px`);
    }

    const photo = layers.find((l) => l.el.dataset.pl === 'photo');
    if (photo) {
      photo.el.style.setProperty('--pls', String(1.05 + Math.abs(cx) * 0.02));
    }

    if (
      Math.abs(tx - cx) < 0.0005 &&
      Math.abs(ty - cy) < 0.0005 &&
      Math.abs(tsc - sc) < 0.0005
    ) {
      running = false;
      clearInterval(id);
    }
  };

  const kick = () => {
    if (running) return;
    running = true;
    id = window.setInterval(apply, 16);
    onTeardown(() => {
      running = false;
      clearInterval(id);
    });
  };

  /* the parallax no longer listens for the pointer itself — it reads the shared
     aim vector, which the mouse OR the gyroscope may be writing */
  const sync = () => {
    tx = aim.x;
    ty = aim.y;
    kick();
  };
  aimHooks.add(sync);
  onTeardown(() => aimHooks.delete(sync));

  listen(
    window,
    'scroll',
    () => {
      tsc = window.scrollY;
      document.documentElement.style.setProperty('--scroll-shift', String(tsc));
      kick();
    },
    { passive: true }
  );

  tsc = window.scrollY;
  kick();
}

/* ------------------------------------------------------------------ *
 * 2. pet-card tilt
 * ------------------------------------------------------------------ */

function initTilt() {
  const card = document.querySelector<HTMLElement>('[data-tilt]');
  if (!card || prefersReduced()) return;

  const host = card.parentElement ?? card;
  let rx = 0, ry = 0, sxs = 0, sys = 0;
  let trx = 0, try_ = 0, tsx = 0, tsy = 0;
  let running = false;
  let id = 0;

  const apply = () => {
    rx = lerp(rx, trx, 0.12);
    ry = lerp(ry, try_, 0.12);
    sxs = lerp(sxs, tsx, 0.12);
    sys = lerp(sys, tsy, 0.12);
    card.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    card.style.setProperty('--sx', sxs.toFixed(3));
    card.style.setProperty('--sy', sys.toFixed(3));

    if (
      Math.abs(trx - rx) < 0.01 &&
      Math.abs(try_ - ry) < 0.01 &&
      Math.abs(tsx - sxs) < 0.001 &&
      Math.abs(tsy - sys) < 0.001
    ) {
      running = false;
      clearInterval(id);
    }
  };

  const kick = () => {
    if (running) return;
    running = true;
    id = window.setInterval(apply, 16);
    onTeardown(() => {
      running = false;
      clearInterval(id);
    });
  };

  /* a phone has no hover and no pointer trail, so the card leans with the
     device — or the finger — instead: same numbers, fed from the shared aim
     vector. The pointer branch below still owns the desktop case. */
  const sync = () => {
    if (aim.source === 'pointer') return;
    try_ = aim.x * 12;
    trx = -aim.y * 12;
    tsx = aim.x * 2;
    tsy = aim.y * 1.8;
    kick();
  };
  aimHooks.add(sync);
  onTeardown(() => aimHooks.delete(sync));

  listen<PointerEvent>(
    host,
    'pointermove',
    (e) => {
      if (aim.source !== 'pointer') return;
      const r = host.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      try_ = nx * 12;
      trx = -ny * 12;
      tsx = nx * 2;
      tsy = ny * 1.8;
      kick();
    },
    { passive: true }
  );

  listen(host, 'pointerleave', () => {
    if (aim.source === 'gyro') return;
    trx = 0;
    try_ = 0;
    tsx = 0;
    tsy = 0;
    kick();
  });
}

/* ------------------------------------------------------------------ *
 * 2b. gyroscope — the phone's answer to the pointer
 *
 * A phone never fires `pointermove` until you touch it, so on mobile the
 * hero would sit perfectly still. Device orientation gives us the same
 * -1..1 aim vector from the physical tilt of the handset: turn the phone
 * left/right to swing the layers, tip it forward/back to raise them.
 * ------------------------------------------------------------------ */

/** degrees of tilt that equal a full swing — parallax.js calls this MAGIC_NUMBER.
    30° is a big hand movement; 22 keeps a small, natural wrist tilt visible. */
const GYRO_RANGE = 22;
/** a jump this large means the handset was re-gripped, so take a new baseline */
const GYRO_DRIFT = 45;

type PermResult = 'granted' | 'denied' | 'default';

/** the gyro is a property of the DEVICE, not of the page: its permission, its
 *  calibrated baseline and its listeners all have to survive a navigation, so
 *  it wires itself once per session and never tears down. */
let gyroBooted = false;

function initGyro() {
  if (gyroBooted) return;
  if (prefersReduced()) return;
  if (typeof window.DeviceOrientationEvent === 'undefined') return;
  /* desktop browsers expose the constructor but never emit readings */
  if (!(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return;
  gyroBooted = true;

  const btn = document.querySelector<HTMLElement>('[data-gyro]');
  const label = document.querySelector<HTMLElement>('[data-gyro-label]');

  const DOE = window.DeviceOrientationEvent as unknown as {
    requestPermission?: (absolute?: boolean) => Promise<PermResult>;
  };
  const DME = (window as unknown as {
    DeviceMotionEvent?: { requestPermission?: () => Promise<PermResult> };
  }).DeviceMotionEvent;

  let listening = false;
  let reading = false;
  let asked = false;
  let source: 'orient' | 'motion' | null = null;
  let base: { x: number; y: number } | null = null;
  let watchdog = 0;
  let dbg: ((s: string) => void) | null = null;

  const say = (msg: string) => {
    if (label) label.textContent = msg;
    if (btn) btn.hidden = false;
  };

  /* both axes arrive in degrees; the aim vector wants a calibrated -1..1.
     Callers hand over device-frame roll (x) and pitch (y), so the portrait /
     landscape swap happens at the source and this stays a pure calibrator. */
  const push = (x: number, y: number) => {
    if (!base) base = { x, y };

    let dx = x - base.x;
    let dy = y - base.y;

    /* a re-grip reads as a huge jump — rebase instead of slamming the aim
       to an extreme and leaving it stuck there */
    if (Math.abs(dx) > GYRO_DRIFT || Math.abs(dy) > GYRO_DRIFT) {
      base = { x, y };
      dx = 0;
      dy = 0;
    }

    writeAim(clamp(dx / GYRO_RANGE, -1, 1), clamp(dy / GYRO_RANGE, -1, 1), 'gyro');
  };

  const markOn = () => {
    if (reading) return;
    reading = true;
    aim.gyro = true;
    document.documentElement.dataset.aim = 'gyro';
    clearTimeout(watchdog);
    if (btn) btn.hidden = true;
  };

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) {
      dbg?.('deviceorientation · readings are null');
      return;
    }
    if (source !== 'orient') {
      source = 'orient';
      base = null;
    }
    markOn();
    dbg?.(`deviceorientation\nbeta  ${e.beta.toFixed(1)}\ngamma ${e.gamma.toFixed(1)}`);

    /* beta is the front/back tip measured from lying flat, so a handset held
       upright reads ~90 — subtract it to get a pitch around the grip. gamma
       is already the left/right roll. Swapped when held sideways. */
    const pitch = e.beta - 90;
    const roll = e.gamma;
    const upright = window.innerHeight >= window.innerWidth;
    push(upright ? roll : pitch, upright ? pitch : roll);
  };

  /* fallback for handsets that hand over motion but not orientation: the
     gravity vector still describes the tilt, so decompose it into the same
     roll/pitch pair the orientation path produces. A portrait handset held
     upright reads (0, +9.8, 0) — the accelerometer reports the normal force,
     which points up the screen — so +g.y is "up" and the two off-axis
     components give the lean.
     Signs are matched to the orientation path so the same physical tilt
     moves the scene the same way on either device: gamma and beta-90 are
     both positive for a right lean / a tip away from you. */
  const onMotion = (e: DeviceMotionEvent) => {
    if (source === 'orient') return;
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null || g.y === null || g.z === null) return;
    /* lying flat on a table: no meaningful roll/pitch to read */
    if (Math.abs(g.y) < 1.5) return;
    const rad = 180 / Math.PI;
    const roll = Math.atan2(g.x, g.y) * rad;
    const pitch = Math.atan2(-g.z, g.y) * rad;
    if (source !== 'motion') {
      source = 'motion';
      base = null;
    }
    markOn();
    dbg?.(`devicemotion · gravity\npitch ${pitch.toFixed(1)}\nroll  ${roll.toFixed(1)}`);
    const upright = window.innerHeight >= window.innerWidth;
    push(upright ? roll : pitch, upright ? pitch : roll);
  };

  const armWatchdog = (delay = 1500) => {
    clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      if (reading) return;
      /* granted but silent — on iOS this is the per-site denial or the
         Settings switch, and it otherwise fails without a word */
      say(
        asked
          ? '没读到手机姿态 · 设置 → Safari → 动作与方向访问'
          : '轻晃手机，画面会跟着动'
      );
    }, delay);
  };

  const attach = () => {
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    window.addEventListener('deviceorientationabsolute', onOrient as EventListener, {
      passive: true,
    });
    window.addEventListener('devicemotion', onMotion, { passive: true });
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    attach();
  };

  /* iOS 13+ has a long-standing quirk: listeners registered before the grant
     can stay silent forever, so drop and re-add them once permission lands.
     Costs nothing and it is the difference between "works" and "never fires"
     on some point releases. */
  const relisten = () => {
    window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('deviceorientationabsolute', onOrient as EventListener);
    window.removeEventListener('devicemotion', onMotion);
    attach();
    armWatchdog();
  };

  const grant = async (): Promise<PermResult> => {
    /* iOS shows ONE permission sheet at a time. Asking for orientation and
       motion concurrently makes the second request hang forever on several
       iOS versions, so they are asked strictly one after the other. */
    let ok = false;
    try {
      if (DOE.requestPermission) {
        const r = await DOE.requestPermission();
        ok = r === 'granted';
      } else {
        ok = true;
      }
    } catch {
      /* older iOS throws instead of rejecting */
      ok = false;
    }
    try {
      if (DME?.requestPermission) {
        const r = await DME.requestPermission();
        ok = ok || r === 'granted';
      }
    } catch {
      /* motion is only the fallback channel — its refusal is not fatal */
    }
    return ok ? 'granted' : 'denied';
  };

  const onTap = () => {
    asked = true;
    listen();
    /* only start complaining AFTER the promise settles — a slow permission
       dialog would otherwise trip the watchdog and show a denial that never
       happened */
    grant().then((res) => {
      if (res === 'granted') {
        relisten();
        return;
      }
      say('动作权限被拒绝 · 在设置里允许后点这里重试');
    });
  };

  /* A floating pill is easy to miss, and iOS only accepts requestPermission()
     from inside a real gesture — so the FIRST tap or scroll anywhere on the
     page also asks. Once per session: a returning visitor who denied it gets
     no dialog (iOS answers instantly) and no repeated nagging. */
  const AUTO_KEY = 'gyro-asked';
  let autoDone = false;
  try {
    autoDone = sessionStorage.getItem(AUTO_KEY) === '1';
  } catch {
    /* private mode can throw on storage access — treat as "not asked" */
  }

  const onFirstGesture = (e?: Event) => {
    if (asked || autoDone) return;
    /* never steal a tap that belongs to a link or a control — the iOS sheet
       would swallow the navigation the visitor actually intended */
    const t = e?.target;
    if (t instanceof Element && t.closest('a, button, input, textarea, select, label')) return;
    autoDone = true;
    try {
      sessionStorage.setItem(AUTO_KEY, '1');
    } catch {
      /* ditto */
    }
    onTap();
  };

  /* ?motion=debug — a live readout, so a handset that stays silent can be
     diagnosed without attaching a cable to it */
  if (location.search.includes('motion=debug')) {
    const pre = document.createElement('pre');
    pre.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;' +
      'border-radius:10px;background:rgba(20,20,24,.86);color:#fff;' +
      'font:11px/1.55 ui-monospace,SFMono-Regular,monospace;pointer-events:none;' +
      'white-space:pre;max-width:80vw';
    pre.textContent = 'waiting for motion …';
    document.body.appendChild(pre);
    dbg = (s) => {
      pre.textContent = s;
    };
  }

  /* Listen immediately on every handset. iOS 13+ refuses to hand over a
     reading until requestPermission() has been called from inside a real
     tap, and it rejects outright if that call happens at load — so the tap
     affordance is the whole point. If permission was already granted on a
     previous visit the readings simply start, markOn() hides the prompt, and
     no dialog ever appears. */
  listen();
  armWatchdog();
  btn?.addEventListener('click', onTap);

  /* bind the one-shot auto-ask to the first real gesture */
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('touchstart', onFirstGesture, { passive: true });
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 40) onFirstGesture();
    },
    { passive: true }
  );
}

/* ------------------------------------------------------------------ *
 * 3. header condense + hero fade
 * ------------------------------------------------------------------ */

function initScrollChrome() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!header && !hero) return;

  let raf = 0;
  const run = () => {
    const y = window.scrollY;

    if (header) {
      header.classList.toggle('is-solid', y > 40);
    }

    if (hero) {
      const hh = hero.offsetHeight || 1;
      const p = clamp((y - hh * 0.55) / (hh * 0.45));
      hero.style.setProperty('--hero-fade', String(1 - p * 0.5));
    }

    raf = 0;
  };

  listen(
    window,
    'scroll',
    () => {
      if (!raf) raf = window.setTimeout(run, 16);
    },
    { passive: true }
  );

  run();
}

/* ------------------------------------------------------------------ *
 * 4. hero entrance + section reveal
 * ------------------------------------------------------------------ */

function initHeroIn() {
  const copy = document.querySelector<HTMLElement>('[data-hero-copy]');
  const pet = document.querySelector<HTMLElement>('[data-hero-pet]');

  if (copy) {
    const kids = Array.from(copy.children) as HTMLElement[];
    kids.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = `opacity .8s cubic-bezier(.22,1,.36,1) ${80 + i * 90}ms, transform .8s cubic-bezier(.22,1,.36,1) ${80 + i * 90}ms`;
    });
    later(() => {
      kids.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }, 60);
  }

  /* the pet card's transform belongs to the stylesheet (it carries the ring
     offset and the parallax vars) — only opacity is animated here */
  if (pet) {
    pet.style.opacity = '0';
    pet.style.transition = 'opacity .9s cubic-bezier(.22,1,.36,1) 260ms';
    later(() => {
      pet.style.opacity = '1';
    }, 60);
  }
}

function initReveal() {
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (!items.length) return;

  if (prefersReduced() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const idx = Number(el.dataset.reveal || 0);
        later(() => el.classList.add('is-in'), idx * 80);
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -18% 0px' }
  );

  items.forEach((el) => io.observe(el));
  onTeardown(() => io.disconnect());

  later(() => items.forEach((el) => el.classList.add('is-in')), 1600);
}

/* ------------------------------------------------------------------ *
 * 5. LED clock — seven-segment digits, never a clock face
 * ------------------------------------------------------------------ */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad = (n: number) => String(n).padStart(2, '0');

/** which of the seven segments each glyph lights up */
const SEG_MAP: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

function paintDigit(el: HTMLElement, ch: string) {
  const lit = SEG_MAP[ch] ?? '';
  el.querySelectorAll<HTMLElement>('[data-sg]').forEach((seg) => {
    seg.classList.toggle('on', lit.includes(seg.dataset.sg || ''));
  });
}

function paintColon(el: HTMLElement, on: boolean) {
  el.classList.toggle('is-on', on);
}

function tickClock() {
  const now = new Date();
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const stamp = `${hh}:${mm}`;

  /* seven-segment digits: h1 h2 m1 m2 s1 s2 */
  const digits = hh + mm + ss;
  document.querySelectorAll<HTMLElement>('[data-led]').forEach((el, i) => {
    paintDigit(el, digits[i] ?? ' ');
  });

  /* the two colons blink once a second — the classic digital-watch tell */
  const blink = now.getSeconds() % 2 === 0;
  document.querySelectorAll<HTMLElement>('[data-colon]').forEach((el, i) => {
    paintColon(el, i === 1 ? true : blink);
  });

  document.querySelectorAll<HTMLElement>('[data-clock-time]').forEach((el) => {
    el.textContent = stamp;
  });
  document.querySelectorAll<HTMLElement>('[data-clock-sec]').forEach((el) => {
    el.textContent = ss;
  });
  document.querySelectorAll<HTMLElement>('[data-clock-date]').forEach((el) => {
    el.textContent = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${WEEK[now.getDay()]}`;
  });
  document.querySelectorAll<HTMLElement>('[data-clock-greet]').forEach((el) => {
    const h = now.getHours();
    el.textContent = h < 5 ? '夜深了' : h < 11 ? '早安' : h < 14 ? '午安' : h < 19 ? '下午好' : '晚安';
  });
}

function initClock() {
  if (!document.querySelector('[data-clock-time]')) return;
  tickClock();
  const id = window.setInterval(tickClock, 1000);
  onTeardown(() => clearInterval(id));
}
/* ------------------------------------------------------------------ *
 * 6. 一言 — local fallback paints first, network never blocks
 * ------------------------------------------------------------------ */

function initQuote() {
  const textEl = document.querySelector<HTMLElement>('[data-quote-text]');
  const fromEl = document.querySelector<HTMLElement>('[data-quote-from]');
  const box = document.querySelector<HTMLElement>('[data-quote]');
  if (!textEl) return;

  const local = (box?.dataset.quoteFallback || '').split('|||').filter(Boolean);

  const paint = (text: string, from: string) => {
    textEl.textContent = text;
    if (fromEl) fromEl.textContent = from;
  };

  if (local.length) {
    const [t, f = ''] = local[Math.floor(Math.random() * local.length)].split('##');
    paint(t, f);
  }

  let reqId = 0;
  const load = async () => {
    const mine = ++reqId;
    try {
      const res = await fetch('https://v1.hitokoto.cn/?encode=json', {
        mode: 'cors',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { hitokoto?: string; from?: string };
      if (mine !== reqId) return;
      if (data.hitokoto) paint(data.hitokoto, data.from || '');
    } catch {
      /* offline is fine — the local quote is already on screen */
    }
  };

  later(load, 2600);
  if (box) listen(box, 'click', load);
}

/* ------------------------------------------------------------------ *
 * 7. intro overlay — 晚安 ✦ 欢迎回来
 * ------------------------------------------------------------------ */

function initIntro() {
  const intro = document.querySelector<HTMLElement>('[data-intro]');
  if (!intro) return;

  const letters = Array.from(intro.querySelectorAll<HTMLElement>('[data-intro-letter]'));
  const head = intro.querySelector<HTMLElement>('[data-intro-head]');
  const veilL = intro.querySelector<HTMLElement>('[data-veil="left"]');
  const veilR = intro.querySelector<HTMLElement>('[data-veil="right"]');
  const skip = intro.querySelector<HTMLButtonElement>('[data-intro-skip]');

  const finish = () => {
    intro.classList.add('is-off');
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  };

  /* the overlay is a first-paint-of-the-session thing; with client-side
     navigation the homepage can be re-entered, and replaying the intro on
     every return would be unbearable */
  if (sessionStorage.getItem('hsq-intro') === 'done') {
    finish();
    return;
  }
  sessionStorage.setItem('hsq-intro', 'done');

  if (prefersReduced()) {
    finish();
    return;
  }

  document.body.classList.add('is-locked');
  onTeardown(() => {
    document.body.classList.remove('is-locked');
  });

  let done = false;
  const run = () => {
    if (done) return;
    done = true;

    if (head) {
      const t0 = performance.now();
      const tw = window.setInterval(() => {
        const p = clamp((performance.now() - t0) / 700);
        head.style.opacity = String(p);
        head.style.transform = `translateY(${14 * (1 - p)}px) scale(${0.84 + 0.16 * p})`;
        if (p >= 1) clearInterval(tw);
      }, 16);
    }

    letters.forEach((el, idx) => {
      later(() => {
        const t0 = performance.now();
        const dur = 520;
        const tw = window.setInterval(() => {
          const p = clamp((performance.now() - t0) / dur);
          const e = easeOutCubic(p);
          const pop = Math.sin(p * Math.PI) * 0.16;
          el.style.opacity = String(p);
          el.style.transform = `translateY(${20 * (1 - e)}px) scale(${0.5 + 0.5 * e + pop}) rotate(${-7 * (1 - e)}deg)`;
          if (p >= 1) clearInterval(tw);
        }, 16);
      }, 170 + idx * 92);
    });

    later(() => {
      letters.forEach((el, idx) => {
        later(() => {
          const t0 = performance.now();
          const tw = window.setInterval(() => {
            const p = clamp((performance.now() - t0) / 460);
            el.style.opacity = String(1 - p);
            el.style.transform = `translateY(${-16 * p}px)`;
            if (p >= 1) clearInterval(tw);
          }, 16);
        }, idx * 26);
      });
    }, 1300);

    later(() => {
      [veilL, veilR].forEach((veil, i) => {
        if (!veil) return;
        const dir = i === 0 ? -1 : 1;
        const t0 = performance.now();
        const tw = window.setInterval(() => {
          const p = clamp((performance.now() - t0) / 900);
          veil.style.transform = `translateX(${dir * 103 * easeInOutQuad(p)}%)`;
          if (p >= 1) clearInterval(tw);
        }, 16);
      });
    }, 1540);

    later(finish, 2440);
  };

  if (skip) {
    listen(skip, 'click', () => {
      clearTimers();
      intro.classList.add('is-off');
      intro.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-locked');
      letters.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      if (head) {
        head.style.opacity = '1';
        head.style.transform = 'none';
      }
    });
  }

  later(run, 200);
}

/* ------------------------------------------------------------------ *
 * 8. cassette — three local tracks, spinning reels, prev / next
 * ------------------------------------------------------------------ */

type Track = { title: string; artist: string; src: string; cover: string };

function initTape() {
  const shell = document.querySelector<HTMLElement>('[data-tape]');
  const audio = document.querySelector<HTMLAudioElement>('[data-tape-audio]');
  const listEl = document.querySelector<HTMLElement>('[data-tape-list]');
  const btn = document.querySelector<HTMLButtonElement>('[data-tape-toggle]');
  const prevBtn = document.querySelector<HTMLButtonElement>('[data-tape-prev]');
  const nextBtn = document.querySelector<HTMLButtonElement>('[data-tape-next]');
  if (!shell || !audio || !btn) return;

  let tracks: Track[] = [];
  try {
    tracks = JSON.parse(listEl?.textContent || '[]') as Track[];
  } catch {
    tracks = [];
  }
  if (!tracks.length) return;

  /* the cassette and the page-edge CD dock must never sing together */
  const leaveBus = joinAudioBus(audio);
  onTeardown(leaveBus);

  const titleEl = shell.querySelector<HTMLElement>('[data-tape-title]');
  const artistEl = shell.querySelector<HTMLElement>('[data-tape-artist]');
  const idxEl = shell.querySelector<HTMLElement>('[data-tape-idx]');
  const reels = Array.from(shell.querySelectorAll<HTMLElement>('[data-reel]'));

  let index = 0;
  let spin = 0;
  let reelTimer = 0;
  let reelRunning = false;
  let colonTimer = 0;

  const paintTrack = () => {
    const t = tracks[index];
    if (titleEl) titleEl.textContent = t.title;
    if (artistEl) artistEl.textContent = t.artist;
    if (idxEl) idxEl.textContent = `${index + 1} / ${tracks.length}`;
    audio.src = t.src;
    shell.dataset.tapeIndex = String(index);
  };

  /* reels advance only while audio is actually running; the loop kills itself */
  const spinReels = () => {
    if (reelRunning) return;
    reelRunning = true;
    const perFrame = 2.6;
    reelTimer = window.setInterval(() => {
      spin = (spin + perFrame) % 360;
      reels.forEach((r, i) => {
        r.style.setProperty('--spin', `${(i === 0 ? spin : spin * 0.86).toFixed(1)}deg`);
      });
      if (audio.paused || audio.ended) {
        reelRunning = false;
        clearInterval(reelTimer);
      }
    }, 16);
  };

  const stopReels = () => {
    reelRunning = false;
    clearInterval(reelTimer);
  };

  /* the cassette lives on the homepage only, so a navigation removes its
     nodes while these two loops would keep ticking against them */
  onTeardown(() => {
    clearInterval(reelTimer);
    clearInterval(colonTimer);
    audio.pause();
  });

  const sync = () => {
    const playing = !audio.paused && !audio.ended;
    btn.setAttribute('aria-pressed', String(playing));
    btn.setAttribute('aria-label', playing ? '暂停音乐' : '播放音乐');
    shell.classList.toggle('is-playing', playing);
    if (playing) {
      spinReels();
      /* the LED-ish "REC" dot next to the counter blinks while playing */
      clearInterval(colonTimer);
      let on = true;
      colonTimer = window.setInterval(() => {
        on = !on;
        shell.style.setProperty('--rec', on ? '1' : '.25');
      }, 620);
    } else {
      stopReels();
      clearInterval(colonTimer);
      shell.style.setProperty('--rec', '1');
    }
  };

  const play = () => {
    void audio.play().catch(() => {
      /* autoplay policies — the user can try again */
    });
  };

  const step = (dir: number) => {
    const wasPlaying = !audio.paused && !audio.ended;
    index = (index + dir + tracks.length) % tracks.length;
    paintTrack();
    if (wasPlaying) play();
  };

  btn.addEventListener('click', () => {
    if (audio.paused) play();
    else audio.pause();
  });
  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));

  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('ended', () => {
    /* a cassette auto-reverses: roll on to the next track */
    index = (index + 1) % tracks.length;
    paintTrack();
    play();
  });

  paintTrack();
  sync();
}

/* ------------------------------------------------------------------ *
 * 8b. sticky note — the TODO list drifts down, holds, drifts back up
 * ------------------------------------------------------------------ */

function initNoteScroll() {
  const view = document.querySelector<HTMLElement>('[data-note-view]');
  const list = document.querySelector<HTMLElement>('[data-note-list]');
  if (!view || !list) return;

  if (list.children.length < 2) return;

  const SPEED = 0.5;    /* px per 16ms frame — ~31px/s, brisk but readable */
  const HOLD = 1400;    /* ms parked at each end */

  let offset = 0;
  let dir = 1;          /* 1 = drifting down, -1 = back up */
  let hold = HOLD;
  let running = false;
  let id = 0;
  let hovering = false;

  /* the note is a real scroll container now, so "how far can it go" is the
     browser's own answer — no measuring against a transform offset */
  const span = () => Math.max(0, list.scrollHeight - view.clientHeight);

  const apply = () => {
    const limit = span();
    if (limit <= 0) {
      stop();
      return;
    }

    if (hold > 0) {
      hold -= 16;
      return;
    }

    offset += dir * SPEED;

    if (offset >= limit) {
      offset = limit;
      dir = -1;
      hold = HOLD;
    } else if (offset <= 0) {
      offset = 0;
      dir = 1;
      hold = HOLD;
    }

    view.scrollTop = offset;
  };

  const kick = () => {
    if (running || hovering) return;
    if (span() <= 0) return;
    running = true;
    id = window.setInterval(apply, 16);
  };

  const stop = () => {
    running = false;
    clearInterval(id);
  };

  onTeardown(stop);

  /* the drift picks up from wherever the visitor left the list */
  const syncFromScroll = () => {
    offset = view.scrollTop;
  };

  listen(view, 'pointerenter', () => {
    hovering = true;
    stop();
  });
  listen(view, 'pointerleave', () => {
    hovering = false;
    syncFromScroll();
    kick();
  });
  listen(view, 'focusin', () => {
    hovering = true;
    stop();
  });
  listen(view, 'focusout', () => {
    hovering = false;
    syncFromScroll();
    kick();
  });
  /* a finger drag on a phone is the same gesture as a hover here: yield */
  listen(view, 'touchstart', () => {
    hovering = true;
    stop();
  }, { passive: true });
  listen(view, 'touchend', () => {
    hovering = false;
    syncFromScroll();
    kick();
  }, { passive: true });

  listen(document, 'visibilitychange', () => {
    if (document.hidden) stop();
    else kick();
  });

  /* reduced motion means no drift — but the list stays draggable, so the
     plans are still reachable; that is the whole point of the fix */
  if (prefersReduced()) return;

  /* let the note land before it starts moving */
  later(kick, 1800);
}
/* ------------------------------------------------------------------ *
 * 9. progress bars — width written from data-value
 * ------------------------------------------------------------------ */

function initBars() {
  const bars = Array.from(document.querySelectorAll<HTMLElement>('[data-bar]'));
  if (!bars.length) return;

  bars.forEach((el) => {
    const v = clamp(Number(el.dataset.bar || 0) / 100);
    el.style.transform = 'scaleX(0)';
    later(() => {
      el.style.transition = 'transform 900ms cubic-bezier(.22,1,.36,1)';
      el.style.transform = `scaleX(${v})`;
    }, 260);
  });
}

/* ------------------------------------------------------------------ */

/**
 * Every initialiser is registered rather than called, because a client-side
 * navigation swaps the DOM under a live document: the ones whose target is
 * absent on the new page simply return, and the ones that do bind are undone
 * before the next swap. `bootPage()` runs them for the first page and again
 * after every navigation.
 *
 * The three that are device- or document-scoped rather than page-scoped —
 * the pointer, the finger and the gyroscope — guard themselves and keep
 * running across navigations, so the aim vector never resets mid-session.
 */
register('motion:pointer', initPointerAim);
register('motion:touch', initTouchAim);
register('motion:gyro', initGyro);
register('motion:parallax', initParallax);
register('motion:tilt', initTilt);
register('motion:chrome', initScrollChrome);
register('motion:hero', initHeroIn);
register('motion:reveal', initReveal);
register('motion:clock', initClock);
register('motion:quote', initQuote);
register('motion:intro', initIntro);
register('motion:tape', initTape);
register('motion:note', initNoteScroll);
register('motion:bars', initBars);

bootPage();