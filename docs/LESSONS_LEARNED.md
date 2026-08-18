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

---

# v0.9.x 阶段经验（布局系统 / 审查修复 / AI 接入）

## 五、布局方案系统（Layout Profiles）设计要点

- **方案 = 全套快照**：卡片位置 + 大小 + **模块显隐** 三者一起存，切换才完整
  （只存位置不存显隐，用户感觉"没变化"）
- **应用路径三处坑**（都踩过）：
  1. `applyLayout` 必须收**当前屏的布局**（`getDisplayLayout()`），传多屏全量对象
     → 循环变量是屏 key，永远匹配不到卡片名，**静默空转**（v0.9.38 才找到的真根因）
  2. 方案揭示的卡片不能走 `placeNewWidgetsMinimized`（会被缩到右上角覆盖方案位置）
  3. 应用后要暂停 AutoResize 避让 + **重置高度基线**，否则随后的数据刷新把布局推开
- **交互设计**：编辑模式退出时弹命名浮层保存（不用进设置）；托盘子菜单 radio 显示当前方案（`activeProfile` 字段，删除方案时清空防悬挂）
- **浮层输入框失灵的坑**：退出编辑时主进程已恢复鼠标穿透，但渲染层轮询因 `body.interactive` 跳过不恢复——
  弹层瞬间必须主动 `setMouseIgnore(false)`。**鼠标穿透状态的归属要单一**，两边都管必出缝

## 六、审查方法论（19 个 bug 的来源）

- **注释≠实现**：AutoResize 注释说"卡片撑高才推开"，实现从未比较历史高度——
  每次刷新都推开用户布局，表现成"重启后卡片自己挪位"
- **定时器纪律**：每个 widget init 必须先清旧再建（守卫）；key 必须与卡片名一致
  （木鱼 `mokugyo_auto` 清不掉 → 隐藏后每 1.5s 全量写 config 一天 5.7 万次）
- **写放大要节流**：高频事件（功德+1）内存累加 + 30s 落盘 + 停止时 flush；
  config:set 不该无条件重建托盘菜单（仅方案变化时）
- **真实 config.json 是最好的证据**：审查时直接读——发现 `activeProfile:"2"` 而方案只剩 3/4（悬挂引用实锤）

## 七、网络与数据层

- **fetch 必备**：超时 + 指数退避重试（仅 5xx/超时/网络错）+ 重定向 `res.resume()`（修 socket 泄漏）
  + **重定向上限 5 次**（循环 302 会永不 settle，新闻卡永久转圈）+ 相对 location 用 `new URL(loc, base)` 拼接
- **和风天气专属 Host 陷阱**：免费订阅的专属域名**只授权天气接口不授权 Geo 城市查询**（403），
  表现为"点过定位就正常、城市名查询必挂"。三级链解：经纬度 → Geo API → 内置城市 LocationID 离线映射兜底
- **桌面扫描去重**：文件签名（路径+mtime+size）不变直接返回缓存——
  最贵的图标提取（58×koffi+GDI+PNG编码）不再被布局切换/设置保存反复触发（main.log 验证生效）
- **新浪行情字段**：8=成交量(手) 9=成交额(元)，10+ 才是买卖五档

## 八、启动性能

- **widget 分批错峰**：时钟立即 → 本地轻量 +120ms → 网络类 +350ms → 重活（扫描/图标）+600ms~2.5s
- PowerShell 图标方案彻底废弃（冷启动+Add-Type 编译 2-5s CPU 尖峰），koffi 进程内毫秒级
- `os.loadavg()` **Windows 恒 0** → CPU 用 koffi `GetSystemTimes` 两次采样

## 九、AI 能力（BYOK 实践）

- OpenAI 兼容统一抽象：智谱(glm-4-flash 免费)/DeepSeek/通义/Ollama 一套代码；云端只填 Key
- 分层降本：本地正则解析时间（80% 场景）→ AI JSON 提取兜底 → 纯文本
- 输出处理：转义防注入、按天缓存（塔罗）、滚动容器显示长摘要（max-height 240px）
- 诊断：AI 链路必须打日志（请求/成功/失败/未就绪），否则黑盒排障全靠猜

## 十、打包与发布

- WSL 打 deb：`MSYS_NO_PATHCONV=1 wsl -- bash -c "..."`（否则 /mnt/c 被 Git Bash 转坏）
- dpkg-deb 管道验证 `| head` 会 Broken pipe + `set -e` 假失败——验证命令加 `|| true`
- electron-builder 版本号一处来源：脚本动态 `node -p require('./package.json').version`
- mac 只能 macOS 打 → GitHub Actions macos runner（workflow 在 `.github/workflows/build-mac.yml`）
- 未签名分发：README 写清"右键打开/仍要运行"；正式签名方案见 `docs/SIGNING.md`

## 十一、排障工具链（最终形态）

1. 主进程 console → `userData/main.log` 文件（EPIPE 安全，超 2MB 重开）
2. 渲染层排查用 `--enable-logging`，或关键路径 console.info 落主进程
3. **链路打点法**：可疑链路每环加日志（托盘点击→config 写入→广播→渲染收到→DOM 应用），
   读日志看断在哪环——比盲猜快一个数量级
4. 隔离验证：网络问题用独立 node 脚本复刻同逻辑直测 API（绕开 app 干扰）

