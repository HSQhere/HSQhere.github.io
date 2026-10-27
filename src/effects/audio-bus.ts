/**
 * audio-bus.ts — one sound at a time.
 *
 * The site has two places that can play music: the cassette on the homepage and
 * the CD dock that follows you across pages. Both register here, so starting
 * one silences the other instead of stacking two songs.
 */

const players = new Set<HTMLAudioElement>();

/** register an element; the returned function removes it again */
export function joinAudioBus(el: HTMLAudioElement) {
  players.add(el);
  el.addEventListener('play', () => {
    for (const other of players) {
      if (other !== el && !other.paused) other.pause();
    }
  });
  return () => {
    players.delete(el);
  };
}
