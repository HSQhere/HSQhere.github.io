/**
 * datetime.ts — 全站唯一的“日期怎么显示”的地方。
 *
 * 约定：frontmatter 里的 date 一律是**北京时间（UTC+8）**，
 * 而且必须带 ` +08:00` 后缀，例如：
 *
 *     date: 2026-01-01 03:00:00 +08:00
 *
 * 为什么一定要带后缀：YAML 把不带时区的时间当成 UTC 解析。
 * 也就是说 `date: 2026-01-01 03:00:00` 会被读成 UTC 03:00，
 * 等于北京时间 11:00，日期和钟点都错了。带上 +08:00 才是对的。
 *
 * 为什么显示要单独走这里：`Date#getFullYear()` 之类的 getter 用的是
 * 构建机器的时区。CI 上跑的是 UTC，本地跑的是 UTC+8，同一个 Date
 * 在两台机器上会显示成不同的日子。所以下面所有函数都显式按
 * Asia/Shanghai 换算，结果跟构建机器的时区无关。
 *
 * 实现上不依赖 Intl/ICU：中国从 1991 年起不再实行夏令时，
 * 北京时间恒为 UTC+8，直接偏移 8 小时再用 UTC getter 即可，
 * 这样在 Node、构建机和浏览器里结果完全一致。
 */

/** 北京时间相对 UTC 的固定偏移（毫秒）。 */
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 把某个瞬间换算成“北京时间墙上钟”的 Date。
 * 返回的 Date 的 UTC getter 读出来就是北京的本地时间，
 * 只用来取数字，不要拿它再做时间运算或序列化。
 */
function toShanghaiWall(d: Date): Date {
  return new Date(d.getTime() + SHANGHAI_OFFSET_MS);
}

/** 北京时间年份。 */
export function yearOf(d: Date): number {
  return toShanghaiWall(d).getUTCFullYear();
}

/** 北京时间月份，1-12。 */
export function monthOf(d: Date): number {
  return toShanghaiWall(d).getUTCMonth() + 1;
}

/** 北京时间日，1-31。 */
export function dayOf(d: Date): number {
  return toShanghaiWall(d).getUTCDate();
}

/** `YYYY` */
export function yearText(d: Date): string {
  return String(yearOf(d));
}

/** `MM`，补零。 */
export function monthText(d: Date): string {
  return String(monthOf(d)).padStart(2, '0');
}

/** `DD`，补零。 */
export function dayText(d: Date): string {
  return String(dayOf(d)).padStart(2, '0');
}

/** `YYYY-MM-DD`（北京时间）。 */
export function ymd(d: Date): string {
  return `${yearText(d)}-${monthText(d)}-${dayText(d)}`;
}

/** `YYYY 年 M 月 D 日`（北京时间，月份和日不补零）。 */
export function ymdCN(d: Date): string {
  return `${yearOf(d)} 年 ${monthOf(d)} 月 ${dayOf(d)} 日`;
}

/** `YYYY-MM-DD HH:mm:ss`（北京时间，给 RSS / JSON 这类需要钟点的场景）。 */
export function ymdhms(d: Date): string {
  const w = toShanghaiWall(d);
  const hh = String(w.getUTCHours()).padStart(2, '0');
  const mm = String(w.getUTCMinutes()).padStart(2, '0');
  const ss = String(w.getUTCSeconds()).padStart(2, '0');
  return `${ymd(d)} ${hh}:${mm}:${ss}`;
}

/**
 * 带 +08:00 偏移的 ISO 8601 字符串，例如 `2026-01-01T03:00:00+08:00`。
 * 语义和 d.toISOString() 完全等价（同一个瞬间），
 * 区别只是写成了读者能直接看懂北京时间的形式。
 */
export function isoShanghai(d: Date): string {
  return `${ymd(d)}T${ymdhms(d).slice(11)}+08:00`;
}
