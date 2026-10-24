/**
 * gallery.ts — album metadata plus the asset map.
 *
 * Only one album actually has photos on disk (`sun`); the other six albums in
 * the old site referenced images that were never committed, so they are simply
 * not listed. Nothing here ever points at a missing file: every entry is
 * resolved through import.meta.glob and dropped when absent.
 */
import type { ImageMetadata } from 'astro';

// A negation pattern keeps the never-referenced 微信图片_* originals out of the
// bundle: an eager glob pulls every match through the image pipeline, so files
// that no album lists would otherwise ship ~3.7 MB of dead weight to dist.
const sunFiles = import.meta.glob<ImageMetadata>(
  ['../assets/gallery/sun/*.{jpg,jpeg,png,webp}', '!../assets/gallery/sun/微信图片_*'],
  { eager: true, import: 'default' }
);

const byBase = (files: Record<string, ImageMetadata>) => {
  const map = new Map<string, ImageMetadata>();
  for (const [path, img] of Object.entries(files)) {
    const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
    map.set(name, img);
  }
  return map;
};

const sun = byBase(sunFiles);

export type Photo = { src: ImageMetadata; caption: string };

export type AlbumGroup = { title: string; photos: Photo[] };

export type Album = {
  slug: string;
  title: string;
  emoji: string;
  tagline: string;
  cover: ImageMetadata;
  groups: AlbumGroup[];
  count: number;
};

/** resolve a list of basenames, silently skipping anything that is not on disk */
const pick = (map: Map<string, ImageMetadata>, names: string[], caption?: (n: string) => string): Photo[] =>
  names
    .map((n) => {
      const src = map.get(n);
      return src ? { src, caption: caption ? caption(n) : n } : null;
    })
    .filter((p): p is Photo => p !== null);

const numbered = (prefix: string, from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; i <= to; i += 1) out.push(`${prefix}${i}`);
  return out;
};

const sunGroups: AlbumGroup[] = [
  { title: '初阳', photos: pick(sun, ['初阳1', '初阳2']) },
  { title: '晨曦', photos: pick(sun, ['晨曦1', '晨曦2']) },
  { title: '落日', photos: pick(sun, [...numbered('落日', 1, 9)]) },
  { title: '晚霞', photos: pick(sun, ['浙江晚霞1', '广州晚霞1']) },
  { title: '余晖', photos: pick(sun, ['椅子和余晖1', '猫和余晖1']) },
  { title: '镜面反射', photos: pick(sun, ['落日-反光1', '反射1']) },
  { title: '衍射', photos: pick(sun, numbered('衍射', 1, 4)) },
  { title: '天与树', photos: pick(sun, ['天1', '天2', '天3', '天4', '树与日1']) },
];

const count = (groups: AlbumGroup[]) => groups.reduce((n, g) => n + g.photos.length, 0);

const sunAll = sunGroups.flatMap((g) => g.photos);

export const albums: Album[] = [
  {
    slug: 'sun',
    title: '光影希冀',
    emoji: '☀️',
    tagline: '记录这颗亿万年散发能量的恒星。',
    cover: sunAll[0].src,
    groups: sunGroups.filter((g) => g.photos.length),
    count: count(sunGroups),
  },
];

export const getAlbum = (slug: string) => albums.find((a) => a.slug === slug);