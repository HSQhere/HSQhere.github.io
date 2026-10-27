#Requires -Version 5.1
<#
    新建一篇博客文章（骨架生成器）

    用法（一般不用手敲，双击根目录的「新建文章.bat」即可）：
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\new-post.ps1
        powershell ... -File scripts\new-post.ps1 -Title "我的新文章" -Tags "电控,笔记" -Categories "技术"
#>
[CmdletBinding()]
param(
    [string]$Title = '',
    [string]$Tags = '',
    [string]$Categories = '',
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# ---------- 路径 ----------
$root  = Split-Path -Parent $PSScriptRoot          # scripts\ 的上一级 = 仓库根
$posts = Join-Path $root 'src\content\posts'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $posts)) {
    Write-Host "找不到文章目录：$posts" -ForegroundColor Red
    Write-Host "请把这个 bat 放在仓库根目录（和 package.json 同一层）再运行。" -ForegroundColor Red
    exit 1
}

function Write-Line($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

# YAML 裸字符串遇到 : # 之类会坏掉，必要时加双引号
function To-Yaml([string]$s) {
    if ($null -eq $s) { return '""' }
    $danger = $false
    if ($s -eq '') { $danger = $true }
    if ($s -match '^[\s\-?:,\[\]{}#&*!|>''"%@`]') { $danger = $true }
    if ($s -match ':\s') { $danger = $true }
    if ($s -match '\s#') { $danger = $true }
    if ($s -match '^\s' -or $s -match '\s$') { $danger = $true }
    if ($danger) {
        $esc = $s.Replace('\', '\\').Replace('"', '\"')
        return '"' + $esc + '"'
    }
    return $s
}

# 逗号/顿号/分号/空格分隔 → 字符串数组
# 注意 return ,@(...)：不加前置逗号时只有一项会被 PowerShell 拆成裸字符串，
# 后面 $list[0] 就变成取第一个字符（"技术" → "技"）。
function Split-List([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return ,@() }
    $out = @()
    foreach ($piece in ($raw -split '[,，、;；\s]+')) {
        $t = $piece.Trim()
        if ($t -ne '') { $out += $t }
    }
    return ,$out
}

Write-Host ''
Write-Line '========================================' 'Cyan'
Write-Line '  新建文章' 'Cyan'
Write-Line '========================================' 'Cyan'
Write-Host ''

# ---------- 1. 标题 ----------
while ([string]::IsNullOrWhiteSpace($Title)) {
    $Title = Read-Host '文章标题（会同时作为文件夹名和网址最后一段）'
    if ([string]::IsNullOrWhiteSpace($Title)) {
        Write-Line '  标题不能为空，请重新输入。' 'Yellow'
    }
}
$Title = $Title.Trim()

# ---------- 2. 清洗成合法文件夹名 ----------
$slug = $Title
$slug = $slug -replace '\s+', '-'                 # 空白 → 连字符
$slug = $slug -replace '[\\/:*?"<>|]', ''         # Windows 非法字符
$slug = $slug -replace '[\[\]{}#%&]', ''          # URL / glob 里容易出事的符号
$slug = $slug.Trim('.', ' ')                      # 结尾的点和空格
$slug = $slug -replace '-{2,}', '-'               # 压缩连续连字符

if ([string]::IsNullOrWhiteSpace($slug)) {
    Write-Host '标题清洗后是空的（全是非法字符），换个标题吧。' -ForegroundColor Red
    exit 1
}
if ($slug -ne $Title) {
    Write-Line "  标题里的特殊字符已处理，实际用：$slug" 'DarkYellow'
}

$dir  = Join-Path $posts $slug
$file = Join-Path $dir 'index.md'

if (Test-Path $dir) {
    Write-Host ''
    Write-Host "已经有一篇叫「$slug」的文章了：" -ForegroundColor Yellow
    Write-Host "  $file" -ForegroundColor Yellow
    if (-not $NoOpen) {
        $ans = Read-Host '要直接用 VS Code 打开它吗？(Y/n)'
        if ($ans -ne 'n' -and $ans -ne 'N') {
            if (Get-Command code -ErrorAction SilentlyContinue) { & code $file } else { Start-Process $file }
        }
    }
    exit 0
}

# ---------- 3. 标签 / 分类 ----------
if ([string]::IsNullOrWhiteSpace($Tags))       { $Tags = Read-Host '标签，逗号分隔（可留空）' }
if ([string]::IsNullOrWhiteSpace($Categories)) { $Categories = Read-Host '分类，逗号分隔（可留空）' }

$tagList = Split-List $Tags
$catList = Split-List $Categories

# ---------- 4. 时间 ----------
$now = Get-Date
$dateFull = $now.ToString('yyyy-MM-dd HH:mm:ss') + ' +08:00'   # 必须带 +08:00，否则 YAML 会当成 UTC（差 8 小时，凌晨写会跑前一天）
$y = $now.ToString('yyyy'); $m = $now.ToString('MM'); $d = $now.ToString('dd')

# ---------- 5. 拼 frontmatter ----------
$fm = New-Object System.Collections.Generic.List[string]
$fm.Add('---')
$fm.Add('title: ' + (To-Yaml $Title))
$fm.Add('slug: ' + (To-Yaml $slug))
$fm.Add('date: ' + $dateFull)
if ($tagList.Count -gt 0) {
    $fm.Add('tags:')
    foreach ($t in $tagList) { $fm.Add('  - ' + (To-Yaml $t)) }
}
if ($catList.Count -gt 0) {
    $fm.Add('categories:')
    foreach ($c in $catList) { $fm.Add('  - ' + (To-Yaml $c)) }
}
$fm.Add('---')

$body = @(
    ''
    ''
    '正文从这里开始……'
    ''
    '<!--'
    '  小抄：'
    '  - 图片放这个文件夹里，用相对路径：![描述](./图1.png)'
    '  - 公式：行内 $V_\alpha$，独占一行 $$ ... $$'
    '  - 待办：- [ ] 没做   - [x] 做了（/plan/ 和首页便签读的是 To-Do 那篇文章）'
    '  - 封面：frontmatter 里加 cover: ./图1.png'
    '  - 草稿：draft: true（build 时会被排除）'
    '  - 时间：date 已经是北京时间并带 +08:00，改时间也请保留后缀'
    '-->'
    ''
) -join "`n"

$content = ($fm -join "`n") + "`n" + $body

# ---------- 6. 写盘（UTF-8 无 BOM + LF，和 .gitattributes 的 eol=lf 一致）----------
New-Item -ItemType Directory -Path $dir -Force | Out-Null
[System.IO.File]::WriteAllText($file, $content, $utf8NoBom)

# ---------- 7. 汇报 ----------
Write-Host ''
Write-Line '----------------------------------------' 'Green'
Write-Line '  创建成功' 'Green'
Write-Line '----------------------------------------' 'Green'
Write-Line "  文件：$file" 'White'
Write-Line "  网址：http://localhost:4321/$y/$m/$d/$slug/" 'White'
Write-Host ''
Write-Line '  提醒：' 'Cyan'
Write-Line '  - dev server 在跑的话，刷新页面就能看到（不用重启）。' 'Gray'
Write-Line '  - 提交前不需要手动 build：push 之后 GitHub Actions 自动构建部署。' 'Gray'
Write-Line '    git add --all' 'DarkGray'
Write-Line '    git commit -m "新文章"' 'DarkGray'
Write-Line '    git push' 'DarkGray'
Write-Host ''

# ---------- 8. 打开 ----------
if (-not $NoOpen) {
    $ans = Read-Host '现在用 VS Code 打开它吗？(Y/n)'
    if ($ans -ne 'n' -and $ans -ne 'N') {
        if (Get-Command code -ErrorAction SilentlyContinue) { & code $file }
        else { Start-Process $file }
    }
}

exit 0
