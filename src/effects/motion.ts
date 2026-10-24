/**
 * motion.ts — the only place animation lives.
 *
 * House rules (HANDOFF §4):
 *   1. no requestAnimationFrame — every tween is a setInterval
 *   2. no @keyframes for anything data-driven — clock, parallax, intro, reveal
 *   3. every loop self-clears when nothing is moving, and every entry point
 *      bails out when prefers-reduced-motion is set
 */

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
const later = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, ms);
  timers.push(t as unknown as Timer);
  return t;
};
const clearTimers = () => {
  while (timers.length) clearTimeout(timers.pop()! as unknown as number);
};

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
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      document.documentElement.style.setProperty('--pointer-x', String(tx));
      document.documentElement.style.setProperty('--pointer-y', String(ty));
      kick();
    },
    { passive: true }
  );

  window.addEventListener(
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
  };

  host.addEventListener(
    'pointermove',
    (e) => {
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

  host.addEventListener('pointerleave', () => {
    trx = 0;
    try_ = 0;
    tsx = 0;
    tsy = 0;
    kick();
  });
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

  window.addEventListener(
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

  later(() => items.forEach((el) => el.classList.add('is-in')), 1600);
}

function initGrowthLine() {
  const line = document.querySelector<HTMLElement>('[data-growth-line]');
  if (!line) return;

  if (prefersReduced()) {
    line.style.transform = 'scaleX(1)';
    return;
  }

  line.style.transform = 'scaleX(0)';
  later(() => {
    line.style.transition = 'transform 1000ms cubic-bezier(.22,1,.36,1)';
    line.style.transform = 'scaleX(1)';
  }, 420);
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
  window.setInterval(tickClock, 1000);
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
  box?.addEventListener('click', load);
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

  if (prefersReduced()) {
    finish();
    return;
  }

  document.body.classList.add('is-locked');

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

  skip?.addEventListener('click', () => {
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
  if (!view || !list || prefersReduced()) return;

  if (list.children.length < 2) return;

  const SPEED = 0.28;   /* px per 16ms frame */
  const HOLD = 1100;    /* ms parked at each end */

  let offset = 0;
  let dir = -1;         /* -1 = drifting up (content moves up), 1 = back down */
  let hold = HOLD;
  let running = false;
  let id = 0;
  let hovering = false;

  const span = () => Math.max(0, list.scrollHeight - view.clientHeight);

  const apply = () => {
    const limit = span();
    if (limit <= 0) {
      running = false;
      clearInterval(id);
      return;
    }

    if (hold > 0) {
      hold -= 16;
      return;
    }

    offset += dir * SPEED;

    if (offset <= -limit) {
      offset = -limit;
      dir = 1;
      hold = HOLD;
    } else if (offset >= 0) {
      offset = 0;
      dir = -1;
      hold = HOLD;
    }

    view.style.setProperty('--nt', `${offset.toFixed(2)}px`);
  };

  const kick = () => {
    if (running || hovering) return;
    running = true;
    id = window.setInterval(apply, 16);
  };

  const stop = () => {
    running = false;
    clearInterval(id);
  };

  view.addEventListener('pointerenter', () => {
    hovering = true;
    stop();
  });
  view.addEventListener('pointerleave', () => {
    hovering = false;
    kick();
  });
  view.addEventListener('focusin', () => {
    hovering = true;
    stop();
  });
  view.addEventListener('focusout', () => {
    hovering = false;
    kick();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else kick();
  });

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

let booted = false;

export function initMotion() {
  if (booted) return;
  booted = true;

  initParallax();
  initTilt();
  initScrollChrome();
  initHeroIn();
  initReveal();
  initGrowthLine();
  initClock();
  initQuote();
  initIntro();
  initTape();
  initNoteScroll();
  initBars();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMotion, { once: true });
} else {
  initMotion();
}