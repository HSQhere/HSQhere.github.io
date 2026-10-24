/**
 * /rss.xml — full-text-less RSS 2.0 feed.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postPath, plainExcerpt } from '../lib/posts';
import { site } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = await getPosts();

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.title,
      link: postPath(post),
      pubDate: post.data.date,
      description: post.data.excerpt ?? plainExcerpt(post.body ?? '', 160),
      categories: [...post.data.categories, ...post.data.tags],
    })),
    customData: `<language>${site.lang}</language>`,
  });
}