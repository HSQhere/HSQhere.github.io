/**
 * site.ts — every site-level string lives here. Components never hard-code copy.
 */

export const site = {
  name: 'HSQ',
  fullName: 'hsqhere',
  title: 'HSQ 的小站',
  tagline: '在电控、机器人与一点点浪漫之间，慢慢走。',
  description: '一个关于电机控制、嵌入式、机器人与日常记录的个人博客。',
  url: 'https://hsqhere.github.io',
  lang: 'zh-CN',
  locale: 'zh_CN',
  author: {
    name: 'HSQ',
    bio: '电子信息工程在读，喜欢把东西从零搭起来。',
  },
  /** greeting used by the intro sequence */
  intro: {
    greeting: '晚安',
    welcome: '欢迎回来',
  },
  /** hero headline + fact chips */
  hero: {
    hello: '你好呀，',
    iam: '我是',
    lead: '一个把电机、代码和落日都当作收藏品的工科生。',
    facts: ['📍 广州', '🎓 华南理工', '🛠 机器人', '📷 拍照'],
  },
  nav: [
    { href: '/', label: '首页' },
    { href: '/archive/', label: '日志' },
    { href: '/gallery/', label: '图库' },
    { href: '/plan/', label: '计划' },
    { href: '/about/', label: '关于' },
  ],
  /** 便当格板块入口 —— 首页下滑区域 */
  bento: [
    { id: 'archive', href: '/archive/', label: '日志', desc: '电控、算法、机器人，还有一些不太好分类的东西。', accent: 'mint' },
    { id: 'gallery', href: '/gallery/', label: '图库', desc: '用色彩和明暗记录的一瞬间。', accent: 'peach' },
    { id: 'plan', href: '/plan/', label: '计划', desc: '正在进行和已经完成的事。', accent: 'lilac' },
    { id: 'about', href: '/about/', label: '关于', desc: '我是谁，在做什么。', accent: 'sun' },
    { id: 'search', href: '/search/', label: '搜索', desc: '快速找到一篇文章。', accent: 'mint' },
  ],
  /**
   * 成长轨迹 —— 便当格最后一张卡，用 S 形曲线画出来。
   * from/to 是 YYYY-MM（含端点），篇数由构建时按真实文章时间线统计，
   * 所以这里只写阶段名和一句人话，不写数字。
   */
  growthPhases: [
    { label: '起步', from: '2026-03', to: '2026-03', range: '2026.03', note: '装系统、点灯、第一次画板' },
    { label: '电控', from: '2026-04', to: '2026-05', range: '2026.04 – 05', note: 'FOC、姿态解算、CATIA' },
    { label: '系统与控制', from: '2026-06', to: '2026-07', range: '2026.06 – 07', note: 'Jetson、ROS2、平衡车、LQR' },
    { label: '深度学习', from: '2026-08', to: '2026-08', range: '2026.08', note: 'Transformer、CLIP、ViT、PPO、RT-2' },
    { label: '往机器人走', from: '2026-09', to: '2026-12', range: '2026.09 –', note: '路径规划，还在路上' },
  ],
  /** 本地音乐（public/music） */
  music: {
    title: '夏が終わる',
    artist: 'ナナツカゼ',
    src: '/music/夏が終わる - ナナツカゼ.mp3',
    cover: '/music/夏が終わる - ナナツカゼ.png',
  },
  playlist: [
    { title: '夏が終わる', artist: 'ナナツカゼ', src: '/music/夏が終わる - ナナツカゼ.mp3', cover: '/music/夏が終わる - ナナツカゼ.png' },
    { title: '那么骄傲', artist: '茜茜', src: '/music/那么骄傲 - 茜茜.mp3', cover: '/music/cover茜茜.jpg' },
    { title: 'Rise up', artist: 'Luna、初音ミク', src: '/music/Rise up (feat. 初音ミク) - Luna、初音ミク.mp3', cover: '/music/cover初音ミク.png' },
  ],
  social: {
    github: 'https://github.com/HSQhere',
    email: 'hsqzsq@163.com',
  },
  /** 一言 fallback —— 接口挂掉时立刻显示，永不空白 */
  quotes: [
    { text: '既然选择了远方，便只顾风雨兼程。', from: '' },
    { text: '凡是过往，皆为序章。', from: '莎士比亚' },
    { text: '我们终将在更远的地方见。', from: '' },
    { text: '慢慢来，比较快。', from: '' },
    { text: '今天的月亮也很好看。', from: '' },
  ],
} as const;

export type NavItem = (typeof site.nav)[number];
export type BentoItem = (typeof site.bento)[number];