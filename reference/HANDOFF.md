# 个人博客重构 · 交接文档

> 用途：把已确定的全部决策、已排查出的问题、参考样稿位置交给新的会话，开始正式开发。
> 目标目录：`F:\myblognew`（目前只有 `reference/`）
> 旧站目录：`F:\myblog` —— **只读，不要修改**

---

## 1. 任务背景

旧博客是 Hexo 8.1.1 + Nexmoe 主题，用了很久，积累了大量渲染问题。决定完全重写，**不套现成主题**，自己实现一套精简、明确、易扩展的架构。视觉走**治愈系水彩 + 可爱**方向（不是机甲风），要有恰到好处的动画与视差。

---

## 2. 旧站诊断（有据可查，非猜测）

| 问题 | 证据 | 根因 |
| --- | --- | --- |
| 文章封面在手机上塌陷 | 155 个构建页面的封面都是 `padding-top: NaN%` | 主题按配置里的宽高算比例，文章 `cover` 没有宽高；只在 ≥768px 被 custom.css 覆盖 |
| 公式下标变斜体、矩阵挤成一行 | 16 处出现 `$\vec{V}<em>{ref}$` | markdown-it 先把 `_` 当强调、`\\` 当转义；同时装了三套数学管线 |
| 计划页 `[/]` `[-]` 不显示 | 输出成 `[&#x2F;]` | 只支持 GFM 的 `[x]`/`[ ]`；`scripts/task-renderer.js` 整份被注释 |
| 标签页空白 | `/tags/` 写着"完善中"，但实际构建了 80 个标签页 | 手写 `source/tags/index.md` 覆盖了主题模板 |
| 图库缺 31 张图 | 72 处引用只有 41 张存在 | 素材未同步进仓库 |
| 图片路径靠浏览器容错 | 22 篇用 `../images/...`，构建后变 `/../images/...` | `post_asset_folder: false` |
| 主题 CDN 指向作者仓库 | `imageCDN.to: cdn.jsdelivr.net/gh/nexmoe/...` | 模板默认值未删 |
| 体积大 | 69MB 图片，13 张 >1MB 合计 36MB | 未压缩 |

**规模**：40 篇文章、约 19.3 万字符、82 处图片引用、6 个栏目页、3 首本地音乐、80 个标签、20 个分类。

**安全问题（必须处理）**：`F:\myblog\note.txt` 明文存有 MongoDB 连接串（含密码）和 Twikoo 管理密码。不要带进新项目，并且**建议轮换这两个凭据**。

---

## 3. 已锁定的设计决策

- ✅ **技术栈**：Astro + TypeScript + 原生 CSS（不用 Tailwind，不用现成主题）
- ✅ **风格**：治愈系水彩、可爱、圆润、低饱和
- ✅ **评论**：不要（Twikoo、Netlify 依赖一并去掉）
- ✅ **图库**：现有文件原样保留不动，只做"缺图不显示破图"的容错
- ✅ **计划页**：只读，内容来自 Obsidian（网页不可编辑）
- ✅ **首页**：**不放文章列表**，先英雄区，下滑是便当格板块入口，点进去才是各板块
- ✅ **背景**：湖景照片（你提供的第二张，1706×1279）
- ✅ **头像分工**：左上角/站点头像 = 真实照片（旧博客 `avatar.jpg`，戴兔耳帽看手机那张）；猫猫 = **网站虚拟形象**，只出现在英雄区和开场
- ✅ **猫猫素材**：`F:\code\Flowmate\docs\references\flowmate-ldle.png`（已抠透明底）
- ✅ **开场动画**：逐字弹跳 + 云开（合并成一条时间线）
- ✅ **语录**：接旧博客的一言接口 `https://v1.hitokoto.cn/?encode=json`，取 `hitokoto` 和 `from`
- ✅ **不要冗余小字**：已删掉"猫猫会在这里陪我值班""点一点它""沿着这条路，慢慢走""慢一点也没关系"等装饰性文案

---

## 4. ⚠️ 待实现的新要求（v1 样稿里尚未做）

这三条是最后提出的，**`reference/v1` 里还是旧布局**，正式开发时按下面改：

1. **小组件位置**：从页面最下方移到**个人名字旁边**（英雄区），不要留在便当格底部
2. **时钟形态**：改成**数字显示**，不要指针表盘
3. **居中与散布**：小组件和名字**一起放在画面正中**；排列要像 lvy 那样**散落、不规整**（大小不一、角度各异、基线错开），不要网格对齐

---

## 5. 视觉规范

### 色板（水彩）
```
纸底      #fffdf9 / #fdfaf5
墨色      #34383f（正文）、#5c636e（次要）
薄荷绿    #7fc7a9  深 #4c8a70  浅 #d3efdf
蜜桃橘    #ffbba0  浅 #ffe3c9
淡紫      #dedbf6
天蓝      #d3e7ff
玻璃      rgba(255,255,255,.50)
玻璃描边  rgba(255,255,255,.82)
```

### lvyovo 卡片实测参数（可直接复用）
```
border-radius: 64px（大卡）/ 12px（小方块）
background: rgba(255,255,255,.4)
box-shadow: 0 40px 50px -32px rgba(0,0,0,.05),
            inset 0 0 20px rgba(255,255,255,.25)
backdrop-filter: blur(4px)
```
卡片尺寸错落：左 280/266、中 360、右 232/350，另有 45px 小方块。

### 字体
- 正文/UI：Quicksand + PingFang SC / 微软雅黑
- 标题（如需衬线感）：Songti SC / STSong

---

## 6. 页面结构（信息架构）

```
首页     英雄区（名字 + 猫猫 + 语录 + 小组件）+ 便当格板块入口
日志     归档（按年）+ 分类 + 标签 + 搜索
图库     瀑布流 + 灯箱 + 相册分类
计划     Obsidian 任务只读展示
朋友     好友卡片 + 姓名解锁
关于     简介 + 技能 + GitHub 状态 + 联系方式
```

便当格板块（v1 现有）：导航卡、日志（40 篇）、图库预览、计划、朋友、关于、成长路径、音乐、书桌小组件。

合并项：`To-Do.md` 与 `plan/index.md` 是同一份内容的两份拷贝，合成一个计划页；`Q&A` 本质是评论区入口，评论既然去掉，可并入关于页。
补齐项：RSS、sitemap、robots、404（旧站全都没有）。

---

## 7. 推荐架构（自建、精简、易扩展）

```
F:\myblognew\
├─ astro.config.mjs
├─ package.json
├─ .github/workflows/deploy.yml
├─ public/
│  └─ music/                     # 3 首 mp3 + 封面
├─ src/
│  ├─ content.config.ts          # zod schema 校验 frontmatter
│  ├─ content/
│  │  ├─ posts/2026-08-08-clip/index.md + 同目录图片
│  │  └─ pages/about.md
│  ├─ layouts/
│  │  ├─ Base.astro              # html 骨架、meta、全局样式
│  │  └─ PostLayout.astro        # 文章页（TOC + 正文 + 上下篇）
│  ├─ components/
│  │  ├─ chrome/                 # Header / Footer / MusicBar
│  │  ├─ sections/               # Hero / BentoGrid / DeskWidgets / GrowthPath
│  │  ├─ widgets/                # 书桌小组件，一个物件一个组件
│  │  │  ├─ ClockWidget.astro    # 数字时钟
│  │  │  ├─ TapeWidget.astro
│  │  │  ├─ NoteWidget.astro
│  │  │  └─ PolaroidWidget.astro
│  │  ├─ post/                   # Prose / Toc / PostCard / TaskList
│  │  └─ ui/                     # Glass / Badge / Button
│  ├─ effects/
│  │  ├─ motion.ts               # 指针+滚动深度、倾斜、入场
│  │  └─ intro.ts                # 开场序列
│  ├─ lib/
│  │  ├─ site.ts                 # 站点配置：名字、导航、facts、成长路径
│  │  ├─ widgets.ts              # 小组件注册表（核心扩展点）
│  │  └─ hitokoto.ts             # 一言 + 本地回退
│  ├─ styles/
│  │  ├─ tokens.css              # 所有颜色/圆角/尺寸变量（唯一来源）
│  │  ├─ base.css
│  │  └─ prose.css               # 文章排版
│  └─ pages/
│     ├─ index.astro
│     ├─ posts/[...slug].astro
│     ├─ archive.astro
│     ├─ tags/[tag].astro
│     ├─ gallery/index.astro
│     ├─ gallery/[album].astro
│     ├─ plan.astro
│     ├─ friends.astro
│     ├─ about.astro
│     ├─ 404.astro
│     ├─ rss.xml.ts
│     └─ sitemap.xml.ts
```

### 关键扩展点：小组件注册表

`src/lib/widgets.ts` 用数组描述桌面上摆什么，加一个新物件 = 写一个组件 + 加一条配置：

```ts
export const deskWidgets = [
  { id: "clock",    component: ClockWidget,    x: 12, y: 30, size: 1.0, rotate: -6 },
  { id: "tape",     component: TapeWidget,     x: 34, y: 52, size: 0.95, rotate: 4 },
  { id: "note",     component: NoteWidget,     x: 58, y: 26, size: 0.9, rotate: -4 },
  { id: "polaroid", component: PolaroidWidget, x: 78, y: 48, size: 0.85, rotate: 7 },
];
```
坐标用百分比，`rotate` 和 `size` 制造不规整感 —— 满足第 4 节"散落、不对称"的要求，且以后增删只改数据。

### 三条分层原则
1. **样式只有一个来源**：所有颜色/圆角/间距进 `tokens.css`，组件里不写字面色值
2. **文案只有一个来源**：站点级文案进 `lib/site.ts`，组件不硬编码
3. **动效只有一个入口**：`effects/` 下两个模块，组件用 `data-*` 属性声明意图，不各写一段 `<script>`

---

## 8. 内容迁移清单

| 项目 | 数量 | 处理 |
| --- | --- | --- |
| 文章 | 40 篇 | 迁到 `content/posts/` |
| 图片引用 | 82 处 | 图片与文章**同目录**，`![](./xxx.png)` |
| 有块级公式 | 13 篇 | 重点抽检 `有感FOC(SVPWM)`、`平衡小车`、`Transformer` |
| 有行内公式 | 16 篇 | 同上 |
| 缺图 | 31 处（图库） | 只做容错，不删引用 |
| 分类 / 标签 | 20 / 80 | 保留 |
| 音乐 | 3 首 | 迁到 `public/music` |

**迁移要点**
- **公式**：用 `remark-math` + `rehype-katex`，**构建期**渲染。remark 先于强调语法解析，`$...$` 不会再被吃掉
- **图片**：共置后交给 `astro:assets`，自动 WebP + 多尺寸 srcset；那 13 张 >1MB 的会被压下去
- **链接**：permalink 保持 `/2026/07/02/标题/` 形式，老链接不失效；同时在 frontmatter 加 ASCII `slug`
- **任务语法**：写 remark 插件把 `#todo`、`🛫`、`✅`、`❌`、`[/]`、`[-]` 转成带状态的列表
- **代码高亮**：Shiki 构建期完成，不引 highlight.js

---

## 9. 动效规范 + 踩过的坑

### 参考实现
- **Eric-Terminal/cf-astro-blog**（已下载研究过）：核心是用 CSS 变量驱动分层运动
  - `--hero-pointer-x/y`（指针，平滑系数 0.16）、`--hero-scroll-shift`（滚动，上限 180px）
  - 卡片倾斜 `--tilt-rotate-x/y`、`--tilt-shift-x/y`（平滑 0.2，最大 5.8°，透视 1200px）
  - 入场：各元素 80/120/130/190/260ms 交错延迟
- **lvy010 的仓库**：`X-Plore`（1623★）是纯 markdown 笔记库，**没有前端源码**；`lvyovo-wiki.tech` 的前端只能靠实测样式还原（参数见第 5 节）

### 本项目的动效清单
| 动效 | 实现 |
| --- | --- |
| 开场：头像浮起 → 逐字弹出"晚安 欢迎回来" → 文字退场 → 白雾左右散开 → 内容浮现 | 定时器补间，约 2.4–3s，可跳过 |
| 指针视差 | 背景照片、光斑、网格、光束、文案、猫猫卡分层反向位移 |
| 滚动视差 | 背景随滚动位移，约前景的 0.3 倍 |
| 猫猫卡 3D 倾斜 | 透视 1200px，最大 12° |
| 便当格入场 | 卡片 80ms 间隔升起 + 成长路径横线 1.1s 画满 |
| 书桌小物件 | 闹钟走针、磁带卷盘旋转、轻微浮动 |

### ⚠️ 必须知道的坑（都实际踩过）
1. **不要用 CSS transition/keyframes 做开场**：某些环境（预览沙箱、部分 WebView）不推进 CSS 动画，画面会冻在起始态。用 `setInterval` 逐帧写样式的显式补间，任何环境都能跑
2. **不要依赖 `requestAnimationFrame`**：沙箱里可能完全不触发。用指针事件直接驱动 + `setInterval` 做惯性和缓动
3. **注意类名冲突**：曾把背景遮罩和开场遮罩都叫 `.BH-veil`，导致遮罩被套上 50% 宽度规则，把首屏盖掉一半。层级元素要独立命名
4. **一言接口需要回退**：沙箱 CSP 会拦截跨域请求。策略是**先立刻显示内置语录，再异步替换**，失败就保留本地那条，绝不出现空白或"获取失败"
5. **必须尊重 `prefers-reduced-motion`**：开启后直接显示最终态
6. **抠图别用"接近白色即透明"**：会把角色的白帽子一起削掉。要用**从画面边缘向内泛洪填充**，只去背景

---

## 10. 已产出的参考文件

```
F:\myblognew\
└─ reference\
   ├─ README.md          v1 说明（含书桌区、响应式、动效清单）
   ├─ HANDOFF.md         本文档
   └─ v1\
      ├─ index.html      ← 双击即可打开，56KB，完整可运行
      └─ assets\
         ├─ lake.webp        首屏背景（1200×750，55KB）
         ├─ lake-sm.webp     图库缩略图（10KB）
         ├─ cat-hero.webp    猫猫透明立绘（69KB）
         ├─ cat-avatar.webp  猫猫圆形头像（28KB）
         └─ real-avatar.webp 真实头像（6KB）
```

**v1 已实现**：整屏英雄区左右分栏、猫猫跟随屏幕放大（`clamp(300px, 26vw, 460px)`，卡片上限 520px）、一言语录、便当格九宫板块、书桌小物件、开场动画、指针+滚动视差。
**v1 未实现**：第 4 节的三条新要求（小组件移到名字旁、数字时钟、居中散落）。

参考样稿只是视觉与交互基准，**不是代码起点**。正式开发按第 7 节架构重写。

---

## 11. 建议实施顺序

1. **资产整理**：图片去重压缩、31 张缺图清单、frontmatter 规范化
2. **骨架**：Base 布局、tokens.css、文章页、归档、标签、搜索、RSS、部署
3. **逐篇迁移 + 抽检**：重点验证公式、表格、代码块、中文标点
4. **首页**：英雄区（含第 4 节新要求）+ 便当格 + 动效
5. **特色页**：图库灯箱、计划只读、朋友解锁
6. **打磨**：响应式各断点、无障碍、性能

业余时间估计：1–2 周可出可替换线上的版本。

---

## 12. 待确认 / 风险

- 猫猫目前是**静态立绘**，靠位移、倾斜、光晕制造体积感；要眨眼或换表情，需要从表情设定图逐张切帧
- 图库 31 张缺图：找回原图 / 删引用 / 重新整理，尚未决定（当前默认只做容错）
- 手机端首屏文案 + 猫猫会略高于一屏，滚动提示贴边；可考虑把猫猫缩到 180px 或隐藏提示
- `note.txt` 里的两个凭据建议尽快轮换
