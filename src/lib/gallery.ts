/**
 * gallery.ts — album metadata plus the asset map.
 *
 * Only two albums actually have photos on disk (`sun`, `friends`); the other
 * five albums in the old site referenced images that were never committed, so
 * they are simply not listed. Nothing here ever points at a missing file: every
 * entry is resolved through import.meta.glob and dropped when absent.
 */
import type { ImageMetadata } from 'astro';

// Negation patterns keep the 17 never-referenced 微信图片_* originals out of the
// bundle: an eager glob pulls every match through the image pipeline, so files
// that no album lists would otherwise ship ~3.7 MB of dead weight to dist.
const sunFiles = import.meta.glob<ImageMetadata>(
  ['../assets/gallery/sun/*.{jpg,jpeg,png,webp}', '!../assets/gallery/sun/微信图片_*'],
  { eager: true, import: 'default' }
);
const friendFiles = import.meta.glob<ImageMetadata>(
  ['../assets/gallery/friends/**/*.{jpg,jpeg,png,webp}', '!../assets/gallery/friends/微信图片_*'],
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
const friends = byBase(friendFiles);

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

const friendGroups: AlbumGroup[] = [
  {
    title: '么么 · 么宇枫',
    photos: pick(friends, ['yyf骑车1', 'yyf睡觉1', 'yyf唱歌1', 'yyf鄙视1'], (n) => n.replace('yyf', '')),
  },
  {
    title: '欣欣 · 郭欣蕾',
    photos: pick(
      friends,
      ['gxl眯眯眼', 'gxl嗷呜', 'gxl小狗狗', 'gxl帅帅的小时候', 'gxl我与守宫', 'gxl好帅', 'gxl蜡笔小新', 'gxl可爱1', 'gxl你挡我路了', 'gxl可爱2', 'gxl双重气质', 'gxl与你相伴', 'gxlOOTD1', 'gxl超级烟熏妆'],
      (n) => n.replace('gxl', '')
    ),
  },
  {
    title: '贴贴 · 贴怡情',
    photos: pick(friends, ['tyq你的化身', 'tyq我们的开始', 'tyq我们的热情'], (n) => n.replace('tyq', '')),
  },
];

const count = (groups: AlbumGroup[]) => groups.reduce((n, g) => n + g.photos.length, 0);

const sunAll = sunGroups.flatMap((g) => g.photos);
const friendAll = friendGroups.flatMap((g) => g.photos);

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
  {
    slug: 'friends',
    title: '好友联结',
    emoji: '🫂',
    tagline: '每一个朋友都是我与世界的羁绊。',
    cover: friendAll[0].src,
    groups: friendGroups.filter((g) => g.photos.length),
    count: count(friendGroups),
  },
];

export const getAlbum = (slug: string) => albums.find((a) => a.slug === slug);