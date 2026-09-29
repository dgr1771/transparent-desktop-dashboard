# AGENTS.md — 透明桌面看板（transparent-desktop-dashboard）

> 全局行为准则见 `~/.zcode/AGENTS.md`（搜索成熟方案/3次换方向/验证返回值等），本文件只放本项目专属内容。
> 完整踩坑史见 [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)。
> 本文件的编号约定（铁律）按 x-hub AGENTS.md 方法论组织：**每坑必录、每录必带铁律+反例**。改代码前先扫一遍相关编号，新增坑位追加到末尾，不删旧条。

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
- 安装位：`C:\Users\67842\AppData\Local\Programs\transparent-desktop-dashboard`；安装包历史在 `release\`（0.9.48 起全量保留，一键回退任意版本）

## 编号铁律（改动前必扫相关条目）

### 1. Win+D / ShowDesktop 三层防护——`SetParent` 是禁手
**铁律：绝对不要 `SetParent`！** 它把窗口变成 Progman 子窗口，和桌面图标同级 → GDI 裁切（桌面图标消失）。Owner 用 `GWLP_HWNDPARENT`。
- 25H2 实测结论：WorkerW 壁纸嵌入已死（0x052C 不再创建 WorkerW），Rainmeter 式方案不可用，别再试
- DWM 隐藏骗过所有 Electron API：`isVisible()` 仍 true、`show()/restore()` 全无效——不能依赖窗口状态判断
- 唯一可靠恢复链：`blur` → 500ms 后 `document.hidden===true` → koffi `GetForegroundWindow()==Progman`（**必须区分"被浏览器遮挡"，误判会把用户浏览器最小化**）→ 模拟 Win+D toggle 退出；**3 秒冷却**防震荡

### 2. 64 位 HWND 读取
```javascript
// ✅ const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
// ❌ readInt32LE(0) —— 64 位系统截断指针，所有后续 Win32 调用静默失败
```

### 3. Win32 调用一律 koffi（进程内 FFI），禁外部 exe
外部 C# exe 有路径/编码/打包三连坑（desktop-host.exe 已删）。koffi 姿势：struct 定长数组 `'uint16_t [260]'`；out 参数 `_Out_` + JS 对象接收；GDI 句柄（HICON/HBITMAP/HDC）**必须在 finally 链式释放**。

### 4. 点击穿透
`setIgnoreMouseEvents(true, {forward:true})` + 渲染层 mousemove/rAF 节流判定。禁 `WS_EX_TRANSPARENT`（和 Chromium 渲染冲突）。交互元素统一挂 `.no-drag` 类，ClickThrough 按类名判定。

### 5. 图标提取黑框——`GdipCreateBitmapFromHICON` 丢 alpha
正确链路：`GetIconInfo` → `GetDIBits` 手动 32bpp BGRA → alpha 全 0 时用掩码位图推导（老图标）→ bottom-up 翻转 → `GdipCreateBitmapFromScan0` 重建 → PNG。

### 6. 删除功能必须"整链删除 + 比对验证"
**事故实录（v0.9.69→71，2026-09-29 三连修）**：移除总线三卡时只删了 JS 驱动，漏了 HTML 三个残缺 div（无头部的孤儿块，永远显示"连接任务总线..."占位文字盖在桌面上）、CSS 62 行、app.js 三个 undefined 守卫——用户连续两天报"有总线卡""画面模糊"。
**铁律：删功能 = HTML 元素 + script 引用 + CSS 规则块 + 配置默认键 + 设置清单 + 启动台 META + init/refresh 分支，七处一起清；删完 `git diff` 逐文件扫关键词，装机后截图验证。**

### 7. 注册表桌面路径——`Shell Folders` 旧键可能是幽灵路径
**事故实录（v0.9.70）**：OneDrive 已知文件夹还原后，`Shell Folders\Desktop` 残留已删除的 `OneDrive\Desktop`，桌面三卡扫到 0 项。
**铁律：读系统路径一律优先 `User Shell Folders`（迁移后会更新），且每个候选必须 `fs.existsSync` 校验——注册表指向不存在的目录时绝不采用，回退默认。**

### 8. EPIPE 主进程崩溃——常驻应用 console 必须重定向
从重定向管道/某些启动器启动时 stdout 断开，任何 console 输出抛 EPIPE 直接崩主进程。**主进程 console 必须重定向到 userData/main.log（2MB 滚动）+ uncaughtException/unhandledRejection 兜底只记日志不退出。**

### 9. 快捷键注册失败的释放竞态
强杀旧实例后热键（RegisterHotKey）释放有延迟，新实例首次注册可能失败。**注册失败自动重试 3 次（3s 间隔）**，不要让用户手动重启自愈。

### 10. NSIS 安装器 `/S` 静默安装偶发卡死
长命令过 ssh/无人值守时 `Setup.exe /S` 可能挂起。**对策：远程脚本 + setsid 脱离会话 + 轮询完成标志**；本机用 `Start-Process -Wait` 包一层。

### 11. 渲染层动画禁止依赖 rAF 启动
窗口被遮挡/远程桌面时 rAF 永久停摆，动画停在初始态（发牌全透明卡在屏幕上的根因）。**状态初始化用 setTimeout，rAF 只用于逐帧节流。**

### 12. 多显示器配置互踩（last-writer-wins）
每窗口独立 Store 缓存，config:set 后必须向**其它窗口**广播 config-updated；设置窗口保存前必须重新 `getConfig()` 拉最新再合并，防止旧快照整体覆盖。

### 13. PowerShell + Git Bash 三坑
- 双引号里的 `$_` 被 bash 吞——PS 命令用单引号包
- 无 BOM UTF-8 中文注释必炸——ps1 全 ASCII 或走文件
- `pkill -f 'transparent-dashboard'` 会匹配自己的 ssh 命令行自杀——远程杀进程用精确 exe 名

### 14. 交叉打包
- macOS 包只能 macOS 打（electron-builder 硬限制）→ GitHub Actions macos runner
- deb 在 Windows 打不了 → WSL（`MSYS_NO_PATHCONV=1` 防 Git Bash 路径改写）
- 打包前杀全部看板进程（EBUSY 锁文件）；GitHub 下载超时切 npmmirror 镜像
- UOS deb：`/opt/apps/<appid>/` + dpkg-deb `-Zxz`（老 dpkg 不支持 zstd）

### 15. 版本回退验证流程
release\ 保留全部历史安装包。用户要求"试试旧版本"时：杀进程 → `/S` 静默装 → 验证 exe 版本号 → 启动 → 查 main.log。**装回新版同流程，确认热键+数据拉取正常才算完成。**
