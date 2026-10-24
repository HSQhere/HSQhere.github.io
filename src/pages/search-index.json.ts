/**
 * /search-index.json — the payload the /search/ page loads.
 *
 * Two modes are supported by the client, so the index carries both:
 *   • 标题模式 — only title / tags / categories / excerpt are needed
 *   • 全文模式 — additionally needs the stripped body text
 *
 * Generated at build time, so it is a static file on GitHub Pages.
 */
import type { APIRoute } from 'astro';
import { getPosts, postPath, plainExcerpt } from '../lib/posts';

/** Remove markdown syntax so the client can match against plain words. */
function toPlain(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*>\s?/gm, ' ')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\[[ xX\/-]\]\s*/g, ' ')
    .replace(/[➕🛫✅❌⏫🔼🔽⏬]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const GET: APIRoute = async () => {
  const posts = await getPosts();

  const index = posts.map((post) => {
    const body = post.body ?? '';
    return {
      title: post.data.title,
      url: postPath(post),
      date: post.data.date.toISOString().slice(0, 10),
      tags: post.data.tags,
      categories: post.data.categories,
      excerpt: post.data.excerpt ?? plainExcerpt(body, 120),
      text: toPlain(body).slice(0, 4000),
    };
  });

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};