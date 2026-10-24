import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkObsidianTasks from './src/plugins/remark-obsidian-tasks.mjs';
import remarkHeadingMath from './src/plugins/remark-heading-math.mjs';

export default defineConfig({
  site: 'https://hsqhere.github.io',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The old Hexo site served the archive at /archives/ (plural). Keep that
  // URL alive so inbound links and bookmarks do not 404.
  redirects: {
    '/archives': '/archive/',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/gallery/'),
    }),
  ],
  markdown: {
    processor: unified({
      // remarkHeadingMath must run after remarkMath (inlineMath nodes have to
      // exist) and before rehypeKatex, so the TeX never reaches the heading.
      remarkPlugins: [remarkMath, remarkHeadingMath, remarkObsidianTasks],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
    }),
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
  vite: {
    build: { assetsInlineLimit: 2048 },
    server: {
      // Screenshot profiles / build output must never trigger a rebuild.
      watch: { ignored: ['**/.shots/**', '**/dist/**', '**/.astro/**'] },
    },
  },
});