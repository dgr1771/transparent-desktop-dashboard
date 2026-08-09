# 透明桌面信息看板（Transparent Desktop Dashboard）

一个基于 Electron 的**跨平台**桌面常驻信息看板。全屏透明、鼠标穿透（像透明壁纸），把 AI 新闻、A 股走势、实时天气、待办事项、时钟、倒数日、热搜以玻璃拟态卡片的形式展示在桌面上。支持 **Windows / macOS / Linux** 三平台。

## ✨ 特性

- 🪟 **透明壁纸级展示** — 全屏透明，不遮挡桌面，背景就是你的壁纸
- 🖱️ **区域穿透** — 默认模式：鼠标在空白处穿透到桌面，在卡片上直接可交互（输入/滚动/点击），无需切换模式
- 📌 **贴桌面层（不遮挡应用）** — 默认贴在桌面层，**会被其他应用窗口正常盖住**（像真正的壁纸）；进入编辑模式时才临时浮到最上层方便拖拽
- 🧩 **模块化卡片** — 时钟 / 天气 / A 股 / 新闻 / 倒数日 / 热搜 / 待办，每个卡片可独立拖动、缩放、显隐
- 📐 **智能自动排列** — 根据屏幕尺寸自动两列分区布局，也可手动拖拽微调
- 🔌 **真实数据源** — A 股（新浪财经）、新闻（RSS）、热搜（头条热榜）开箱即用
- 🍎 **跨平台** — Windows / macOS / Linux 三平台适配（见下方说明）

## 📦 功能模块

| 模块 | 数据源 | 是否需要 Key | 更新频率 |
|---|---|---|---|
| 🕐 时钟 | 本地系统 | 否 | 每秒 |
| 🌤️ 天气 | 和风天气 | **是**（免费申请） | 每 30 分钟 |

> 天气城市支持**自动 IP 定位**（首次启动自动获取当前位置），也可在设置中手动指定。
| 📈 A 股 | 新浪财经 | 否 | 每 10 秒 |
| 📰 新闻 | RSS 聚合（36氪/机器之心/TechCrunch/The Verge） | 否 | 每 15 分钟 |
| ✅ 待办 | 本地存储 | 否 | 实时 |

## 🚀 快速开始

### 环境要求
- Node.js 16+
- Windows 10/11

### 安装与运行
```bash
cd transparent-desktop-dashboard
npm install
npm start
```

开发模式（带 DevTools）：
```bash
npm run dev
```

## 🎮 使用方法

### 切换模式
| 操作 | 作用 |
|---|---|
| `Ctrl+Shift+D` | 切换"穿透模式 ↔ 编辑模式" |
| `Ctrl+Shift+H` | 隐藏 / 显示整个看板 |

- **穿透模式（默认）**：看板像透明壁纸，鼠标点击会穿透到桌面，完全不影响日常使用。
- **编辑模式**：卡片边框高亮（蓝色），顶部出现拖动手柄条（⠿ + 卡片名），此时可以：
  - **拖动卡片顶部手柄条**调整位置（手柄上会显示 `⠿` 图标和卡片名）
  - **拖动卡片右下角手柄**调整大小
  - 在待办输入框输入内容
  - 滚动新闻/股票列表
- 退出编辑模式后，位置和大小会**自动保存**，重启后保留。

### 系统托盘
右键托盘图标可：切换编辑模式、刷新数据、打开设置、退出。

### 配置数据源
托盘菜单 → **设置...**

- **天气**：填入城市名 + 和风天气 API Key（[免费申请](https://dev.qweather.com/)）
- **A 股**：填入自选股代码，逗号分隔（如 `sh000001,sh600519,sz000001`）。沪市 `sh` 开头，深市 `sz` 开头
- **新闻**：可增删 RSS 源，默认已配好 4 个主流源
- **透明度**：滑动调节整体看板透明度

## 📁 项目结构

```
transparent-desktop-dashboard/
├── package.json
├── src/
│   ├── main/
│   │   ├── index.js           # 主进程：窗口、穿透、托盘、快捷键
│   │   ├── config-store.js    # 配置文件持久化（config.json）
│   │   └── data.js            # 数据获取（天气/A股/RSS，绕过 CORS）
│   ├── preload/
│   │   └── preload.js         # 安全暴露 API（contextBridge）
│   └── renderer/
│       ├── index.html         # 主界面
│       ├── settings.html      # 设置界面
│       ├── styles/
│       │   ├── main.css       # 全局样式
│       │   └── widgets.css    # 卡片样式
│       └── scripts/
│           ├── app.js         # 主逻辑
│           ├── settings.js    # 设置逻辑
│           ├── lib/
│           │   ├── store.js   # 配置读写
│           │   └── drag-resize.js  # 拖拽缩放
│           └── widgets/
│               ├── clock.js
│               ├── weather.js
│               ├── stock.js
│               ├── news.js
│               └── todo.js
└── README.md
```

## 🔧 技术要点

### 透明 + 鼠标穿透 + 桌面层级
- 窗口属性：`transparent: true` + `frame: false` + `skipTaskbar: true`
- **层级控制（关键）**：
  - 穿透模式（默认）：`alwaysOnTop: false` → 贴桌面层，**被其他应用窗口正常盖住**（壁纸感）
  - 编辑模式：`setAlwaysOnTop(true, 'screen-saver')` → 临时浮到最上层，方便拖拽
- 穿透切换：`win.setIgnoreMouseEvents(true, { forward: true })`
  - `forward: true` 让鼠标移动事件仍可转发给窗口（保留 hover 能力）

### 数据获取绕过 CORS
- 网络请求全部在**主进程**（Node 环境）执行，无跨域限制
- 通过 `ipcMain.handle` + `ipcRenderer.invoke` 传回渲染进程

### 配置持久化
- 存储位置：`%APPDATA%/transparent-desktop-dashboard/config.json`
- 包含布局、待办、设置（天气 Key、股票代码、RSS 源、透明度）

## 📝 说明

- **A 股颜色惯例**：涨红跌绿（与 A 股市场一致，区别于美股）
- **天气未配置 Key 时**：卡片显示提示信息，不影响其他模块
- **数据源频率限制**：免费 API 有调用次数限制，本应用已设合理的刷新间隔（A股10s、天气30min、新闻15min）

## 📜 License

MIT

## 🌍 跨平台支持

本项目已适配 Windows / macOS / Linux 三平台。平台差异集中在 `src/main/platform.js` 统一处理。

### 各平台体验对比

| 特性 | Windows | macOS | Linux |
|---|---|---|---|
| 透明窗口 | ✅ | ✅ | ✅ |
| 区域穿透（卡片可点、空白穿透） | ✅ 完美 | ✅ 需禁用硬件加速 | ⚠️ 不支持（降级为整窗可交互） |
| 玻璃拟态模糊 | ✅ CSS backdrop-filter | ✅ 原生 vibrancy（更佳） | ⚠️ 部分桌面不支持，降级半透明 |
| 贴桌面层（被应用盖住） | ✅ | ✅ 始终置顶 | ✅ 始终置顶 |
| 全局快捷键 | ✅ | ⚠️ 需辅助功能权限 | ✅ |
| 托盘图标 | ✅ | ✅ | ⚠️ 部分桌面需装插件 |

### macOS 注意事项
- 首次运行需在 **系统设置 → 隐私与安全 → 辅助功能** 中授权应用（全局快捷键需要）
- 透明穿透通过 `app.disableHardwareAcceleration()` 实现（社区 2025 年验证的方案）
- 毛玻璃效果使用 macOS 原生 `vibrancy`，比 CSS 方案更通透

### Linux 注意事项
- **鼠标穿透不支持**：Electron 官方 Issue [#1335](https://github.com/electron/electron/issues/1335) 跟踪 8 年未解决。Linux 下降级为**整窗可交互**模式（用快捷键显隐）
- Wayland 用户需加 `--ozone-platform-hint=wayland` 参数
- GNOME 桌面需安装 `AppIndicator` 扩展才能显示托盘图标

### 打包分发

已配置 `electron-builder`，支持生成各平台安装包：

```bash
# Windows（在 Windows 上执行）
npm run build:win     # → release/透明桌面看板-Setup-0.2.0.exe（NSIS 安装包）

# macOS（在 macOS 上执行）
npm run build:mac     # → release/透明桌面看板-0.2.0.dmg（支持 Intel + Apple Silicon）

# Linux（在 Linux 上执行）
npm run build:linux   # → release/透明桌面看板-0.2.0.AppImage / .deb

# 免安装版（仅打包到目录，不生成安装器，用于快速测试）
npm run build:dir
```

> 💡 **跨平台打包提示**：建议在**对应平台上执行打包**（Win 包在 Win 上打、Mac 包在 Mac 上打）。如需在一台机器上打全平台包，推荐用 GitHub Actions CI（项目已支持，配置 `.github/workflows/build.yml` 即可）。

### 统信 UOS / deepin 合规 deb 打包

本项目额外提供了**符合 UOS 应用打包规范**的 deb 生成脚本（标准 `electron-builder` 的 deb 不符合 UOS 的 `/opt/apps` 结构）。

**UOS 规范要点（本包已遵循）：**
- ✅ 所有应用文件安装在 `/opt/apps/com.dashboard.transparent/`
- ✅ 包含 `info.json` 应用清单（appid、版本、权限声明）
- ✅ 桌面入口 `.desktop` 放在 `entries/applications/`，图标放在 `entries/icons/`
- ✅ 启动脚本自包含依赖库（通过 `LD_LIBRARY_PATH`，不污染 `/usr/lib`）
- ✅ 不使用 postinst 修改系统目录
- ✅ 用户运行时数据走 `~/.config/`（数据盘）

**打包方式（Windows 上通过 WSL 一键生成）：**
```bash
# 前提：已安装 WSL Ubuntu（带 node、npm、dpkg-deb、fakeroot）
wsl -d Ubuntu bash -c 'bash /mnt/c/Users/<你>/.../transparent-desktop-dashboard/scripts/wsl-build-deb.sh'
```

**在 UOS 系统上打包（原生）：**
```bash
# 1. 安装依赖：sudo apt install fakeroot
# 2. 执行打包脚本
cd transparent-desktop-dashboard
./scripts/build-uos-deb.sh
# → release/com.dashboard.transparent_0.2.0_amd64.deb
```

**UOS 上安装与卸载：**
```bash
sudo dpkg -i release/com.dashboard.transparent_0.2.0_amd64.deb   # 安装
sudo dpkg -r com.dashboard.transparent                            # 卸载
```
安装后在应用菜单搜索"透明桌面看板"启动，或终端运行 `transparent-dashboard.sh`。

**关于系统盘/数据盘的说明：**
按 UOS 规范，应用静态文件安装到 `/opt/apps/`（系统盘）。应用的**配置和用户数据**（待办、倒数日、布局设置等）自动写入 `~/.config/transparent-desktop-dashboard/`，该路径位于数据盘（UOS 的 `/data/home` 即家目录）。重装系统时这些用户数据可被保留。
