import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** 旧站 permalink 是 /:year/:month/:day/:title/，title 取的是文件名。 */
export function postPath(post: Post): string {
  const d = post.data.date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `/${y}/${m}/${day}/${post.data.slug}/`;
}

export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateCN(d: Date): string {
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}

/** 所有已发布文章，按日期倒序。 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** 按年份分组，年份倒序、组内日期倒序。 */
export function groupByYear(posts: Post[]): { year: number; posts: Post[] }[] {
  const map = new Map<number, Post[]>();
  for (const p of posts) {
    const y = p.data.date.getUTCFullYear();
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(p);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({ year, posts: list }));
}

/** 标签 -> 文章数，按数量倒序。 */
export function collectTags(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    for (const t of p.data.tags ?? []) {
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(p);
    }
  }
  return new Map([...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh')));
}

/** 分类 -> 文章数。 */
export function collectCategories(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of posts) {
    for (const c of p.data.categories ?? []) {
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(p);
    }
  }
  return new Map([...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh')));
}

/** 上一篇 / 下一篇（按时间线）。 */
export function neighbours(posts: Post[], current: Post): { prev?: Post; next?: Post } {
  const i = posts.findIndex((p) => p.id === current.id);
  if (i < 0) return {};
  return { next: posts[i - 1], prev: posts[i + 1] };
}

/** 纯文本摘要：去掉 HTML 标签、公式、代码围栏。 */
export function plainExcerpt(body: string | undefined, limit = 140): string {
  if (!body) return '';
  let s = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/[#>*_`~\[\]()|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > limit ? s.slice(0, limit).trimEnd() + '…' : s;
}

/** 阅读时长（中文按 400 字/分钟）。 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (body.match(/[A-Za-z0-9_]+/g) ?? []).length;
  return Math.max(1, Math.round((cjk + words * 1.6) / 400));
}