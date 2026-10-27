/**
 * page.ts — page lifetime for a site that navigates client-side.
 *
 * With <ClientRouter /> on, a navigation no longer reloads the document: the
 * body is swapped and the new page's scripts run, but `window` and `document`
 * are the SAME objects they always were. Anything bound to them therefore
 * outlives the nodes it was written for — the classic symptoms are a listener
 * firing against a detached element and a setInterval ticking forever.
 *
 * Two calls do the whole job:
 *   register(id, init)  — an initialiser that runs once per page, and again
 *                         after every navigation.
 *   addCleanup(fn)      — the undo for whatever that initialiser bound.
 *
 * `id` exists because a component's script can run more than once across a
 * session (Astro re-executes a script the first time it appears on a page).
 * Re-registering under the same id replaces the initialiser instead of
 * queueing a second copy, and a generation counter makes sure a script that
 * arrives after the page's own page-load still runs exactly once.
 */

type Init = () => void;
type Cleanup = () => void;

const inits = new Map<string, Init>();
let cleanups: Cleanup[] = [];

/** bumped on every page; an init records the generation it last ran in */
let gen = 0;
const ranIn = new Map<string, number>();

let booted = false;
/** true between astro:before-swap and astro:page-load — the only window in
 *  which the router's page-load means "a new page arrived" rather than
 *  "the first page finished loading" */
let swapping = false;

/** register the undo for something this page bound — every window/document
 *  listener and every interval needs one */
export function addCleanup(fn: Cleanup) {
  cleanups.push(fn);
}

const teardown = () => {
  const list = cleanups;
  cleanups = [];
  for (const fn of list) {
    try {
      fn();
    } catch {
      /* a teardown must never block the rest of the teardown */
    }
  }
};

const run = (id: string, init: Init) => {
  ranIn.set(id, gen);
  try {
    init();
  } catch (err) {
    /* one broken initialiser must not take the page down with it */
    console.error(`[page] init "${id}" failed`, err);
  }
};

const runAll = () => {
  gen += 1;
  teardown();
  booted = true;
  for (const [id, init] of inits) run(id, init);
};

/** declare a per-page initialiser; safe to call from any module, any number
 *  of times — the last registration under an id wins */
export function register(id: string, init: Init) {
  inits.set(id, init);
  /* a script that only appears on THIS page arrives after the page's
     page-load has already fired, so it has to run itself */
  if (booted && ranIn.get(id) !== gen) run(id, init);
}

/** wire the lifecycle — safe to call from any module, runs once */
let wired = false;

export function bootPage() {
  if (wired) return;
  wired = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll, { once: true });
  } else {
    runAll();
  }

  /* the swap has not happened yet, so the old DOM is still queryable */
  document.addEventListener('astro:before-swap', () => {
    swapping = true;
    teardown();
  });

  /* page-load also fires once on the very first load (the router listens for
     `load`), which DOMContentLoaded has already covered */
  document.addEventListener('astro:page-load', () => {
    if (!swapping) return;
    swapping = false;
    runAll();
  });
}

/** true when the visitor arrived via a client-side navigation rather than a
 *  fresh document load — used to skip one-time entrances */
export const isNav = () => swapping || Boolean(history.state?.index);
