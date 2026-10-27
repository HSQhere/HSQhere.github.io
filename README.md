# HSQ 的小站

用 **Astro 7 + TypeScript + 原生 CSS** 从零重写的个人博客，没有套任何现成主题。
水彩 / 治愈系配色，首页是「居中名字 + 散落的桌面小物件」，日志按 `年/月/日/文件名` 生成固定链接，
和旧 Hexo 站的地址完全一致。

- 线上地址：<https://hsqhere.github.io>
- 本地目录：`F:\myblognew`
- 旧站备份（**只读，不要改**）：`F:\myblog`

---

## 一、本地预览（手动操作）

### 1. 装依赖（只需要第一次，或 `package.json` 变过之后）

```powershell
cd F:\myblognew
npm install
```

### 2. 起开发服务器

```powershell
cd F:\myblognew
npm run dev
```

看到这样的输出就成功了：

```
astro  v7.4.2 ready in 2854 ms
┃ Local    http://localhost:4321/
```

浏览器打开 <http://localhost:4321/> 即可。

- 改任何 `.astro` / `.md` / `.css` 文件，浏览器会**自动热更新**，不用重启。
- 想停掉：在运行 `npm run dev` 的那个终端窗口按 `Ctrl + C`。
- 端口被占用时换一个：`npm run dev -- --port 4322`。
- 想在手机上看（同一个 Wi-Fi）：`npm run dev -- --host`，然后访问终端里打印的 `Network` 地址。

### 3. 看「真正部署后」的样子

开发服务器带 HMR，和最终产物有一点点差别（比如图片响应式变体是 build 时才生成的）。
想看真东西：

```powershell
cd F:\myblognew
npm run build      # 产物在 dist\，约 3~4 秒
npm run preview    # 起一个静态服务器
```

`preview` 默认在 <http://localhost:4321/>，如果 dev 正开着会冲突，用 `npm run preview -- --port 4400`。

### 4. 建议逛的页面

| 地址 | 看什么 |
| --- | --- |
| `/` | 首页：开场动画、居中名字、6 个散落小物件、便当格板块 |
| `/archive/` | 全部 40 篇按年份分组 |
| `/2026/07/02/有感FOC(SVPWM)/` | 最长的一篇，KaTeX 公式最多，用来验收排版 |
| `/gallery/` → `/gallery/sun/` | 图库 + 灯箱 |
| `/plan/` | 规划页，数据直接来自 `To-Do` 那篇文章 |
| `/search/` | 搜索，标题模式 / 全文模式可切换 |
| `/tags/`、`/categories/` | 标签云、分类 |

---

## 二、日常维护：怎么加 / 改内容

### 加一篇日志

**推荐：双击根目录的 `新建文章.bat`**，输入标题 → 标签 → 分类，它会自动建好文件夹、写好 frontmatter、填上当前时间，然后问你要不要用 VS Code 打开。

也可以用命令行一次带上参数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\new-post.ps1 -Title "我的新文章" -Tags "电控,笔记" -Categories "技术"
```

不想用脚本的话，就手动建：在 `src/content/posts/` 下新建一个**文件夹**，文件夹名就是 URL 里的最后一段，里面放 `index.md` 和这篇要用的图片：

```
src\content\posts\我的新文章\
    index.md
    图1.png
    图2.jpg
```

`index.md` 的开头必须有 frontmatter：

```markdown
---
title: 我的新文章
slug: 我的新文章
date: 2026-09-10 14:30:00
tags: [电控, 笔记]
categories: [技术]
cover: ./图1.png
---

正文从这里开始……
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 文章标题，页面上显示这个 |
| `slug` | ✅ | **URL 里的那一段**。为了不破坏旧链接，这里存的是原 Hexo 的文件名（可以含中文、括号） |
| `date` | ✅ | 决定 URL 里的年月日，也是排序依据 |
| `updated` | | 更新时间，可选 |
| `tags` | | 字符串数组，也可以写成 YAML 列表（`- 电控` 一行一个） |
| `categories` | | 同上 |
| `cover` | | 封面图，写 `./文件名` 相对本文件夹；也可以不写 |
| `coverAlt` | | 封面图的无障碍描述 |
| `excerpt` | | 手写摘要；不写就自动从正文截前 140 字 |
| `draft` | | `true` = 只在 dev 里能看到，build 时会被排除 |
| `pinned` | | 置顶标记 |

> ⚠️ **`slug` 不要随便改**，改了这篇文章的网址就变了，旧链接会 404。
> 日期也一样——`date` 参与 URL 生成，改日期等于改网址。

正文里插图直接用相对路径，**不要**写 `/images/...`：

```markdown
![描述](./图2.jpg)
```

Astro 会自动把图压缩、转 webp、生成多尺寸 srcset、补上 `width`/`height`（防抖动）和 `loading="lazy"`。

### 写公式

行内 `$V_\alpha$`，独占一行 `$$ ... $$`。KaTeX 在构建时渲染成静态 HTML，不需要客户端 JS。
矩阵、`cases`、`array` 都支持：

```markdown
$$
\begin{bmatrix} u_a \\ u_b \\ u_c \end{bmatrix}
= \begin{bmatrix} 1 & 0 \\ -\frac{1}{2} & \frac{\sqrt{3}}{2} \end{bmatrix}
\begin{bmatrix} u_\alpha \\ u_\beta \end{bmatrix}
$$
```

### 写待办（Obsidian 语法）

支持 `- [ ]` `- [/]` 进行中 `- [x]` 完成 `- [-]` 搁置，加上 `➕ 🛫 ✅ ❌` 日期和 `⏫ 🔼 🔽 ⏬` 优先级：

```markdown
- [/] #todo 学日语N5 ⏫ ➕ 2026-03-17 🛫 2026-03-17
```

会渲染成带颜色状态和日期小标签的条目。这些条目同时会被 `/plan/` 页面解析成任务列表。

### 改规划页

`/plan/` **没有独立的数据文件**，它直接读 `src/content/posts/To-Do/index.md` 里的任务。
想改计划就改那篇文章，改完规划页和首页的便签小物件一起变。

### 加图库照片

1. 把图片丢进 `src\assets\gallery\sun\` 或 `src\assets\gallery\friends\`（可建子文件夹）
2. 在 `src\lib\gallery.ts` 里把文件名（不带扩展名）加到对应分组：

```ts
{ title: '落日', photos: pick(sun, [...numbered('落日', 1, 9)]) },
```

`pick()` 会**静默跳过不存在的文件**——写错了不会出破图，只是少一张。

### 加友链

改 `src\lib\friends.ts` 的 `friends` 数组，一个对象一条。`accent` 可选 `mint / peach / lilac / sky / sun`。

### 改站名、导航、首页文案、音乐

全部集中在 `src\lib\site.ts`：`site.title`、`site.nav`、`site.hero`、`site.bento`、`site.growth`、
`site.music` / `site.playlist`、`site.social`、`site.quotes`（一言接口挂掉时的兜底）。
组件里不硬编码文案，改这一个文件就够了。

音乐文件放 `public\music\`，然后在 `site.ts` 里写 `/music/文件名.mp3`。

### 改配色 / 圆角 / 间距 / 字体

只有 `src\styles\tokens.css` 一个地方定义 CSS 变量（`--mint`、`--paper`、`--r-lg`、`--s-5`…），
其余样式全部引用变量。换主题色只改这里。

---

## 三、上线：部署到 GitHub Pages

### 已经配好的部分

- `.github/workflows/deploy.yml`：push 到 `main` 就自动 build + 部署，Node 24
- `astro.config.mjs`：`site: 'https://hsqhere.github.io'`
- `public\.nojekyll`：防止 GitHub Pages 吞掉 `_astro` 目录
- `public\robots.txt`、`public\favicon.svg`

### 你需要手动做的（一次性）

**1. 在 GitHub 上把 Pages 的来源改成 GitHub Actions**

打开 <https://github.com/HSQhere/HSQhere.github.io/settings/pages>，
把 **Build and deployment → Source** 从 `Deploy from a branch` 改成 **`GitHub Actions`**。
不改的话 workflow 会跑成功，但站点不会更新。

**2. 把代码推上去**

```powershell
cd F:\myblognew
git push -u origin main
```

第一次推会弹窗让你登录 GitHub（浏览器授权），登录一次之后就不用再输了。

> ⚠️ 推上去会**替换掉线上现在的旧 Hexo 站**。旧站的内容已经全部迁移到这个仓库里，
> 但如果你想留个退路，推之前先在 GitHub 上打个 tag 或者建个 `legacy` 分支。

**3. 等 Actions 跑完**

去 <https://github.com/HSQhere/HSQhere.github.io/actions> 看 `Deploy to GitHub Pages`。
绿色勾之后访问 <https://hsqhere.github.io>。第一次可能要等 1~2 分钟生效。

### 以后更新

```powershell
cd F:\myblognew
git add --all
git commit -m "写了篇新文章"
git push
```

push 完 Actions 自动构建部署，不用手动 build。

---

## 四、命令速查

```powershell
npm install          # 装依赖
npm run dev          # 开发服务器 http://localhost:4321
npm run build        # 生产构建 → dist\
npm run preview      # 预览 dist\（默认 4321，冲突就加 -- --port 4400）
npm run check        # TypeScript + Astro 类型检查（当前 0 error / 0 warning）
```

### 辅助脚本（`scripts\`，需要服务器先起着）

| 脚本 | 用途 |
| --- | --- |
| `新建文章.bat`（根目录） | 交互式新建文章：问标题/标签/分类 → 生成文件夹 + frontmatter，再问要不要打开 |
| `scripts\new-post.ps1` | 上面那个 bat 的实际实现，也可以直接带参数调用 |
| `node scripts\check.mjs http://localhost:4321` | 批量探页面状态码 + 统计 KaTeX 报错数 |
| `node scripts\linkcheck.mjs` | 遍历 `dist\` 里每个 `index.html`，逐条请求，验证没有死路由（对着 `preview` 的 4400 端口） |
| `node scripts\refcheck.mjs` | 抓所有页面里的 `href`/`src`，逐条请求，验证没有死资源 |
| `node scripts\cdp.mjs <url> <宽> <高> <输出.png>` | headless Chrome 整页截图 |
| `node scripts\clip.mjs <url> <宽> <高> <输出.png> <y> <高>` | 截取页面某一段 |
| `node scripts\measure.mjs <url> <宽> <高> <expr.js>` | 在页面里跑 JS 并打印结果（量宽度、查样式） |

最近一次全量校验：路由 **157 条全部 200**，资源引用 **395 条全部 200**，KaTeX 报错 **0**。

---

## 五、目录结构

```
F:\myblognew
├─ astro.config.mjs        # 站点 URL、KaTeX、sitemap、/archives 重定向
├─ src
│  ├─ content
│  │  └─ posts\<文章名>\index.md + 图片     # 40 篇，图片和文章同目录
│  ├─ content.config.ts    # 文章 frontmatter 的 zod schema
│  ├─ pages
│  │  ├─ index.astro                  # 首页
│  │  ├─ [...slug].astro              # 文章页，生成 /2026/07/02/xxx/
│  │  ├─ archive.astro  tags\  categories\  gallery\  plan.astro  friends.astro  about.astro  search.astro  404.astro
│  │  └─ search-index.json.ts         # 搜索用的 JSON 索引
│  ├─ layouts
│  │  ├─ Base.astro                   # <head>、header、footer、全局 CSS
│  │  └─ PostLayout.astro             # 文章页：面包屑、目录、上下篇
│  ├─ components
│  │  ├─ chrome\     Header / Footer
│  │  ├─ post\       PostCard / Toc
│  │  ├─ sections\   HeroCluster / BentoGrid / IntroOverlay
│  │  └─ widgets\    WidgetHost（首页散落的小物件）
│  ├─ effects\motion.ts               # 视差、开场、滚动揭示（全部 setInterval，不用 rAF）
│  ├─ lib
│  │  ├─ site.ts        # 站名 / 导航 / 文案 / 音乐
│  │  ├─ posts.ts       # URL 生成、排序、标签、摘要、阅读时长
│  │  ├─ plan.ts        # 解析 Obsidian 待办
│  │  ├─ gallery.ts     # 相册分组 + 图片映射
│  │  ├─ friends.ts     # 友链
│  │  └─ widgets.ts     # 首页小物件的位置 / 角度 / 大小
│  ├─ plugins            # 自定义 remark 插件（待办语法、标题里的公式）
│  └─ styles             # tokens.css 变量 / base.css 重置 / prose.css 正文
├─ public                # 原样拷贝：music\、favicon.svg、robots.txt、.nojekyll
├─ reference             # 旧站的 HANDOFF 文档 + v1 静态原型（仅参考，不参与构建）
├─ scripts               # 上面那些校验 / 截图脚本
└─ .github\workflows\deploy.yml
```

---

## 六、几个设计上的取舍（避免以后踩坑）

**URL 用文件名，不用标题。** 旧 Hexo 的 `permalink: :year/:month/:day/:title/` 里的 `:title` 取的是**文件名**，
40 篇里有 13 篇的文件名和 frontmatter `title` 不一致。为了旧链接不断，`slug` 存的是原文件名（含中文和括号），
`src\pages\[...slug].astro` 生成 `/{年}/{月}/{日}/{slug}/`。所以文章页是**顶层路由**，不是 `/posts/...`。

**图片和文章同目录，用 `./` 引用。** 迁移时把旧站的 `../images/tech/xxx.png` 全部改成了 `./xxx.png` 并把文件拷到文章目录里。
好处是删文章时图片跟着走，不会留孤儿文件。

**图库只保留真实存在的两个相册。** 旧站的 `landscape` / `life` / `tech` / `travel` / `qsl` 五个相册，
引用的 31 张图片从来没有提交进仓库（全盘搜索也找不到），所以直接不列出来，而不是显示破图。

**没有用任何 UI 框架 / 主题。** 全部是手写 CSS + 原生 `<script>`。JS 只在 4 个地方：开场动画、视差、目录滚动高亮、搜索。
不用 `requestAnimationFrame`，动画统一走 `setInterval` + CSS transition，`prefers-reduced-motion` 下全部关闭。

**KaTeX 的 CSS 必须显式 import。** `src\layouts\Base.astro` 第 8 行 `import 'katex/dist/katex.min.css';`
——删了它公式就会塌成一行乱码（HTML 树是对的，但没有排版样式）。这是之前踩过的坑。

**改 CSS 变量文件要注意换行符。** `src\styles\*.css` 用的是 LF，用带 `\r\n` 的锚点做字符串替换会静默失败。

---

## 七、常见问题

**`npm` 命令找不到？**
用完整路径 `& 'C:\Program Files\nodejs\npm.cmd' run dev`，或者把 `C:\Program Files\nodejs` 加进 PATH。

**`npm run build` 卡住不动？**
Astro 7 的 build 在这个环境里前台跑会超时。用后台方式：

```powershell
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'node_modules\astro\bin\astro.mjs','build' `
  -WorkingDirectory 'F:\myblognew' -PassThru -NoNewWindow
```

**改了 remark 插件但页面没变？**
Astro 会缓存渲染结果。删掉 `.astro\` 目录再重启 dev。

**文章里公式显示成一堆字母？**
检查 `src\layouts\Base.astro` 里那行 `import 'katex/dist/katex.min.css';` 还在不在。

**部署后页面 404 / 样式全丢？**
多半是 `public\.nojekyll` 被删了（GitHub Pages 的 Jekyll 会忽略 `_astro` 开头的目录），
或者 Settings → Pages 的 Source 没改成 GitHub Actions。

---

## 八、许可

文章内容 © HSQ，转载请附带原链接。
代码随便看随便抄。