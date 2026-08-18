# 竞品分析与改进方案

> 基准：v0.9.36。对标产品：Rainmeter（25年开源标杆）、Seelen UI（Tauri 新锐）、
> Dev Home（微软官方）、Widget Launcher（商业级定制）、Windows 11 原生 Widgets。
> 最后更新：2026-08-18

---

## 一、竞品核心优势拆解

### 1. Rainmeter（开源标杆，25 年长青）

| 优势 | 它怎么做 | 我们的现状 |
|------|---------|-----------|
| **极致轻量** | 10 个 skin 仅 ~45MB 内存、<3% CPU（[实测](https://www.reddit.com/r/Rainmeter/comments/g2gdq9/)） | Electron 单窗口 ~120-160MB，CPU 尚可 |
| **skin 生态** | `.rmskin` 一键安装包 + [DeviantArt 千款皮肤](https://www.deviantart.com/rainmeter/gallery/23941137/skins) | 16 个内置 widget，无第三方生态 |
| **布局方案** | Layout 管理器保存/切换多套布局（我们已借鉴 ✅） | v0.9.30+ 已实现（编辑退出弹窗+托盘切换） |
| **性能可调** | 每个 skin 独立 Update 间隔（用户可调刷新率） | 定时器间隔硬编码在代码里 |
| **INI 配置** | 皮肤=纯文本 INI，用户可直接改 | 布局/配置 JSON 混存 |

**它长寿的根源**：模块化插件架构（C++ measure plugin）+ 极致运行时效率 + 社区生态飞轮。

### 2. Seelen UI（Tauri 新锐，GitHub 明星）

| 优势 | 它怎么做 | 我们的现状 |
|------|---------|-----------|
| **现代架构** | Rust + Tauri（webview 复用系统 WebView2，内存远低于 Electron） | Electron 自带 Chromium，内存基线高 |
| **完整桌面环境** | 任务栏替换 + 窗口平铺 + 动态壁纸 + widget 全家桶 | 仅 widget 层 |
| **官方分发** | 官网 + Microsoft Store 双渠道 | 仅 GitHub/本地安装包 |
| **现代 UI 审美** | macOS/Linux 风格（polybar/bspwm 灵感） | 已有蒂芙尼配色+毛玻璃（够用） |

### 3. Dev Home（微软官方）

| 优势 | 值得借鉴的点 |
|------|-------------|
| **Adaptive Cards widget 平台** | widget = 声明式卡片（JSON），第三方可开发——**这就是我们插件系统该走的方向** |
| **系统监视专精** | CPU/GPU/RAM widget 数据源干净 | 我们的 sysmonitor 已对齐（GetSystemTimes） |
| **局限（我们的机会）** | widget 困在 Dashboard 窗口里，**不能贴桌面**——我们恰恰是贴桌面的 |

### 4. Widget Launcher（商业产品）

- 深度视觉定制（背景色/强调色/字体逐项可调）
- 大而全的 widget 库
- 教训：**闭源无生态**，迭代慢于社区

---

## 二、我们的短板（诚实评估）

| # | 短板 | 对标差距 | 严重度 |
|---|------|---------|--------|
| 1 | **内存占用** ~150MB | Rainmeter 45MB / Seelen ~80MB | 🟡 桌面常驻应用用户敏感 |
| 2 | **无第三方生态** | Rainmeter 千款皮肤 | 🔴 长期竞争力核心 |
| 3 | **widget 刷新率不可调** | Rainmeter 每 skin 可调 | 🟡 高频刷新浪费电 |
| 4 | **无正式签名** | 商业产品必备（SmartScreen 拦截） | 🔴 分发信任 |
| 5 | **无自动更新** | 所有商业产品必备 | 🔴 用户停留在旧版 |
| 6 | **单屏一窗口** | 多显示器已支持，但无独立布局编辑器 | 🟢 |
| 7 | **性能细节** | 图标提取虽快但每次切换重复扫描 | 🟡 已修双广播 |

## 三、我们的差异化优势（要守住）

1. **真·桌面层穿透**：卡片可交互 + 空白处点击直达桌面图标（Rainmeter 做不到这么自然）
2. **Win11 25H2 适配**：Show Desktop 检测恢复（RaisedDesktop 模型下社区普遍没解）
3. **中国场景深度**：A股实时、和风天气、中文 RSS 源、B站热搜——海外产品全是空白
4. **一键布局方案**：编辑→命名→托盘秒切，比 Rainmeter 的 Layout 管理器更顺手
5. **治愈系内容**：绿植+天气联动+木鱼+塔罗——情绪价值，竞品没有

---

## 四、改进方案（按 ROI 排序）

### P0（1-2 周内）

1. **widget 刷新率可调**：设置里加"数据刷新频率"档位（省电/标准/迅捷），映射到各定时器倍率。成本 1 天，直接回应内存/CPU 短板。
2. **图标扫描去重**：桌面文件 mtime 哈希未变则跳过重提取（当前每 5 分钟全量）。成本 0.5 天。
3. **安装包签名**：自购证书或 Azure Trusted Signing（~$10/月），解决 SmartScreen 拦截。

### P1（1 个月）

4. **插件系统接通**（Dev Home 的 Adaptive Cards 路线）：
   - widget = JSON 声明（数据源+模板+刷新率）
   - 先把 2-3 个内置 widget 迁移成"声明式"验证格式
   - 打通 plugins/ 目录加载（补 main handler + 沙箱）
5. **electron-updater**：接 GitHub Releases，启动时静默检查更新。
6. **性能档位联动**：`document.hidden` 时（被遮挡）降频到 1/10。

### P2（一个季度）

7. **内存优化**：评估 `v8-compile-cache`、按需加载 widget 脚本（当前全部 upfront）。
8. **widget 市场**：`.ddpkg` 格式（zip+manifest+签名），官网/内置浏览器分发。
9. **Tauri 迁移评估**：如内存是核心瓶颈，WebView2 版本可砍 60%+ 内存（大工程，先验证 P2.7）。

---

## 五、结论

我们不是"低配 Rainmeter"——**赛道不同**：Rainmeter 是极客定制工具，我们是**开箱即用的中文桌面信息+治愈看板**。核心短板（生态/签名/更新）都有成熟解法，差异化优势（穿透+中国数据源+情绪价值）难以被快速复制。先把 P0 三件事做掉，产品就能达到"可分发给别人用"的及格线。
