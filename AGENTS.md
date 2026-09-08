# AGENTS.md — 透明桌面看板（transparent-desktop-dashboard）

> 全局行为准则见 `~/.zcode/AGENTS.md`（搜索成熟方案/3次换方向/验证返回值等），本文件只放本项目专属内容。
> 完整踩坑史见 [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)。

## 命令（可直接粘贴执行）
- 开发实例：`npm run dev`（electron . --dev）
- 打包 Windows：`npm run build:win` → `release\`
- UOS deb（WSL）：先杀全部残留进程（EBUSY 锁文件），再 `MSYS_NO_PATHCONV=1 wsl -- bash -c "~/td-build/打包脚本绝对路径"`；产物在 WSL `~/td-build/release/` 并复制回项目 `release\`
- ⚠️ 本项目无 npm test 脚本——验证靠开发实例 + userData 日志，勿编造测试命令

## 关键路径
- 源码：`src/main|preload|renderer`（renderer/scripts/widgets/ 15 个功能组件）
- 运行时 userData：`C:\Users\67842\AppData\Roaming\transparent-desktop-dashboard`
  - `config.json` — 股票代码、AI 设置、布局方案、天气城市
  - `main.log` — 主进程日志（股票/天气/AI/桌面扫描打点，**排障第一入口**）
- 安装位：`C:\Users\67842\AppData\Local\Programs\透明桌面看板`；安装包历史在 `release-diag\`（最新）

## 关键技术约束（必读）

### Win+D / ShowDesktop 问题
**绝对不要用 `SetParent`！** 它会把窗口变成 Progman 的子窗口，和桌面图标同级，导致 GDI 裁切 bug（桌面图标消失）。
正确做法：`GWLP_HWNDPARENT`（设置 Owner，不是 Parent）。

### Win11 25H2 显示桌面——终极结论（实测）
- **WorkerW 壁纸嵌入已死**：25H2 RaisedDesktop 模型下发 `0x052C` 不再创建新 WorkerW，
  Rainmeter 式"贴壁纸层免疫"方案不可用，别再尝试
- **DWM 隐藏骗过所有 Electron API**：点"显示桌面"后 `isVisible()` 仍返回 true、非 minimized，
  `show()/restore()` 全部无效——不能依赖 Electron 窗口状态判断
- **唯一可靠恢复链**：`blur` → 500ms 后查 `document.hidden===true` → koffi `GetForegroundWindow()==Progman`
  （区分"被浏览器遮挡"，否则误判会把用户浏览器最小化！）→ `keybd_event` 模拟 Win+D toggle 退出该状态
- toggle 类恢复必须加 **3 秒冷却**，防误判震荡

### 64 位 HWND 读取
```javascript
// ✅ 正确
const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
// ❌ 错误（64 位系统上会截断指针，导致所有 Win32 API 调用静默失败）
const hwnd = buf.readInt32LE(0);
```

### Win32 API 调用
优先用 `koffi`（纯 JS FFI 库，进程内调用），不要写外部 C# exe（有路径/编码/打包问题）。

### 点击穿透
用 Electron 原生 `setIgnoreMouseEvents(true, {forward:true})` + cursor 轮询。
不要用 `WS_EX_TRANSPARENT`（和 Chromium 渲染冲突）。

### GDI+/koffi 图标提取（黑框修复实录）
- **`GdipCreateBitmapFromHICON` 丢弃 alpha 通道**——透明区域变黑色不透明，绝不要用它转 PNG
- 正确链路：`GetIconInfo` → `GetDIBits` 手动读 32bpp BGRA → alpha 全 0 时用**掩码位图推导透明度**（老格式图标）
  → bottom-up 翻转 → `GdipCreateBitmapFromScan0` 重建 → PNG
- koffi 姿势：struct 定长数组字段写 `'uint16_t [260]'`；out 参数用 `_Out_` 修饰 + JS 对象/`[null]` 数组接收；
  位图数据传 Buffer；GDI 句柄（HICON/HBITMAP/HDC）**必须在 finally 链式释放**

## Windows 上交叉打包
- **macOS 包只能在 macOS 打**：electron-builder 硬限制 → GitHub Actions macos runner（免费）解决
- **deb 在 Windows 打不了**（fpm/symlink 缺失）→ WSL 打（见上方命令节的 MSYS_NO_PATHCONV 坑）
- 多平台产物分目录存，`rm -rf release` 前确认别误删 deb
- UOS deb 规范：`/opt/apps/<appid>/` 结构 + dpkg-deb `-Zxz`（老 dpkg 不支持 zstd）+ 版本号动态读 package.json

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
