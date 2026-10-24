import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slug: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      categories: z.array(z.string()).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      excerpt: z.string().optional(),
      draft: z.boolean().default(false),
      pinned: z.boolean().default(false),
    }),
});

export const collections = { posts };
