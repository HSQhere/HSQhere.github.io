/**
 * check-dates.mjs — 检查所有文章的 date / updated 是否带了时区后缀。
 *
 * 背景：YAML 把 `2026-01-01 03:00:00` 这种不带时区的时间按 **UTC** 解析。
 * 于是北京时间凌晨 3 点写的文章，会被当成 UTC 3 点 = 北京 11 点，
 * 而取日期时又是按北京时间取，结果网址里的日子跑到前一天。
 * 所以 frontmatter 里必须写成 `2026-01-01 03:00:00 +08:00`。
 *
 * 用法：
 *   node scripts/check-dates.mjs          # 检查，有问题时退出码 1
 *
 * 这个脚本只读，不改任何文件；build 前顺手跑一下即可。
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const POSTS = join(ROOT, 'src', 'content', 'posts');

/** 有明确时区的写法：+08:00 / -05:00 / Z，或者带 T 的 ISO 串末尾带 Z。 */
const HAS_ZONE = /([+-]\d{2}:?\d{2}|Z)\s*$/;

/** 抓 frontmatter 里所有 date / updated 行（只看 --- 之间）。 */
function dateLines(text) {
  // 去掉 BOM：有些编辑器写出来的 UTF-8 带 BOM，否则下面的 startsWith 会失败，
  // 整个文件就被静默跳过了（看起来“没问题”，其实根本没检查）。
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!src.startsWith('---')) return null; // null = 没有 frontmatter，调用方要报出来
  const end = src.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = src.slice(3, end);
  const out = [];
  for (const line of fm.split(/\r?\n/)) {
    const m = /^(date|updated):\s*(.+?)\s*$/.exec(line);
    if (m) out.push({ key: m[1], value: m[2] });
  }
  return out;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name === 'index.md') yield full;
  }
}

const problems = [];
const noFrontmatter = [];
let checked = 0;

for await (const file of walk(POSTS)) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = dateLines(text);
  if (lines === null) {
    noFrontmatter.push(rel);
    continue;
  }
  if (lines.length === 0) {
    problems.push({ file: rel, key: 'date', value: '(缺失)', missing: true });
    continue;
  }
  for (const { key, value } of lines) {
    checked += 1;
    // 引号包起来的值去掉引号再判断
    const bare = value.replace(/^["']|["']$/g, '');
    if (!HAS_ZONE.test(bare)) {
      problems.push({ file: rel, key, value: bare });
    }
  }
}

if (noFrontmatter.length > 0) {
  console.error(`check-dates: ${noFrontmatter.length} 个文件没有解析出 frontmatter，无法检查：`);
  for (const f of noFrontmatter) console.error(`  ${f}`);
  process.exit(1);
}

if (problems.length === 0) {
  console.log(`check-dates: ${checked} 个日期字段全部带时区后缀，OK`);
  process.exit(0);
}

console.error(`check-dates: ${problems.length} 个日期字段有问题（共检查 ${checked} 个）\n`);
for (const p of problems) {
  console.error(`  ${p.file}`);
  if (p.missing) {
    console.error('    缺少 date 字段');
  } else {
    console.error(`    ${p.key}: ${p.value}   ← 应写成 "${p.value} +08:00"`);
  }
}
console.error('\n不带时区的时间会被 YAML 当成 UTC，网址里的日期会前移一天。');
process.exit(1);
