/**
 * music.ts — behaviour for the page-edge CD player.
 *
 * The dock is rendered once and marked `transition:persist`, so the
 * ClientRouter moves the SAME element into every new page instead of building
 * a new one. Two consequences shape this file:
 *
 *   1. It must wire itself exactly ONCE. A second pass would double every
 *      listener on a node that was never destroyed. `data-dock-ready` is the
 *      guard, and it survives because the node survives.
 *   2. It must NOT register with page.ts. That teardown runs on every
 *      navigation and would unbind the dock that is supposed to outlive the
 *      page. Everything here lives as long as the document does.
 *
 * House rules from motion.ts apply: no requestAnimationFrame, every loop
 * clears itself when the music stops, and reduced motion is respected.
 */

import { joinAudioBus } from './audio-bus';

type Track = { title: string; artist: string; src: string; cover: string };

const REDUCE = '(prefers-reduced-motion: reduce)';
const reduced = () => window.matchMedia(REDUCE).matches;

/** degrees per 16ms frame — a 33⅓ rpm record turns ~200°/s, this is calmer */
const SPIN_PER_FRAME = 0.42;

function initDock() {
  const root = document.querySelector<HTMLElement>('[data-dock]');
  if (!root) return;
  /* already bound: this node came from a previous page and is still playing */
  if (root.dataset.dockReady === '1') return;
  root.dataset.dockReady = '1';

  const audio = root.querySelector<HTMLAudioElement>('[data-dock-audio]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-dock-toggle]');
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-dock-next]');
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-dock-prev]');
  const openBtn = root.querySelector<HTMLButtonElement>('[data-dock-open]');
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-dock-close]');
  const foldBtn = root.querySelector<HTMLButtonElement>('[data-dock-fold]');
  const panel = root.querySelector<HTMLElement>('[data-dock-panel]');
  const art = root.querySelector<HTMLImageElement>('[data-dock-art]');
  const listEl = root.querySelector<HTMLElement>('[data-dock-json]');
  const trackBtns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dock-track]'));

  if (!audio || !toggle) return;

  let tracks: Track[] = [];
  try {
    tracks = JSON.parse(listEl?.textContent || '[]') as Track[];
  } catch {
    tracks = [];
  }
  if (!tracks.length) return;

  joinAudioBus(audio);

  let index = Math.max(0, Number(root.dataset.dockIndex || 0));
  let angle = Number(root.dataset.dockAngle || 0);
  let spinTimer = 0;
  let spinning = false;

  /* ---- the record itself ------------------------------------------- */

  const paintAngle = () => {
    root.style.setProperty('--spin', `${angle.toFixed(1)}deg`);
    root.dataset.dockAngle = angle.toFixed(1);
  };

  const spin = () => {
    if (spinning || reduced()) return;
    spinning = true;
    spinTimer = window.setInterval(() => {
      angle = (angle + SPIN_PER_FRAME) % 360;
      paintAngle();
      /* the loop owns its own exit: pause, stop, or an unloaded element */
      if (audio.paused || audio.ended) stopSpin();
    }, 16);
  };

  const stopSpin = () => {
    spinning = false;
    clearInterval(spinTimer);
  };

  /* ---- which track ------------------------------------------------- */

  const paintTrack = () => {
    const t = tracks[index];
    if (!t) return;
    if (art && art.getAttribute('src') !== t.src) art.src = t.cover;
    audio.src = t.src;
    root.dataset.dockIndex = String(index);
    trackBtns.forEach((b, i) => {
      const on = i === index;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
    });
  };

  const paintState = () => {
    const playing = !audio.paused && !audio.ended;
    root.dataset.playing = playing ? '1' : '0';
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', playing ? '暂停' : '播放');
    if (playing) spin();
    else stopSpin();
  };

  const play = () => {
    void audio.play().catch(() => {
      /* autoplay policy — the next tap will do it */
    });
  };

  /* ---- controls ---------------------------------------------------- */

  toggle.addEventListener('click', () => {
    if (audio.paused) play();
    else audio.pause();
  });

  nextBtn?.addEventListener('click', () => {
    const wasPlaying = !audio.paused && !audio.ended;
    index = (index + 1) % tracks.length;
    paintTrack();
    if (wasPlaying) play();
  });

  /* prev mirrors next, with the one extra job every player has: inside the
     first three seconds it steps back a track, after that it restarts the
     current one. */
  prevBtn?.addEventListener('click', () => {
    const wasPlaying = !audio.paused && !audio.ended;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    index = (index - 1 + tracks.length) % tracks.length;
    paintTrack();
    if (wasPlaying) play();
  });

  const setPanel = (open: boolean) => {
    if (!panel || !openBtn) return;
    panel.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
  };

  /* ---- folding ----------------------------------------------------- *
     The dock persists across navigations, so the folded state has to live
     somewhere outside the node as well — sessionStorage, same pattern the
     gyro prompt uses. Folded, the playlist is forced shut so a panel can
     never float above a hidden row. */

  const FOLD_KEY = 'dock-folded';

  const setFolded = (folded: boolean, remember = true) => {
    root.dataset.folded = folded ? '1' : '0';
    foldBtn?.setAttribute('aria-expanded', String(!folded));
    foldBtn?.setAttribute('aria-label', folded ? '展开播放器' : '收起播放器');
    if (folded) setPanel(false);
    if (!remember) return;
    try {
      sessionStorage.setItem(FOLD_KEY, folded ? '1' : '0');
    } catch {
      /* private mode — the fold simply does not survive a reload */
    }
  };

  let folded = false;
  try {
    folded = sessionStorage.getItem(FOLD_KEY) === '1';
  } catch {
    folded = false;
  }
  setFolded(folded, false);

  foldBtn?.addEventListener('click', () => {
    setFolded(root.dataset.folded !== '1');
  });

  openBtn?.addEventListener('click', () => {
    setPanel(Boolean(panel?.hidden));
  });
  closeBtn?.addEventListener('click', () => setPanel(false));

  trackBtns.forEach((b, i) => {
    b.addEventListener('click', () => {
      index = i;
      paintTrack();
      play();
      setPanel(false);
    });
  });

  document.addEventListener('click', (e) => {
    if (!panel || panel.hidden) return;
    const t = e.target;
    if (t instanceof Node && !panel.contains(t) && !openBtn?.contains(t)) setPanel(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) setPanel(false);
  });

  /* ---- audio events ------------------------------------------------ */

  audio.addEventListener('play', paintState);
  audio.addEventListener('pause', paintState);
  audio.addEventListener('ended', () => {
    /* a CD rolls on, unlike the cassette's reverse */
    index = (index + 1) % tracks.length;
    paintTrack();
    play();
  });

  /* a persisted element keeps its own playback across the swap, but the
     module only ever runs on the first page — so restore the paint here */
  paintTrack();
  paintAngle();
  paintState();
}

/**
 * The dock is bound once for the whole session. Called from the global script
 * in Base.astro, which is the one place that always has the dock in the DOM.
 */
export function initMusic() {
  initDock();
}

/* the module is imported for its side effect, so it has to boot itself */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDock, { once: true });
} else {
  initDock();
}
