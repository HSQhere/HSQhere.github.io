---
title: Jetson NX (JetPack 6) 部署 ROS2 Humble 踩坑与实战
slug: Jetson-NX-JetPack-6-部署-ROS2-Humble-踩坑与实战
date: 2026-06-28 12:43:29
tags:
  - jetson
  - docker
  - ros2
  - GPU
categories:
  - 计算机
cover: ./docker上的ros2网页vnc.png
---
## 一、 安装 Docker

JetPack 6 默认通常已预装 Docker，但在开始前建议确保环境最新并配置免 `sudo` 权限：
1. **更新软件源并补充安装 Docker 基础组件**：
    ```
    sudo apt update && sudo apt install -y docker.io
    ```
2. **设置开机自启并立即启动**：
    ```
    sudo systemctl enable --now docker
    ```
3. **将当前用户加入 docker 用户组（避免每次都敲 `sudo`）**：
    ```
    sudo usermod -aG docker $USER
    ```
    > ⚠️ **注意**：执行完此命令后，必须**重启系统**或**注销当前用户重新登录**，组权限才会生效。
4. **验证当前状态**：
    ```
    docker info | grep -i runtime
    ```
    _预期输出_：此时在输出中应该只能看到 Linux 原生的 `runc` 运行时。
## 二、 避坑：JetPack 6 的 NVIDIA Runtime 配置策略
💡 **硬核原理补充（为什么不配置 `--runtime=nvidia`？）**
在旧的 JetPack 5 时代，官方要求在 `/etc/docker/daemon.json` 中注册 `"nvidia"` 运行时，并在启动时添加 `--runtime nvidia` 参数。
但在 **JetPack 6 (L4T R36.x)** 架构中，英伟达最新的通用厚镜像（如 `dustynv/ros:humble-desktop-l4t-r36.4.0`）内部已经集成了显卡驱动和 Vulkan 图形加速文件。
如果在 JetPack 6 上强行注册并调用 `--runtime nvidia`，宿主机会触发挂载钩子去覆盖容器内的同名文件，从而引爆底层死锁冲突（报错：`failed to remove existing file: .../nvidia_icd.json: device or resource busy`）导致**容器闪退**。
在 JetPack 6 (L4T R36.x) 中，为了彻底避免驱动冲突，且不使用传统手动映射设备节点的方式。
- **核心方案**：在 Docker 启动参数中显式指定 `--runtime=nvidia`，并利用环境变量 `-e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` 赋予容器显卡访问权限。
- **优势**：此方法通过 NVIDIA 官方运行时调用硬件通道，完美兼顾 GPU 加速与图形化界面（Rviz2），且绝不会引发 `device or resource busy` 死锁。
## 三、 配置国内镜像加速
由于国内直连 Docker Hub 经常超时，编辑（或创建）`/etc/docker/daemon.json`，配置最新的通用高速镜像加速源：
```
sudo tee /etc/docker/daemon.json <<'EOF'
{
    "runtimes": {
        "nvidia": {
            "args": [],
            "path": "nvidia-container-runtime"
        }
    },
    "registry-mirrors": [
        "https://docker.1ms.run",
        "https://docker.xuanyuan.me",
        "https://docker.skk.moe"
    ]    
}
EOF
```
重启 Docker 引擎使加速器和纯净运行时生效：
```
sudo systemctl restart docker
```
> 📌 **注意**：国内镜像加速器的可用性经常变化。如果上述地址失效，可搜索 "Docker 国内镜像加速 " 获取最新可用地址替换即可。
## 四、 确认系统 L4T 版本
在拉取镜像前，必须确认你的 Jetson NX 宿主机系统确实是 JetPack 6 系列（R36.x）：
```
cat /etc/nv_tegra_release
```
_预期输出示例_：`# R36 (release), REVISION: 4.0, ...`（代表当前为 L4T R36.4.0，必须匹配 r36 的镜像标签）。
也可以通过以下命令交叉确认：
```
dpkg -l | grep nvidia-l4t-core
```
## 五、 拉取 ROS 2 Humble 专属镜像
1. GPU 显卡加速版镜像（英伟达官方 Dusty 维护）
英伟达官方核心开发者 Dusty Franklin 维护了专为 Jetson 优化的镜像仓库。由于我们的系统是 JetPack 6，必须选择带 `r36.x` 标签的全新镜像。
```
# 完整桌面版（包含 rviz2、rqt、Gazebo 以及已调优的 GPU 版 PyTorch，体积约 13.9GB）
docker pull dustynv/ros:humble-desktop-l4t-r36.4.0

# 基础版（仅含底层核心组件，无 GUI，体积较小）
docker pull dustynv/ros:humble-ros-base-l4t-r36.4.0
```
2. CPU 通用网页 VNC 版镜像（开源社区 Tiryoh 维护）
```
# 自带无头浏览器桌面与 VNC 服务，不需要任何显卡配置，体积适中
docker pull tiryoh/ros2-desktop-vnc:humble
```
💾 **存储提醒**：JetPack 6 的 Desktop 镜像非常庞大，解压后会吞掉 20GB+ 的磁盘空间。请确保你的 Jetson NX 系统已经迁移到外部 NVMe 固态硬盘上。如果根分区在自带的 eMMC（通常只有 16GB）上，极易因空间不足卡死。
## 六、 启动容器（核心实战脚本）
### 6.1 【版本 A】NVIDIA GPU 显卡加速本地版启动脚本：
在本地创建工作空间：`mkdir -p ~/hsq_ws/ros2_humble_ws`，然后编写并运行以下自动化脚本：
```
#!/bin/bash

# 1. 允许容器向宿主机的 X11 窗口服务器请求弹窗画面的权限
xhost +local:root

# 2. 清理可能卡在后台的同名旧容器躯壳（一般不用可能会删除额外安装的包）
# docker rm -f ros2_humble 2>/dev/null

# 3. 运行新容器（普通 runc 模式 + Tegra 集成显卡内核直挂通道）
docker run -it \
	--name ros2_humble \
	--network=host \
	--privileged \
	--runtime=nvidia \
	-e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video \
    -v /dev:/dev \
	-v /home/jetson/hsq_ws/ros2_humble_ws:/workspace/ros2_humble_ws \
	-v /tmp/.X11-unix:/tmp/.X11-unix \
	-v /tmp/:/tmp/ \
	-v /etc/timezone:/etc/timezone \
	-v /etc/localtime:/etc/localtime \
	-e DISPLAY=unix$DISPLAY \
	-e ROS_DOMAIN_ID=0 \
	-e GDK_SCALE \
	-e GDK_DPI_SCALE \
	dustynv/ros:humble-desktop-l4t-r36.4.0 \
	/bin/bash

# 4. 当用户输入 exit 正常退出容器后，安全关闭图形权限
xhost -local:root
```
### 6.2 【版本 B】CPU 通用网页 VNC 独立版启动脚本：
同样的挂载目录下，编写适用于 CPU/远程 场景的自动化脚本：
```
#!/bin/bash

# 1. 打开图形权限（向下兼容）
xhost +local:root

# 2. 清理可能残留在后台的同名旧容器躯壳
# docker rm -f jetson_ros2_humble 2>/dev/null

# 3. 运行新容器（核心在于端口映射 -p 6080:80，退出时自动通过 --rm 销毁临时层）
docker run -it \
  --name ros2_humble \
  --privileged \
  --security-opt seccomp=unconfined \
  -p 6080:80 \
  -v /home/jetson/hsq_ws/ros2_humble_ws:/workspace/ros2_humble_ws \
  tiryoh/ros2-desktop-vnc:humble

# 4. 退出后关闭权限
xhost -local:root
```
容器成功运行后，在 Jetson 本机或局域网电脑的浏览器中输入： 👉 `http://localhost:6080` （或 `http://<Jetson的IP地址>:6080`） 即可在浏览器里看到一个完整的 Linux 桌面，在里面的终端可以直接输入 `rviz2` 打开图形界面，且绝对不会和宿主机的显卡驱动发生任何冲突。
### 6.3 启动参数在 JetPack 6 下的深度演进与详解

| **参数 / 配置**                                           | **作用与深度演进**                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`-it`**                                             | `-i`（保持标准输入打开）+ `-t`（分配伪终端），两者合用才能在容器内正常交互。`-itd`后端隐藏运行。                                                  |
| **`--name ros2_humble`**                              | 给容器命名，便于后续通过名称管理。不加则 Docker 会随机生成无规则名称。                                                                   |
| **`--network=host`**                                  | 容器直接使用宿主机网络栈，不做网络隔离。ROS 2 的 DDS 通信依赖组播发现机制，必须使用 host 网络，否则多节点之间无法互相发现。                                    |
| **`--privileged`**                                    | 赋予容器几乎所有内核权限，允许访问宿主机硬件设备。访问嵌入式板载传感器时必须开启。                                                                 |
| `--runtime=nvidia`                                    | 指定使用 NVIDIA 的容器运行时，这是 JetPack 6 环境下的关键配置，确保容器能够正确调用 NVIDIA GPU 的驱动程序。                                     |
| `-e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` | 明确容器具备的 GPU 功能。`compute` 用于 CUDA 加速，`utility` 用于辅助工具，`video` 用于视频编解码（NVDEC/NVENC），如果不加此项，容器可能无法调用 GPU。    |
| **`-v /dev:/dev`**                                    | 将宿主机 `/dev` 挂载到容器内，使容器能访问串口（如 TTL、USB 转串口）、USB 摄像头（`/dev/video*`）、IMU、激光雷达等硬件设备。                          |
| **`-v ~/hsq_ws/...:/workspace/...`**                  | **磁盘卷挂载（极为关键）**。建立了物理映射通道。你在容器该目录下编写的任何源码，**全部直接保存在物理固态硬盘上**。即使执行 `docker rm` 销毁容器临时沙盒，你的核心源码雷打不动，数据永远安全。 |
| **`-v /tmp/.X11-unix:/tmp/.X11-unix`**                | 挂载 X11 的 Unix socket，让容器内的 GUI 程序（rviz2、rqt 等）能通过宿主机的 X Server 显示窗口。                                      |
| `-v /tmp/:/tmp/`                                      | 将宿主机临时目录挂载到容器，通常用于共享临时的进程通信文件。                                                                            |
| `-v /etc/timezone` / `-v /etc/localtime`              | 同步宿主机的时间和时区设置，确保容器内日志的时间戳与系统完全一致。                                                                         |
| `-e DISPLAY=unix$DISPLAY`                             | 传递显示环境变量，告诉 GUI 程序往哪个显示器输出。                                                                               |
| `-e ROS_DOMAIN_ID=0`                                  | 设置 ROS 2 的 Domain ID，相同 ID 的节点才能互相发现。默认为 0，多套 ROS 2 系统共存时用不同数字隔离。                                         |
| `-e GDK_SCALE` / `-e GDK_DPI_SCALE`                   | 这两个环境变量通常用于配置 GUI 程序的界面缩放比例，解决在不同分辨率屏幕下 Rviz2 字体过小或过大的显示适配问题。                                             |

### 6.3 验证环境
当你成功进入容器，终端前缀变为 `root@hsq:/#` 后，执行以下测试：
1. **验证图形化与显卡性能**：输入 `rviz2`，宿主机桌面上会立刻秒弹科幻的 Rviz2 蓝色网格大窗，代表图形通路完美畅通。
2. **验证 GPU 加速是否到位**：
    ```
    nvcc --version
    ```
    _预期输出_：`CUDA版本`，代表显卡深度学习与 AI 视觉加速完全就绪。
    ```
    python3 -c "import cv2; print(cv2.cuda.getCudaEnabledDeviceCount())"
    ```
    如果这个命令返回 **`1`**（或者大于0的数字），恭喜你：你的 OpenCV 已经完美集成了 GPU 加速。
3. **验证 ROS 2 通信基础**：
    ```
    ros2 topic list
    ```
    _预期输出_：能够识别出 `/parameter_events` 与 `/rosout`，即表示环境完全就绪。
## 七、 日常高频操作与高级生命周期管理
### 7.1 默认退出行为
在容器终端中输入 `exit` 或按 `Ctrl + D`。由于创建时没有加 `--rm`，容器退出后不会被物理删除，只是停止运行并释放内存。下次重新运行你的 `run_ros2.sh` 脚本时，它会自动清理（`rm`）上一次留下的旧躯壳并为你生成一个全新的、干净的运行环境，由于工作空间已挂载，代码绝不会丢失。
### 7.2 环境注入，解决多窗口 `command not found`
当容器已经在运行，你想开第二个终端窗口进入同一个容器协同开发：
```
docker exec -it ros2_humble /bin/bash
```
为了防止新窗口找不到 `ros2` 命令，**在第一次进入容器时，强烈建议直接执行以下命令，将环境变量永久注入容器的配置：**
```
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc #系统环境
echo "source /opt/ros/humble/install/setup.bash" >> ~/.bashrc #镜像自带环境
source ~/.bashrc #刷新环境
```
**colcon build 之后需要 `source /workspace/ros2_humble_ws/install/local_setup.bash # 仅在当前终端生效 ` `echo " source /workspace/ros2_humble_ws/install/local_setup.bash" >> ~/.bashrc # 所有终端均生效`**
### 7.3 玩法 A：常驻系统流（不关闭/不销毁容器，保留临时软件）
如果你除了编写代码，还在容器内部通过 `apt-get install` 安装了临时的调试工具或第三方依赖库，且**不希望每次启动都被脚本 `rm` 清理掉**，你应该放弃每次运行 `run_ros2.sh` 脚本，改为以下两步复用旧容器：
1. **退出容器时**：直接输入 `exit` 或 `Ctrl + D`。此时容器进入休眠（Exited 状态），即使宿主机关机重启，内部增删的软件也不会丢失。
2. **下次开机重新进入时**：在 Jetson 本地终端直接敲击：
    ```
    # 1. 重新唤醒睡着的旧容器
    docker start ros2_humble
    # 2. 重新连接进该容器的命令行
    docker exec -it ros2_humble /bin/bash
    ```
### 7.4 玩法 B：镜像打包存档流（使用 `commit` 永久固化环境）
如果你在容器里配置了极为复杂的底层环境，为了防止误操作、误删容器导致心血白费，可以在**容器运行状态下**，利用 **Commit 机制** 将临时沙盒直接固化铸造成一个永久本地静态镜像。
- **操作步骤**：
    1. 保持当前容器运行，在 Jetson 本地桌面上**新开一个宿主机终端**。
    2. 输入以下命令进行打包（将运行中的 `ros2_humble` 固化为本地新镜像 `my_ros2_humble:v1.0`）：
        ```
        docker commit ros2_humble my_ros2_humble:v1.0
        ```
    3. _后续复用_：打包成功后，你就可以放心地使用脚本清理旧容器了。只需将启动脚本（6.1节）最后一行的镜像名 `dustynv/ros:...` 替换为你打包的 `my_ros2_humble:v1.0`，未来每次开辟出的新环境都将直接自带你固化的所有软件。
## 八、 常见问题及排雷利器 (FAQ)
- **Q1: 容器启动或运行 GUI 程序报错：`cannot open display`**
    - **A**：这是 X11 权限关闭导致的。在宿主机终端（不是容器内）执行 `xhost +local:root`。如果需要开机自动生效，可将此命令加入宿主机的 `~/.bashrc`。
- **Q2: 接入新的 USB 激光雷达或摄像头，但在容器里找不到 `/dev/ttyUSB0` 或 `/dev/video0`**
    - **A**：Linux 设备的挂载在容器启动的瞬间就固定了。如果是中途新插拔的物理硬件，必须输入 `exit` 退出容器，再重新运行一次脚本或执行 `docker start` 即可重新刷入最新的硬件树。
- **Q3: ROS 2 多节点之间无法通信，互相找不到**
    - **A**：首先检查启动时是否使用了 `--network=host` 共享宿主机网络栈。其次确认所有节点在容器内外的 `ROS_DOMAIN_ID` 环境变量数值保持完全一致。
- **Q4: 拉取镜像速度很慢、经常卡死断流或超时**
    - **A**：确认已配置国内镜像加速（见第三节）。如果 Jetson 硬件网络断流卡在最后两个 Layer，不要轻易 prune，直接按下 `Ctrl + C` 强行掐断并再次输入 `docker pull`只有多试几次。
- **Q5: 频繁开发或拉取镜像导致系统磁盘满了，如何安全清理？**
    - **A**：⚠️ **警告**：千万不要直接手动去删除 `/var/lib/docker` 目录。使用以下标准安全命令，可以安全地一键清理已经停止的无用容器躯壳、未打标签的碎片悬空镜像层（Dangling layers），释放被压榨的系统盘空间：`docker system prune -f`
- **Q6: ROS GPG 签名过期**：执行 `sudo apt-key del F42ED6FBAB17C654` 后重新拉取 `curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg`。
- **Q7: ROS gazebo 官方源只有amd版本没有arm**：极其不推荐在arm上装，可能少包，没用。
```
# 1. 先安装允许添加 PPA 的基础工具 
sudo apt update && sudo apt install -y software-properties-common 
# 2. 添加这个针对非 amd64 架构的 Gazebo11 仓库 
sudo add-apt-repository ppa:openrobotics/gazebo11-non-amd64 -y
# 3. 更新源并尝试安装 gazebo 及其开发依赖 
sudo apt update 
sudo apt install ros-humble-gazebo-*
```
## 附录
**常用命令：**
### 1. 容器生命周期管理 (管理运行状态)
- **唤醒容器**：`docker start ros2_humble
- **进入正在运行的容器 (多窗口协作)**： `docker exec -it ros2_humble /bin/bash`
- **停止容器**： `docker stop ros2_humble`
- **删除容器 (彻底重置环境)**： `docker rm -f ros2_humble`
### 2. 磁盘与资源清理 (高频避坑)
- **查看所有容器状态**： `docker ps -a`
- **安全清理无用资源**： `docker system prune -f`
- **深度清理**： `docker system prune -a`
### 3. 环境与镜像固化 (进阶开发)
- **固化当前环境为镜像**： `docker commit ros2_humble my_ros2_humble:v1.0`
- **查看本地镜像列表**： `docker images`
- **手动拉取镜像**： `docker pull dustynv/ros:humble-desktop-l4t-r36.4.0`

兼顾**启动**，实现了容器的**复用**与**持续化管理**的脚本：
``` sh
#!/bin/bash

# 1. Grant container permission to access host's X11 display server for GUI apps (Rviz2/Gazebo)
xhost +local:root

CONTAINER_NAME="ros2_humble"
IMAGE_NAME="dustynv/ros:humble-desktop-l4t-r36.4.0"

# 2. Lifecycle Management: Check container status to preserve installed packages and dependencies
if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
    # Case A: Container is already running in the background, open a new terminal session into it
    echo "[INFO] Container '${CONTAINER_NAME}' is already running. Joining the active session..."
    docker exec -it ${CONTAINER_NAME} /bin/bash -c "
	    source /opt/ros/humble/setup.bash
    	source /opt/ros/humble/install/setup.bash
    	if [ -f /workspace/ros2_humble_ws/install/local_setup.bash ]; then
        	source /workspace/ros2_humble_ws/install/local_setup.bash
    	fi
    	cd /workspace/ros2_humble_ws
    	exec /bin/bash
    "

elif [ "$(docker ps -aq -f name=^/${CONTAINER_NAME}$)" ]; then
    # Case B: Container exists but is stopped (exited). Wake it up without losing any manual updates
    echo "[INFO] Found stopped container '${CONTAINER_NAME}'. Reviving your development environment..."
    docker start ${CONTAINER_NAME}
    docker exec -it ${CONTAINER_NAME} /bin/bash -c "
	    source /opt/ros/humble/setup.bash
    	source /opt/ros/humble/install/setup.bash
    	if [ -f /workspace/ros2_humble_ws/install/local_setup.bash ]; then
        	source /workspace/ros2_humble_ws/install/local_setup.bash
    	fi
    	cd /workspace/ros2_humble_ws
    	exec /bin/bash
    "

else
    # Case C: Container does not exist. Initialize a new one with native runc and Tegra GPU direct pass-through
    echo "[INFO] No existing container found. Initializing a fresh ROS 2 environment..."
    	docker run -it \
		--name ${CONTAINER_NAME} \
		--network=host \
		--privileged \
		--runtime=nvidia \
		-e NVIDIA_DRIVER_CAPABILITIES=compute,utility,video \
    		-v /dev:/dev \
	    	-v /home/jetson/hsq_ws/ros2_humble_ws:/workspace/ros2_humble_ws \
	    	-v /tmp/.X11-unix:/tmp/.X11-unix \
		-v /tmp/:/tmp/ \
		-v /etc/timezone:/etc/timezone \
		-v /etc/localtime:/etc/localtime \
	    	-e DISPLAY=unix$DISPLAY \
	    	-e ROS_DOMAIN_ID=0 \
		-e GDK_SCALE \
		-e GDK_DPI_SCALE \
		${IMAGE_NAME} \
		/bin/bash
fi

# 3. Safely revoke X11 display permissions upon exiting the interactive session
xhost -local:root
```
