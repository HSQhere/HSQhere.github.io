---
title: 痛苦的重刷：jetson到手一定要禁止更新
slug: 痛苦的重刷：jetson到手一定要禁止更新
date: 2026-06-28 19:50:28 +08:00
tags:
  - jetson
  - 更新
  - 刷机
categories:
  - 计算机
cover: ./bootloader检测挂载系统.jpg
---
如果更新之后打不开、黑屏，大概率是不适配版本，你就哭着重刷吧。
### 1. 彻底停用并禁自动更新服务

强行关闭并禁用系统服务和定时器：
```
# 停止并禁用后台定时触发器（卡死后台小动作）
sudo systemctl stop apt-daily.timer apt-daily-upgrade.timer
sudo systemctl disable apt-daily.timer apt-daily-upgrade.timer
```
### 2. 配置 APT 周期为 0（双重锁死）
直接修改 APT 软件源的配置文件，从逻辑上把自动检查、自动下载、自动清理的周期全部归零：
1、打开终端，修改配置文件1。
如果要禁止自动更新配置文件设为如下：
```
sudo tee /etc/apt/apt.conf.d/10periodic <<'EOF'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "0";
EOF
```
如果要打开自动更新配置文件设为如下：
```
APT::Periodic::Update-Package-Lists "2";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "1";
```
2、修改配置文件2，输入：
如果要禁止自动更新配置文件设为如下：
```
sudo tee /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "0";
EOF
```
如果要打开自动更新配置文件设为如下：
```
APT::Periodic::Update-Package-Lists "2";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "0";
APT::Periodic::Unattended-Upgrade "1";
```
### 3. 终极全局锁：利用通配符锁死所有 NVIDIA 核心包（金钟罩）
这是最核心的一步。利用通配符 `*`，把系统里几十个所有带 `nvidia-l4t-` 前缀的底层驱动、内核、固件包**全部打上永久死锁标记**：
```
sudo apt-mark hold nvidia-l4t-*
```
### 💡 锁死之后的日常开发
1. **手动下载/安装规定的包**： 直接用 `sudo apt install <你规定的包>`。**完全正常，没有任何限制，不需要加任何排除项！** 系统会乖乖听从你的即时命令去下载安装。
2. **手动全局更新普通依赖**： 直接敲最简单的 `sudo apt upgrade` 即可。系统在更新时，终端会自动弹出一行黄字提示：`下列软件包被保持在原版本不变：nvidia-l4t-xxxx`。**系统会自动、强制为你排除底层驱动，100% 安全，绝不黑屏！**
3. **未来如何恢复（备忘）**： 如果一年后你主动想要全量升级 Jetson 系统了，只需要两步即可完美还原：
    - 解锁驱动：`sudo apt-mark unhold nvidia-l4t-*`
    - 恢复服务：`sudo systemctl enable --now unattended-upgrades apt-daily.timer`
