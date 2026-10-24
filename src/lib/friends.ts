/**
 * friends.ts — the friend links that are actually live on the old site.
 *
 * The old page kept seven more cards inside an HTML comment; they are not
 * carried over because none of them were ever enabled. Add new entries here and
 * the /friends/ page picks them up.
 */

export type Friend = {
  name: string;
  url: string;
  avatar: string;
  desc: string;
  /** shown under the card, e.g. the bare domain */
  domain: string;
  accent: 'mint' | 'peach' | 'lilac' | 'sky' | 'sun';
};

export const friends: Friend[] = [
  {
    name: 'Xuanna024',
    url: 'https://blog.bi7khi.xyz/',
    avatar: 'https://avatars.githubusercontent.com/u/69863155?v=4',
    desc: '一个有趣的无线电佬',
    domain: 'blog.bi7khi.xyz',
    accent: 'mint',
  },
  {
    name: 'lvy010',
    url: 'https://lvyovo-wiki.tech',
    avatar: 'https://avatars.githubusercontent.com/u/175585268?v=4',
    desc: '厉害的程序开发者，高质量高密度博客',
    domain: 'lvyovo-wiki.tech',
    accent: 'sky',
  },
];