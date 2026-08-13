# 开发经验总结 — 透明桌面看板项目

本文档记录开发过程中遇到的关键技术坑和解决方案，供后续开发参考。

---

## 一、Win+D（显示桌面）问题 — 最终解决方案

### 错误方向（浪费了大量时间）

| 尝试 | 失败原因 |
|------|---------|
| Electron `setIgnoreMouseEvents` + 事件恢复 | Win+D 不触发 minimize/hide，只触发 blur；恢复时遮挡其他窗口 |
| `SetParent(hwnd, WorkerW)` | 用了 `readInt32LE(0)` 导致 64 位 HWND 截断，SetParent 静默失败 |
| `SetParent(hwnd, Progman)` | 窗口变成 Progman 子窗口，和桌面图标同级，GDI 裁切导致图标消失 |
| `WS_EX_TRANSPARENT` 动态切换 | Chromium 和 Win32 系统级穿透协调有延迟 |
| 外部 C# exe（desktop-host.exe） | 路径、编码、打包、进程启动延迟等问题 |
| `hookWindowMessage(0x0112)` 单独使用 | Win+D 的 ShowDesktop 不走 WM_SYSCOMMAND |

### 正确方案

```javascript
// 1. koffi 直接在进程内调 Win32 API（不用外部 exe）
const koffi = require('koffi');
const user32 = koffi.load('user32.dll');

// 2. GWLP_HWNDPARENT 设置 Owner（不是 SetParent！）
//    Owner → 窗口保持顶层，DWM 独立渲染，不裁切图标
//    Parent → 窗口变子窗口，GDI 裁切导致图标消失
const GWLP_HWNDPARENT = -8;
SetWindowLongPtrA(hwnd, GWLP_HWNDPARENT, progman);

// 3. 64 位 HWND 正确读取
const hwnd = process.arch === 'x64'
  ? Number(buf.readBigInt64LE(0))  // ← 不是 readInt32LE！
  : buf.readInt32LE(0);

// 4. hookWindowMessage 拦截 SC_MINIMIZE
win.hookWindowMessage(0x0112, (wParam) => {
  if ((wParam.readUInt32LE(0) & 0xFFF0) === 0xF020) return true;
});

// 5. Electron 原生 setIgnoreMouseEvents 做穿透
win.setIgnoreMouseEvents(true, { forward: true });
```

### 关键教训

- **SetParent vs GWLP_HWNDPARENT**：Owner 和 Parent 是完全不同的概念。Owner 窗口保持独立，Parent 让窗口变成子窗口
- **64 位 HWND**：Windows 10/11 64 位系统上，`getNativeWindowHandle()` 返回 8 字节，必须用 `readBigInt64LE`
- **koffi > 外部 exe**：纯 JS FFI 库比编译 C# exe 可靠得多（无路径/编码/打包问题）
- **hookWindowMessage 0x0112**：拦截 WM_SYSCOMMAND 的 SC_MINIMIZE，但单独不够，需要配合其他层

---

## 二、思维方法论教训

### 失败模式

遇到底层问题时，在"应用层"反复尝试（10+ 个版本），而不是：
1. 搜索成熟开源项目（Rainmeter）怎么做的
2. 理解 Win32 API 的底层原理再动手
3. 在 3 次失败后质疑方向是否正确

### 正确流程

```
遇到问题 → 搜索社区/开源方案 → 理解原理 → 选择方案 → 实现 → 验证
     ↑                                                    |
     └────── 失败 3 次 → 回到搜索，换方向 ←──────────────┘
```

---

## 三、Electron 透明窗口最佳实践

| 场景 | 正确做法 | 错误做法 |
|------|---------|---------|
| 点击穿透 | `setIgnoreMouseEvents(true, {forward:true})` + cursor 轮询 | WS_EX_TRANSPARENT（和 Chromium 渲染冲突） |
| Win+D 防护 | GWLP_HWNDPARENT + hookWindowMessage + blur 检测 | SetParent（GDI 裁切） |
| Win32 API 调用 | koffi（进程内 FFI） | 外部 exe（路径/编码问题） |
| 64 位句柄 | `readBigInt64LE(0)` | `readInt32LE(0)`（截断） |
| 桌面图标提取 | SHGetFileInfo + UTF-8 文件传路径 | stdin 传中文（乱码） |

---

## 四、搜索优先级

遇到 Windows 底层问题时，按以下顺序搜索参考：
1. Rainmeter 源码（C++，桌面小组件标杆）
2. Wallpaper Engine 的技术分析文章
3. Stack Overflow 的高分回答
4. Microsoft Q&A 官方建议
5. GitHub 上的 Electron 桌面应用项目
