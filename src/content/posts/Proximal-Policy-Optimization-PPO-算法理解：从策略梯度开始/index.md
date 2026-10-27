---
title: Proximal Policy Optimization (PPO) 算法理解：从策略梯度开始
slug: Proximal-Policy-Optimization-PPO-算法理解：从策略梯度开始
date: 2026-08-20 21:55:10 +08:00
tags: []
---
## 一、 核心演进流程图 (Algorithm Evolution Pathway)

结合算法演进路线，强化学习从传统的策略梯度逐步演化至 PPO 的完整逻辑链条如下：

```
[传统策略梯度算法 (PG / REINFORCE)]
         │
         │  引入 KL 散度 (衡量概率分布距离，非参数空间欧氏距离)
         ▼
[自然策略梯度算法 (Natural Policy Gradient)]
         │
         │  共轭梯度法 + 线搜索 + 改进检查 (解决高维 FIM 矩阵求逆问题)
         ▼
[信赖域策略优化算法 (TRPO)]
         │
         ├───────────────────────────────┐
         │ 设置目标散度 (自适应 KL 惩罚)  │ 引入 Clip 函数 (一阶截断)
         ▼                               ▼
   [PPO Penalty]                    [PPO Clip] (主流 SOTA)
```

## 二、 演进脉络与关键节点拆解

### 1. 传统策略梯度算法 (Policy Gradient & REINFORCE)

- **核心逻辑**：基于欧氏空间的参数更新，增加带来高回报动作的产生概率：
    
    $$\nabla_\theta J(\theta) = \mathbb{E}_{\pi_\theta} \left[ \nabla_\theta \log \pi_\theta(a_t\vert{}s_t) \cdot A(s_t, a_t) \right]$$
    
- **致命痛点**：参数改变一小步，策略概率分布可能改变一大步（黑洞效应）。一旦策略更新崩盘，收集到的数据变差，模型将再也无法恢复。
    
- **拓展（高方差原因）**：REINFORCE 直接采用全轨迹累积回报 $G_t = \sum_{k=t}^T \gamma^{k-t} r_k$ 代替 $A(s_t, a_t)$，由于环境随机性与长序列乘积累积，导致估计值的方差极高，训练极难收敛。
    

### 2. 自然策略梯度算法 (Natural Policy Gradient, NPG)

- **演进关键（引入 KL 散度）**：不再在参数空间计算距离，而是**引入 KL 散度**来衡量策略分布（概率空间）的实际差异。
    
- **计算瓶颈**：更新方向由 $\Delta \theta = F^{-1} \nabla_\theta J(\theta)$ 决定，其中 $F$ 为**费雪信息矩阵（Fisher Information Matrix, FIM）**：
    
    $$F = \mathbb{E}_{s, a \sim \pi_\theta} \left[ \nabla_\theta \log \pi_\theta(a\vert{}s) \nabla_\theta \log \pi_\theta(a\vert{}s)^T \right]$$
    
    当神经网络参数量巨大（如百万级）时，计算并存储 $N \times N$ 维度的 $F$ 矩阵及其逆矩阵 $F^{-1}$ 的计算量无法承受。
    

### 3. 信赖域策略优化 (TRPO, Trust Region Policy Optimization)

- **演进关键（共轭梯度法 + 线搜索 + 改进检查）**：
    
    - **数学形式**：将问题转化为带约束的优化问题：
        
        $$\max_\theta \mathbb{E}_{\pi_{\theta_{old}}} \left[ \frac{\pi_\theta(a\vert{}s)}{\pi_{\theta_{old}}(a\vert{}s)} A^{\pi_{\theta_{old}}}(s,a) \right] \quad \text{s.t.} \quad \mathbb{E}_{s} \left[ D_{KL}(\pi_{\theta_{old}}(\cdot\vert{}s) \,\vert{}\vert{}\, \pi_\theta(\cdot\vert{}s)) \right] \le \delta$$
        
    - **共轭梯度法 (Conjugate Gradient)**：避免显式计算和储存复杂的 $F^{-1}$ 矩阵，直接近似求解 Hessian 向量积 $F^{-1} g$。
        
    - **线搜索 (Line Search)**：在共轭梯度法算出的更新方向上，按比例缩小步长进行搜索，确保更新后的策略**严格满足 KL 散度约束**。
        
    - **改进检查 (Improvement Check)**：确保每一步更新后的真实代理目标函数值都在增加（单调递增保证）。
        
- **痛点**：计算依然极其繁琐，难以扩展到复杂的深度网络或大规模并行环境（如 Isaac Gym）。
    

### 4. 近端策略优化 (PPO) 的两大分支

为了摆脱 TRPO 繁琐的二次优化过程，OpenAI 提出了两种用一阶优化替代 TRPO 的方案：

#### 分支 A：PPO Penalty（设置目标散度 / Adaptive KL Penalty）

- **演进逻辑**：不把 KL 散度作为硬性约束条件（s.t.），而是将其作为惩罚项（Penalty）直接放入无约束的目标函数中：
    
    $$L^{KLPEN}(\theta) = \hat{\mathbb{E}}_t \left[ \frac{\pi_\theta(a_t\vert{}s_t)}{\pi_{\theta_{old}}(a_t\vert{}s_t)} \hat{A}_t - \beta D_{KL}(\pi_{\theta_{old}}(\cdot\vert{}s_t) \,\vert{}\vert{}\, \pi_\theta(\cdot\vert{}s_t)) \right]$$
    
- **自适应机制**：根据上一轮的实际 KL 散度（平均值 $d = \hat{\mathbb{E}}_t [D_{KL}]$）自动调整惩罚系数 $\beta$：
    
    - 若 $d > d_{target} \times 1.5$：说明更新幅度太大了，增大 $\beta \leftarrow \beta \times 2$（加重惩罚）。
        
    - 若 $d < d_{target} / 1.5$：说明更新太保守了，减小 $\beta \leftarrow \beta / 2$（放松惩罚）。
        

#### 分支 B：PPO Clip（引入 Clip 函数 —— 目前最主流的 SOTA 方案）

- **演进逻辑**：彻底丢弃复杂的 KL 散度计算，直接用 **Clip（截断）函数** 强行限制新旧策略的概率比率 $r_t(\theta)$。
    
- **目标函数**：
    
    $$L^{CLIP}(\theta) = \hat{\mathbb{E}}_t \left[ \min\left( r_t(\theta)\hat{A}_t, \, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_t \right) \right]$$
    
- **优势**：仅需标准的一阶反向传播，代码几行即可实现，运行效率与稳定性远超 PPO-Penalty 和 TRPO。
    

## 三、 完整 PPO 目标函数与训练流程

联合优化目标（Actor-Critic 架构）：

$$\mathcal{L}_{total}(\theta, \phi) = \hat{\mathbb{E}}_t \left[ L_t^{CLIP}(\theta) - c_1 \cdot \underbrace{\left( V_\phi(s_t) - V_t^{target} \right)^2}_{\text{Critic 价值 MSE 损失}} + c_2 \cdot \underbrace{S[\pi_\theta](s_t)}_{\text{策略熵 (鼓励探索)}} \right]$$

- **拓展（Clip 函数三区域详解）**：
    
    - 当 $\hat{A}_t > 0$（好动作）且 $r_t(\theta) > 1+\epsilon$：$\min$ 函数取截断项 $(1+\epsilon)\hat{A}_t$，梯度变为 0，**防止过分奖励该动作**。
        
    - 当 $\hat{A}_t < 0$（坏动作）且 $r_t(\theta) < 1-\epsilon$：$\min$ 函数取截断项 $(1-\epsilon)\hat{A}_t$，梯度变为 0，**防止过分惩罚该动作**。
        
    - 当 $r_t(\theta)$ 在 $[1-\epsilon, 1+\epsilon]$ 区间内：取未截断项 $r_t(\theta)\hat{A}_t$，正常计算一阶梯度更新参数。
        

### 代码运行逻辑 (Algorithm Steps)

1. **采样阶段**：当前策略 $\pi_{\theta_{old}}$ 在环境中采集 $N \times T$ 步轨迹数据。
    
    - **拓展（动作输出形式）**：连续动作空间（如机器人关节力矩）输出高斯分布的均值 $\mu$ 与标准差 $\sigma$；离散动作空间（如按键）输出 Categorical 概率分布。
        
2. **优势估计**：Critic 计算状态价值，利用 **GAE (Generalized Advantage Estimation)** 估算优势值：
    
    $$\hat{A}_t^{GAE} = \sum_{l=0}^{\infty} (\gamma \lambda)^l \delta_{t+l}^V, \quad \text{其中 } \delta_t^V = r_t + \gamma V_\phi(s_{t+1}) - V_\phi(s_t)$$
    
    - **拓展（GAE 超参数物理意义）**：$\lambda = 0$ 时退化为单步 TD 误差（高偏差、低方差）；$\lambda = 1$ 时退化为 Monte-Carlo 累计回报（无偏差、高方差）。常取 $\lambda=0.95$ 权衡两者。
        
3. **Mini-batch 重复优化**：
    
    - 数据打乱后拆分。
        
    - 重复训练 $K$ 个 Epoch：计算比率 $r_t(\theta)$ $\rightarrow$ 应用 Clip 截断 $\rightarrow$ 计算 Loss $\rightarrow$ 梯度更新参数 $\theta, \phi$。
        
4. **参数同步**：令 $\theta_{old} \leftarrow \theta$，进入下一轮采样。
