# AGENTS.md — AI 开发指令（ZCode 自动读取）

> 本文件由 ZCode 自动读取，作为开发本项目（及类似桌面看板项目）的 AI 行为准则。

## 核心原则

### 1. 遇到底层问题，先搜索成熟方案
不要自己造轮子。遇到 Windows/Linux 底层 API 问题时：
- 先搜索 Rainmeter、Wallpaper Engine、Lively Wallpaper 等成熟项目的实现
- 先查 Stack Overflow 高分回答和 Microsoft Q&A
- 理解 API 的底层原理（如 SetParent vs Owner 的区别）再动手

### 2. 3 次失败必须换方向
如果同一个方向失败 3 次，**立即停下来**：
- 问"我的方向是不是从一开始就错了？"
- 搜索"别人是怎么解决这个问题的？"
- 不要在同一个框架里继续微调

### 3. 验证每一步的返回值
不要只看"看起来对不对"。每个 API 调用都要检查返回值和副作用。

---

## 关键技术约束（必读）

### Win+D / ShowDesktop 问题
**绝对不要用 `SetParent`！** 它会把窗口变成 Progman 的子窗口，和桌面图标同级，导致 GDI 裁切 bug（桌面图标消失）。

正确做法：`GWLP_HWNDPARENT`（设置 Owner，不是 Parent）

### 64 位 HWND 读取
```javascript
// ✅ 正确
const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
// ❌ 错误（64 位系统上会截断指针，导致 SetParent 静默失败）
const hwnd = buf.readInt32LE(0);
```

### Win32 API 调用
优先用 `koffi`（纯 JS FFI 库，进程内调用），不要写外部 C# exe（有路径/编码/打包问题）。

### 点击穿透
用 Electron 原生 `setIgnoreMouseEvents(true, {forward:true})` + cursor 轮询。
不要用 `WS_EX_TRANSPARENT`（和 Chromium 渲染冲突）。

---

## 项目架构

```
src/main/           主进程（Electron）
  index.js          入口 + 窗口管理 + IPC + Win+D 防护
  platform.js       平台适配（koffi Win32 API + Electron 穿透）
  config-store.js   配置持久化
  data.js           数据获取（天气/股票/新闻/RSS）
src/preload/        preload 安全桥接
src/renderer/       渲染进程
  scripts/widgets/  15 个功能组件
  scripts/lib/      库（穿透/拖拽/磁吸/绿植/天气特效/插件SDK）
  styles/           CSS
```

## 详细经验文档

完整的技术坑、解决方案、思维方法论见：
[docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)
