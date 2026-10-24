---
title: HSV圆形轮廓检测
slug: HSV圆形轮廓检测
date: 2026-04-29 15:44:09
tags: [日记,视觉,cv,掩膜,Hough圆]
categories: [计算机]
cover: ./hough圆检测.png
---
Before we transition to the HSV color space, it is crucial to establish a solid foundation within the RGB model.
1. **颜色极化 (Color Polarization)**：
    - 不使用常规灰度化，而是利用色差公式提取特定颜色：
        - **红色增强图**：$r = \max(0, 2R - B - G)$
        - **绿色增强图**：$g = \max(0, 2G - R - B)$
        - **蓝色增强图**：$b = \max(0, 2B - G - R)$
    - **目的**：极大化目标颜色与背景的对比度，消除杂色干扰。
2. **双重降噪 (Two-stage Blurring)**：
    - **中值滤波** (`medianBlur`)：去除椒盐噪声（孤立的噪点）。
    - **高斯滤波** (`GaussianBlur`)：平滑边缘，防止霍夫变换对细小纹理产生误报。
3. **霍夫圆检测 (Hough Circle Transform)**：
    - 在极化后的单色图中寻找几何圆。
    - 通过 `param2`（累加器阈值）控制检测的严苛程度。
4. **分色标记 (Color-coded Labeling)**：
    - 根据检测来源图的不同，使用对应的 `colorset`（红/绿/蓝）在原始彩色帧上绘制圆圈和圆心。
**Hough Circle Transform:**
```python
def hough_circle(frame, gray, color):  
    img = cv2.medianBlur(gray, 3)  # 中值滤波  
    img = cv2.GaussianBlur(img, (17, 19), 0)  # 高斯滤波  
    try:  # try语法保证在找到圆的前提下才进行绘制  
        circles = cv2.HoughCircles(img, cv2.HOUGH_GRADIENT, 1, 200, param1=100, param2=50,  
                                       minRadius=50, maxRadius=360)  
        circles = np.uint16(np.around(circles))  # 取整  
    except:  
        pass  
    else:  
        for k in circles[0, :]:  
            # 描绘圆形  
            cv2.circle(frame, (k[0], k[1]), k[2], colorset[color], 2)  
            # 描绘圆心  
            cv2.circle(frame, (k[0], k[1]), 2, colorset[color], 3)
```
**Color Polarization:**
```python
b_, g_, r_ = cv2.split(frame)  
r_ = np.int16(r_)  
b_ = np.int16(b_)  
g_ = np.int16(g_)  
r = r_ + r_ - b_ - g_  
g = g_ + g_ - r_ - b_  
b = b_ + b_ - g_ - r_  
r = (r + abs(r)) / 2  
b = (b + abs(b)) / 2  
g = (g + abs(g)) / 2  
r = np.uint8(r)  
g = np.uint8(g)  
b = np.uint8(b)
```

OK ! That sounds great. you finish the basic knowledge absording, and the next is HSV lessons. Awesome!
#### **第一阶段：图像预处理 (Image Preprocessing)**
- **高斯模糊 (Gaussian Blur)**：减少图像中的电子噪声和纹理干扰。
- **空间转换 (Color Space Conversion)**：将图像从 **BGR**（对光照敏感）转换为 **HSV**（色调、饱和度、亮度）。
    - _原因_：在 HSV 空间中，颜色（Hue）是一个独立的维度，更容易通过设定阈值来锁定特定颜色。
#### **第二阶段：掩膜生成与优化 (Masking & Morphological Ops)**
- **阈值分割 (Thresholding)**：利用 `cv2.inRange` 生成二值掩膜（Mask）。目标颜色变为纯白（255），其余区域变为纯黑（0）。
- **红色特殊处理**：由于红色在 HSV 圆环中跨越了 $0^{\circ}$ 度，所以程序分别提取了低角度和高角度的红色区域并进行了合并。
- **形态学操作 (Morphology)**：
    - **开运算 (Open)**：先腐蚀后膨胀，用于去除背景中的细小白色噪点。
    - **闭运算 (Close)**：先膨胀后腐蚀，用于填补目标内部的小黑洞，使圆环更完整。
#### **第三阶段：几何检测 (Circle Detection)**
- **霍夫圆变换 (Hough Circle Transform)**：
    - 这是算法的核心。它在掩膜图上寻找符合特定半径范围（`160-180` 像素）的圆形。
    - `dp=1` 表示累加器分辨率，`minDist=200` 确保不会在同一个目标上重复检测多个圆。
#### **第四阶段：结果绘制 (Visualization)**
- **坐标转换**：将检测到的圆心 $(x, y)$ 和半径 $r$ 转换为整数。
- **动态标注文案**：计算标签位置（`label_y`），确保文字始终显示在圆环上方，并做边界检查防止文字溢出屏幕。
```python
def get_color_mask(hsv_frame, config):  
    """根据HSV配置生成掩膜"""  
    h = config["hsv"]  
    if config["name"] == "red":  
        mask1 = cv2.inRange(hsv_frame, np.array(h[0]), np.array(h[1]))  
        mask2 = cv2.inRange(hsv_frame, np.array(h[2]), np.array(h[3]))  
        return mask1 + mask2  
    return cv2.inRange(hsv_frame, np.array(h[0]), np.array(h[1]))
    
def clean_mask(mask):  
    """形态学降噪"""  
    kernel = np.ones((5, 5), np.uint8)  
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)  
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
 
def detect_and_draw(mask, frame, config):  
    """检测圆环并绘制结果"""  
    blurred = cv2.medianBlur(cv2.GaussianBlur(mask, (9, 9), 2.2), 5)  
  
    circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, **HOUGH_PARAMS)  
  
    if circles is not None:  
        for i in np.uint16(np.around(circles[0, :])):  
            cx, cy, r = map(int, i)  
            # 绘制圆  
            cv2.circle(frame, (cx, cy), r, config["bgr"], 3)  
            cv2.circle(frame, (cx, cy), 3, config["bgr"], -1)  
            # 标签位置计算  
            lx, ly = max(10, cx - 20), max(25, cy - r - 15)  
            cv2.putText(frame, config["name"], (lx, ly), cv2.FONT_HERSHEY_SIMPLEX, 0

# --- 参数配置区 ---COLOR_CONFIG = [  
    {"name": "blue", "bgr": (255, 0, 0), "hsv": [(100, 43, 46), (124, 255, 255)]},  
    {"name": "green", "bgr": (0, 255, 0), "hsv": [(35, 43, 46), (77, 255, 255)]},  
    {"name": "red", "bgr": (0, 0, 255), "hsv": [(0, 120, 30), (20, 255, 255), (150, 120, 30), (179, 255, 255)]}  
]  
  
HOUGH_PARAMS = {  
    "dp": 1, "minDist": 200, "param1": 100, "param2": 50, "minRadius": 160, "maxRadius": 180  
}
```
