# 透明桌面看板 — 产品路线图

> 本文档记录项目的商业化成熟度评估、差距分析与分阶段路线图。
> 评估基准：商业级桌面应用交付标准（参考 VSCode/Rainmeter/滴答清单等）。
> 最后更新：v0.9.25

---

## 一、现状定位

**定性：功能完整的高质量 MVP，尚未达到商业级交付标准。**

差距集中在**工程化基建**（测试 / 监控 / 网络 / 存储 / 更新 / 签名），而非功能。功能层面已相当丰富（14+ widget、透明穿透、Win+D 防护、koffi 图标提取、自定义上传、多主题、三平台打包）。

| 维度 | MVP | 当前 | 商业级 |
|------|-----|------|--------|
| 功能完整度 | ✅ | ✅ 丰富 | ✅ |
| 核心场景跑通 | ✅ | ✅ | ✅ |
| 改动不担心回归 | ❌ | ❌ | ✅ 自动化测试 |
| 用户崩溃可感知 | ❌ | ❌ | ✅ 错误监控 |
| 用户能自动更新 | ❌ | ❌ | ✅ electron-updater |
| 代码可长期维护 | ⚠️ | ⚠️ 需统一 | ✅ 一致接口 + 类型 |

---

## 二、已达标的部分（值得保留）

- **架构**：main / preload / renderer 三层 + `contextIsolation: true` + `nodeIntegration: false` + preload 白名单 IPC，安全模型正确。
- **Win32 桌面层集成**：koffi 进程内 FFI（替代外部 exe）、GWLP_HWNDPARENT（避免 GDI 裁切）、SHGetFileInfo + GetDIBits 图标提取、GetSystemTimes CPU 采样，踩坑经验已沉淀到 `AGENTS.md`。
- **代码审查机制**：已完成一轮主进程（12 项）+ 渲染层审查，修复了隐藏的严重崩溃 bug（`plant-upload` 缺失致 `bindEvents` 中断）。
- **跨平台打包**：win（NSIS）/ UOS deb（dpkg-deb xz）/ macOS（GitHub Actions macos runner）链路打通。

---

## 三、差距分析（按优先级）

### 🔴 P0 — 发布前应补（影响可靠性）

| # | 项 | 现状 | 目标 |
|---|----|------|------|
| 1 | 自动化测试 | 零测试，全手动 | 关键路径单测（图标提取、config 合并、天气/RSS 解析）+ 1~2 个 E2E（启动/设置保存） |
| 2 | 错误监控 | 无 | 接入 crash 上报（Sentry 或自建），用户崩溃可见 |
| 3 | 网络层 | 无超时/无重试/重定向 socket 泄漏 | 统一 fetch 封装：超时 + 指数退避重试 + 重定向 `res.resume()` |
| 4 | 代码签名 | win 自签名 / mac 未签名 | 正式代码签名 + Apple 公证（否则 SmartScreen/Gatekeeper 拦截） |

### 🟡 P1 — 稳定版应补（影响工程质量）

| # | 项 | 现状 | 目标 |
|---|----|------|------|
| 5 | widget 接口一致性 | init/update/destroy 各写各的，定时器清理不统一 | 统一基类/约定，所有 widget 走相同生命周期 |
| 6 | 配置/存储 | 自定义图片 dataURL 塞 config.json（膨胀）；浅合并；无版本迁移 | 大数据单独文件 + config 版本号 + 迁移机制 |
| 7 | 自动更新 | 无 | electron-updater + 更新源 |
| 8 | 主进程阻塞 | `execSync`（PowerShell/reg query）阻塞事件循环 | 改异步 `exec` + 缓存 |
| 9 | 死代码清理 | 插件系统未接通、`_savedTimers` 等死变量 | 清理或接通 |

### 🟢 P2 — 成熟产品才需要

| # | 项 |
|---|----|
| 10 | i18n（全中文硬编码） |
| 11 | TypeScript（纯 JS，重构无类型保护） |
| 12 | 完整 a11y（可访问性） |
| 13 | CI/CD（win/linux 也接入，自动测试 + 发布） |
| 14 | 用户文档 / 开发者文档 |

---

## 四、插件系统专项评估

### 现状：有设计骨架，但完全未接通（死代码）

| 环节 | 状态 |
|------|------|
| `lib/plugin-sdk.js`（PluginRegistry + SDK 接口） | ✅ 设计完整 |
| 示例插件 `plugins/example-bilibili-hot` | ✅ 有 |
| `manifest.json` 规范（含 permissions 字段） | ✅ 有 |
| preload 暴露 `readPlugins` | ✅ 有 |
| main 进程注册 `plugins:read` handler | ❌ 缺 |
| `index.html` 引入 plugin-sdk.js | ❌ 缺 |
| `app.js` 调 `PluginRegistry.initAll` | ❌ 缺 |
| `package.json` files 含 `plugins/` | ❌ 缺（不会打包） |

### 设计评估（值得肯定）

- PluginRegistry + manifest 规范了插件生命周期（init/render/update/bindEvents）
- 每个插件独立 SDK（store 命名空间隔离 / fetch / open / onRefresh / getTheme）
- manifest 的 permissions 字段（声明式权限）

### 距离商业级插件系统的差距

商业级插件系统的核心是**「让第三方代码安全地跑在你家里」**，目前完全没做：

| 能力 | 商业级要求 | 当前 |
|------|-----------|------|
| 安全沙箱 | 插件不能访问全部 DOM/Store/文件 | ❌ 同进程 JS，能访问一切 |
| 权限执行 | permissions 真正拦截 | ❌ 仅声明 |
| 崩溃隔离 | 一个插件崩不影响主程序 | ❌ 同进程 |
| 生命周期 | install/enable/disable/uninstall/升级 | ❌ 只有 init |
| 热加载 | 不重启加载/卸载 | ❌ 无 |
| API 版本 | SDK 版本 + 兼容性 | ❌ 无 |
| 分发 | 插件市场/签名校验 | ❌ 无 |
| 隔离执行 | iframe + postMessage / Web Worker | ❌ 无 |

**安全风险**：当前插件是 `<script>` 注入主页面，等于给了插件完整的 DOM 和 Store 访问权——第三方插件能读天气 API Key、改配置、偷数据。商业级必须用 iframe + postMessage 或 Web Worker 隔离。

---

## 五、三步走路线图

### 第一步：主程序商业级（当前进行中）

> 目标：把主程序地基打牢，能安全地引入插件。

- [ ] 网络层重写（超时 + 重试 + 重定向修复）
- [ ] 存储分离（自定义图片单独文件，不塞 config.json）
- [ ] widget 接口统一（init 清旧定时器守卫全部对齐）
- [ ] 关键路径单测
- [ ] 错误上报
- [ ] 自动更新（electron-updater）
- [ ] 主进程 execSync → 异步

### 第二步：内置 widget 重构成插件

> 目标：用 PluginRegistry 统一管理所有 widget，验证 SDK 设计可行。

- [ ] 把 clock/weather/stock 等 14 个 widget 改造为「内置插件」
- [ ] 统一走 PluginRegistry.register + initAll
- [ ] 统一生命周期（init/update/destroy）
- [ ] 统一定时器管理（plugin_<name>）
- [ ] 删除各 widget 自管的 `window.__dashboard.timers`

### 第三步：开放第三方插件

> 目标：让第三方安全地开发、分发插件。

- [ ] iframe + postMessage 沙箱（隔离执行）
- [ ] permissions 真正执行（network/storage/clipboard）
- [ ] 插件生命周期（install/enable/disable/uninstall）
- [ ] 热加载（不重启加载/卸载）
- [ ] SDK API 版本 + 兼容性
- [ ] 插件市场 / 签名校验

---

## 六、决策原则

1. **不在没地基的地上盖二楼**：主程序自己还没测试覆盖/错误监控前，不引入第三方插件代码。
2. **每步可交付**：每一步完成都是可发布的状态，不留半成品。
3. **先治 reliability，再谈 extensibility**：可靠性 > 可扩展性。
4. **死代码要么接通要么删除**：不留误导性骨架。
