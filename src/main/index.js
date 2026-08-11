'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const ConfigStore = require('./config-store');
const { registerDataHandlers } = require('./data');
const platform = require('./platform');

// 禁用 GPU 磁盘缓存（Chromium 的 shader/disk cache）
// 这个缓存目录经常因进程异常退出被锁（报 0x5 拒绝访问），导致应用无法启动。
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// 全平台禁用 GPU 硬件加速，改用软件渲染。
// 原因：本应用是静态信息卡片，无 3D/动画密集场景，软件渲染完全够用；
// 且 GPU 进程在频繁启停后容易缓存损坏崩溃（exit_code=1），禁用后更稳定。
// macOS 透明窗口穿透本身也需要禁用。
app.disableHardwareAcceleration();

// 主进程侧配置持久化
let configStore = null;

// 全局引用，避免被垃圾回收
// 多显示器：每个显示器一个窗口，存入 Map<displayId, BrowserWindow>
const windows = new Map();
let tray = null;
let settingsWindow = null;

// 交互模式：false=鼠标穿透（透明壁纸），true=编辑模式（可交互）
let interactionMode = false;

// 是否开发模式（带 --dev 参数启动）
function isDev() {
  return process.argv.includes('--dev') || !app.isPackaged;
}

/**
 * 为所有显示器创建透明窗口（多屏支持）
 * 每个显示器一个窗口，共享同一份配置和数据。
 */
function createAllWindows() {
  const allDisplays = screen.getAllDisplays();

  // 检测复制/镜像模式：
  // 1. bounds 完全相同 → 肯定是复制模式
  // 2. bounds 大面积重叠（>90%）→ 很可能是复制模式
  // 复制模式下只为主屏创建一个窗口
  const uniqueDisplays = [];
  for (const d of allDisplays) {
    const isDuplicate = uniqueDisplays.some(existing => {
      // bounds 完全相同
      if (d.bounds.x === existing.bounds.x &&
          d.bounds.y === existing.bounds.y &&
          d.bounds.width === existing.bounds.width &&
          d.bounds.height === existing.bounds.height) return true;
      // 检测重叠面积
      const overlapX = Math.min(d.bounds.x + d.bounds.width, existing.bounds.x + existing.bounds.width) - Math.max(d.bounds.x, existing.bounds.x);
      const overlapY = Math.min(d.bounds.y + d.bounds.height, existing.bounds.y + existing.bounds.height) - Math.max(d.bounds.y, existing.bounds.y);
      if (overlapX <= 0 || overlapY <= 0) return false;
      const overlapArea = overlapX * overlapY;
      const displayArea = d.bounds.width * d.bounds.height;
      return overlapArea / displayArea > 0.9;  // 90% 重叠视为复制模式
    });
    if (!isDuplicate) {
      uniqueDisplays.push(d);
    }
  }
  if (uniqueDisplays.length < allDisplays.length) {
    console.log(`[Display] 检测到复制/镜像模式（${allDisplays.length}个显示器，${uniqueDisplays.length}个唯一），只创建${uniqueDisplays.length}个窗口`);
  }

  for (const display of uniqueDisplays) {
    createWindowForDisplay(display);
  }

  // 如果没有任何窗口（异常情况），至少创建主屏窗口
  if (windows.size === 0) {
    createWindowForDisplay(screen.getPrimaryDisplay());
  }

  // 启动 Win+D 防护和穿透定时器（只启动一次）
  startProtectionTimers();

  // 监听显示器热插拔
  registerDisplayEvents();
}

/**
 * 为单个显示器创建透明窗口
 */
function createWindowForDisplay(display) {
  const displayId = display.id;
  // 已存在则跳过
  if (windows.has(displayId)) return;

  // 用 workArea（不含任务栏区域），适配所有平台
  const workArea = display.workArea;
  const winX = workArea.x;
  const winY = workArea.y;
  const winW = workArea.width;
  const winH = workArea.height;

  const win = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    ...platform.getMainWindowOptions(),
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'icon-256.png'),
    fullscreenable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--display-id=${displayId}`]  // 传 displayId 给渲染进程
    }
  });

  // 存储 displayId 到窗口对象，方便后续查找
  win._displayId = displayId;
  win._isPrimary = display.id === screen.getPrimaryDisplay().id;

  // 平台特定的窗口初始化
  platform.initWindowForPlatform(win);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Windows：Win+D 防护——minimize 事件同步立即恢复
  // 不用 WorkerW/ToolWindow（副作用太大），用事件级拦截 + 高频兜底
  win.on('minimize', () => {
    if (win._userHidden) return;
    try { win.restore(); win.showInactive(); } catch (e) {}
  });
  win.on('hide', () => {
    if (win._userHidden) return;
    try { win.showInactive(); } catch (e) {}
  });

  // 开发模式：只给主屏窗口开 DevTools
  if (process.argv.includes('--dev') && win._isPrimary) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.on('closed', () => {
    windows.delete(displayId);
  });

  windows.set(displayId, win);
}

/**
 * Linux X11 SHAPE 穿透：收集 widget 位置，设置窗口输入区域
 * 卡片区域接收鼠标，背景区域穿透到桌面图标
 */
function _updateLinuxShape(win) {
  try {
    const hwnd = win.getNativeWindowHandle();
    const hwndNum = hwnd.readInt32LE(0);

    // 查询渲染进程中所有可见 widget 的位置
    win.webContents.executeJavaScript(
      `(()=>{
        const widgets = document.querySelectorAll('.widget[data-widget]');
        const rects = [];
        widgets.forEach(el => {
          if (el.style.display === 'none') return;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) rects.push(r.left+','+r.top+','+r.width+','+r.height);
        });
        return rects.join(' ');
      })()`,
      true
    ).then(rectsStr => {
      if (win.isDestroyed()) return;
      if (!rectsStr) return;

      // 调用 shape-input 设置输入区域
      const { execFileSync } = require('child_process');
      const args = [String(hwndNum)];
      rectsStr.split(' ').forEach(r => { if (r.trim()) args.push(r.trim()); });

      try {
        // shape-input 位置：开发态在 tools/，打包后在 resources/tools/ 或 /opt/apps/
        const shapePath = app.isPackaged
          ? path.join(process.resourcesPath, 'tools', 'shape-input')
          : path.join(__dirname, '..', '..', 'tools', 'shape-input');
        execFileSync(shapePath, args, {
          encoding: 'utf8', timeout: 2000
        });
      } catch (e) {
        // shape-input 可能还没编译/安装，静默失败
      }
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Win+D 防护 + 穿透状态定时器（全局，遍历所有窗口）
 */
function startProtectionTimers() {
  // Win+D 兜底：500ms 检测（事件级防护已处理绝大多数情况，这里只兜底）
  if (platform.isWin) {
    setInterval(() => {
      for (const win of windows.values()) {
        if (!win || win.isDestroyed() || win._userHidden) continue;
        if (win.isMinimized() || !win.isVisible()) {
          try {
            win.setSkipTaskbar(true);
            win.restore();
            win.showInactive();
            platform.setWindowLevel(win, interactionMode);
            platform.setClickThrough(win, !interactionMode);
          } catch (err) {}
        }
      }
    }, 500);
  }

  // ===== Linux：不使用 SHAPE 穿透（会阻止桌面图标点击）=====
  // UOS/deepin 上看板设为底层窗口，不穿透，但通过 skipTaskbar + 不置顶
  // 让其他应用窗口在看板上方，桌面图标通过看板的桌面整理功能访问

  // ===== 区域穿透：主进程 cursor 轮询（仅 Windows）=====
  // Linux 不使用穿透（setIgnoreMouseEvents 会导致整窗无法恢复）
  if (platform.isWin) {  // 仅 Windows 使用穿透轮询
    let lastCursor = { x: -999, y: -999 };
    setInterval(() => {
      if (interactionMode) return;
      const cursor = screen.getCursorScreenPoint();

      for (const win of windows.values()) {
        if (!win || win.isDestroyed() || win._userHidden) continue;
        const bounds = win.getBounds();
        const inWindow = cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width &&
                         cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
        if (!inWindow) {
          // 鼠标不在窗口内：确保穿透
          try {
            if (platform.isWin) win.setIgnoreMouseEvents(true, { forward: true });
            else win.setIgnoreMouseEvents(true);
          } catch (e) {}
          continue;
        }
        // 鼠标位置没变（静止不动）：跳过 executeJavaScript，保持上次状态
        if (cursor.x === lastCursor.x && cursor.y === lastCursor.y) continue;

        const localX = Math.round(cursor.x - bounds.x);
        const localY = Math.round(cursor.y - bounds.y);
        win.webContents.executeJavaScript(
          `(()=>{const el=document.elementFromPoint(${localX},${localY});if(!el)return false;const tag=el.tagName.toLowerCase();if(['input','button','a','select','textarea'].includes(tag))return true;if(el.contentEditable==='true')return true;if(el.classList&&el.classList.contains('no-drag'))return true;return false;})()`,
          true
        ).then(onInteractive => {
          if (win.isDestroyed()) return;
          const shouldIgnore = !onInteractive;
          if (win._cursorIgnore !== shouldIgnore) {
            win._cursorIgnore = shouldIgnore;
            try {
              if (platform.isWin) win.setIgnoreMouseEvents(shouldIgnore, { forward: true });
              else win.setIgnoreMouseEvents(shouldIgnore);
            } catch (e) {}
          }
        }).catch(() => {});
      }
      lastCursor = { x: cursor.x, y: cursor.y };
    }, 200);
  }
}

/**
 * 监听显示器热插拔事件
 */
function registerDisplayEvents() {
  screen.on('display-added', (_e, display) => {
    console.log('[Display] 显示器接入:', display.id);
    createWindowForDisplay(display);
  });

  screen.on('display-removed', (_e, display) => {
    console.log('[Display] 显示器移除:', display.id);
    const win = windows.get(display.id);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    windows.delete(display.id);
  });

  screen.on('display-metrics-changed', (_e, display, _changedMetrics) => {
    console.log('[Display] 显示器尺寸变化:', display.id);
    const win = windows.get(display.id);
    if (win && !win.isDestroyed()) {
      const wa = display.workArea;
      try {
        win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
      } catch (err) {}
    }
  });
}

/**
 * 创建设置窗口（独立窗口，不透明，可交互）
 */
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 640,
    title: '设置',
    resizable: true,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * 切换交互/穿透模式（影响所有窗口）
 * @param {boolean} interactive - true=可交互, false=穿透
 */
function setInteractionMode(interactive) {
  interactionMode = interactive;
  if (windows.size === 0) return;

  // 对所有窗口应用模式
  for (const win of windows.values()) {
    if (!win || win.isDestroyed()) continue;
    // 鼠标穿透
    platform.setClickThrough(win, !interactive);
    // 窗口层级
    platform.setWindowLevel(win, interactive);
    // 通知渲染进程更新 UI（边框高亮等）
    win.webContents.send('interaction-mode-changed', interactive);
  }

  // 更新托盘菜单勾选状态
  updateTrayMenu();
}

function toggleInteractionMode() {
  setInteractionMode(!interactionMode);
}

/**
 * 系统托盘
 */
function createTray() {
  // 系统托盘图标
  // 图标路径解析：开发态用源码路径，打包态用 resourcesPath
  const iconSize = platform.isMac ? 16 : (platform.isLinux ? 22 : 32);
  const iconName = `icon-${iconSize}.png`;

  // 候选路径列表，按优先级尝试（开发态 + 各种打包结构）
  const candidates = [
    // 开发态：src/main → assets/icons
    path.join(__dirname, '..', '..', 'assets', 'icons', iconName),
    // electron-builder 标准打包：resources/assets/icons
    path.join(process.resourcesPath || '', 'assets', 'icons', iconName),
    // asar 内：resources/app/assets/icons
    path.join(process.resourcesPath || '', 'app', 'assets', 'icons', iconName),
    // UOS deb 专属：files/icons（独立放的，不依赖 asar 解包）
    path.join(__dirname, '..', '..', 'icons', iconName),
    path.join(process.resourcesPath || '', '..', 'icons', iconName),
    path.join(__dirname, '..', '..', '..', 'assets', 'icons', iconName)
  ];

  let icon = nativeImage.createEmpty();
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      icon = img;
      console.log('[Tray] 图标加载成功:', p);
      break;
    }
  }

  if (platform.isMac) {
    icon.setTemplateImage(true);
  }

  // Linux 上托盘可能因缺少 libappindicator 失败，用 try-catch 容错
  try {
    tray = new Tray(icon);
    updateTrayMenu();
    tray.setToolTip('透明桌面看板');
    console.log('[Tray] 托盘创建成功');
  } catch (e) {
    console.error('[Tray] 托盘创建失败（可能缺少 libappindicator）:', e.message);
    tray = null;
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const menuTemplate = [
    {
      label: interactionMode ? '✅ 编辑模式（可拖动卡片）' : '🖱️ 穿透模式（透明壁纸）',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🪄 自动排列卡片',
      click: () => {
        for (const win of windows.values()) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('auto-arrange');
          }
        }
      }
    },
    {
      label: '切换编辑/穿透模式 (Ctrl+Shift+D)',
      click: () => toggleInteractionMode(),
      type: 'checkbox',
      checked: interactionMode
    },
    { type: 'separator' },
    {
      label: '显示/隐藏看板 (Ctrl+Shift+H)',
      click: () => {
        if (windows.size === 0) {
          createAllWindows();
          setInteractionMode(interactionMode);
          return;
        }
        const anyVisible = [...windows.values()].some(w => w && !w.isDestroyed() && w.isVisible());
        for (const win of windows.values()) {
          if (!win || win.isDestroyed()) continue;
          if (anyVisible) {
            win._userHidden = true;
            win.hide();
          } else {
            win._userHidden = false;
            win.show();
            platform.setClickThrough(win, !interactionMode);
          }
        }
      }
    },
    {
      label: '刷新数据',
      click: () => {
        for (const win of windows.values()) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('refresh-all');
          }
        }
      }
    },
    {
      label: '设置...',
      click: () => createSettingsWindow()
    },
    // 开发者工具仅在开发模式（--dev）下显示
    ...(isDev() ? [{
      label: '开发者工具',
      click: () => {
        // 打开主屏窗口的 DevTools
        for (const win of windows.values()) {
          if (win && !win.isDestroyed() && win._isPrimary) {
            win.webContents.openDevTools({ mode: 'detach' });
            break;
          }
        }
      }
    }] : []),
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

/**
 * 注册全局快捷键
 */
function registerShortcuts() {
  // Ctrl+Shift+D 切换编辑模式
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    toggleInteractionMode();
  });

  // Ctrl+Shift+H 隐藏/显示所有窗口
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    const anyVisible = [...windows.values()].some(w => w && !w.isDestroyed() && w.isVisible());
    for (const win of windows.values()) {
      if (!win || win.isDestroyed()) continue;
      if (anyVisible) {
        win._userHidden = true;
        win.hide();
      } else {
        win._userHidden = false;
        win.show();
        platform.setClickThrough(win, !interactionMode);
      }
    }
  });
}

// ========== App 生命周期 ==========

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 第二个实例尝试启动时，显示所有窗口
    for (const win of windows.values()) {
      if (win && !win.isDestroyed() && !win.isVisible()) win.show();
    }
  });
}

// 防止窗口关闭即退出应用（保持托盘常驻）
app.on('window-all-closed', (e) => {
  // 不调用 app.quit()，让应用常驻托盘
});

app.whenReady().then(() => {
  configStore = new ConfigStore();

  createAllWindows();
  createTray();
  registerShortcuts();

  // 注册 IPC
  registerIpcHandlers();

  // 初始状态：鼠标穿透（所有窗口）
  setInteractionMode(false);
});

// 退出时清理（不再操作桌面图标——从不修改，无需恢复）
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 额外保险：窗口关闭时也恢复（比 will-quit 更早执行）
app.on('browser-window-blur', () => {});  // 占位，实际在 tray 退出菜单处理

// ========== IPC 处理 ==========

function registerIpcHandlers() {
  // 注册数据获取处理器（天气/股票/新闻/配置）
  registerDataHandlers(configStore);

  // 渲染进程请求切换交互模式
  ipcMain.on('set-interaction-mode', (_event, interactive) => {
    setInteractionMode(interactive);
  });

  ipcMain.on('toggle-interaction-mode', () => {
    toggleInteractionMode();
  });

  // 渲染进程动态控制鼠标穿透（实现区域穿透：卡片可点、空白穿透）
  // ignore=true → 该区域穿透到桌面；ignore=false → 该区域接收鼠标事件
  // 注意：多窗口模式下，需要找到发出此请求的窗口（通过 event.sender）
  ipcMain.on('set-mouse-ignore', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win._lastRendererIgnore = ignore;
      if (ignore === false) {
        win._lastWidgetActiveTime = Date.now();
      }
      if (!interactionMode) {
        platform.setClickThrough(win, ignore);
      }
    }
  });

  // 渲染进程查询当前模式
  ipcMain.handle('get-interaction-mode', () => {
    return interactionMode;
  });

  // 获取屏幕尺寸（用于布局）—— 返回当前窗口所在显示器的工作区
  ipcMain.handle('get-screen-size', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const wa = win.getBounds();
      return { width: wa.width, height: wa.height };
    }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });

  // 获取所有显示器信息（多屏配置用）
  ipcMain.handle('get-all-displays', () => {
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      isPrimary: d.id === screen.getPrimaryDisplay().id
    }));
  });

  // 获取当前窗口所属显示器 ID
  ipcMain.handle('get-current-display-id', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win._displayId : screen.getPrimaryDisplay().id;
  });

  // 获取应用版本和作者信息（设置面板"关于"用）
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    name: '透明桌面看板',
    author: '隔壁村布布'
  }));

  // 告知渲染进程平台能力（穿透是否支持、是否 macOS 原生毛玻璃等）
  ipcMain.handle('get-platform-info', () => ({
    // Linux 上 forward 不生效，renderer 的 mousemove 穿透无效
    // 穿透完全由主进程 cursor 轮询控制
    clickThroughSupported: !platform.isLinux,
    isMac: platform.isMac,
    isWin: platform.isWin,
    isLinux: platform.isLinux
  }));

  // 用系统默认浏览器打开外部链接
  ipcMain.handle('open-external', (_e, url) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });

  // 设置保存后，刷新所有窗口
  ipcMain.on('refresh-main', () => {
    for (const win of windows.values()) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('config-updated');
        win.webContents.send('refresh-all');
      }
    }
  });

  // ===== 桌面整理：扫描桌面文件 =====
  const fsDesk = require('fs');
  const pathDesk = require('path');

  ipcMain.handle('desktop:scan', async () => {
    return scanDesktop();
  });

  // 打开桌面文件
  ipcMain.handle('desktop:open', (_e, filePath) => {
    if (typeof filePath === 'string') {
      shell.openPath(filePath);
    }
  });

  // ===== 插件加载：扫描 plugins/ 目录，返回每个插件的 manifest + 源码 =====
  // 渲染进程据此动态注入 <script>/<style>，让 PluginRegistry.register 生效
  ipcMain.handle('plugins:read', async () => {
    const fs = require('fs');
    const pluginsDir = isDev()
      ? path.join(__dirname, '..', '..', 'plugins')           // 开发：项目根/plugins
      : path.join(process.resourcesPath, 'plugins');          // 打包：resources/plugins
    const result = [];
    let entries = [];
    try { entries = fs.readdirSync(pluginsDir, { withFileTypes: true }); }
    catch (e) { return result; }                              // 目录不存在则返回空（非错误）

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(pluginsDir, ent.name);
      const manifestPath = path.join(dir, 'manifest.json');
      const entryPath = path.join(dir, 'index.js');
      const stylePath = path.join(dir, 'style.css');
      if (!fs.existsSync(manifestPath) || !fs.existsSync(entryPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const code = fs.readFileSync(entryPath, 'utf8');
        let css = null;
        try { css = fs.readFileSync(stylePath, 'utf8'); } catch (e) {}
        result.push({ name: manifest.name || ent.name, manifest, code, css });
      } catch (e) {
        console.error(`[plugins] 读取 ${ent.name} 失败:`, e);
      }
    }
    return result;
  });

  /**
   * 获取真实桌面路径（OneDrive 重定向后用注册表读取）
   */
  function getRealDesktopPath() {
    if (platform.isWin) {
      try {
        const { execSync } = require('child_process');
        const out = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Desktop', { encoding: 'utf8', timeout: 2000 });
        const m = out.match(/Desktop\s+REG_[A-Z_]+\s+(.+)/);
        if (m) return m[1].trim();
      } catch (e) {}
      return pathDesk.join(app.getPath('home'), 'Desktop');
    } else if (platform.isLinux) {
      // 优先中文桌面，否则英文
      const cn = pathDesk.join(app.getPath('home'), '桌面');
      if (fsDesk.existsSync(cn)) return cn;
      return pathDesk.join(app.getPath('home'), 'Desktop');
    }
    return app.getPath('desktop');
  }

  /**
   * 批量提取图标（Windows）
   * 用 Windows Shell API SHGetFileInfo —— 这是资源管理器显示桌面图标时
   * 内部调用的同一个函数。直接传 .lnk 路径，Windows 自动解析快捷方式并返回
   * 目标应用的真实图标，与桌面显示完全一致。
   *
   * 相比 ExtractAssociatedIcon 和 Electron getFileIcon 的优势：
   * - 自动解析 .lnk 快捷方式（无需手动读 target/IconLocation）
   * - 对 Electron 应用打包的 exe 也能正确返回真实图标
   * - 返回的就是用户在桌面看到的图标
   *
   * 一次 PowerShell 进程提取所有图标，避免逐个启动的开销。
   * @param {string[]} paths 文件路径数组（.lnk / .exe / 普通文件均可）
   * @returns {Object} { path -> 'data:image/png;base64,...' }
   */
  async function extractIconsBatch(paths) {
    if (!paths || paths.length === 0) return {};
    const { execFile } = require('child_process');
    const os = require('os');
    // ⚠️ 中文路径编码问题：通过 stdin/命令行传中文给 PowerShell 会乱码。
    // 解决：把路径列表写到 UTF-8 临时文件，PowerShell 用 -Encoding UTF8 读取。
    // 输出也写到临时文件（UTF-8），避免 stdout 管道编码问题。
    const listFile = pathDesk.join(os.tmpdir(), 'desk-icons-list-' + process.pid + '.txt');
    const outFile = pathDesk.join(os.tmpdir(), 'desk-icons-out-' + process.pid + '.txt');
    // 写入路径列表（UTF-8）
    fsDesk.writeFileSync(listFile, paths.join('\n') + '\n', 'utf8');

    // PowerShell 脚本：读 UTF-8 路径文件，提取图标，输出到 UTF-8 文件
    const psScript = `Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ShellIcon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct SHFILEINFO {
    public IntPtr hIcon; public int iIcon; public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string szTypeName;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr hIcon);
}
"@
$ErrorActionPreference='SilentlyContinue'
$flags=[uint32]0x100
$lines=Get-Content -LiteralPath '${listFile.replace(/\\/g, '\\$&')}' -Encoding UTF8
$sb=New-Object System.Text.StringBuilder
foreach($line in $lines){
  $line=$line.Trim()
  if(-not $line){continue}
  $fi=New-Object ShellIcon+SHFILEINFO
  $sz=[uint32]([System.Runtime.InteropServices.Marshal]::SizeOf($fi))
  [void][ShellIcon]::SHGetFileInfo($line,0,[ref]$fi,$sz,$flags)
  if($fi.hIcon -ne [IntPtr]::Zero){
    try{
      $icon=[System.Drawing.Icon]::FromHandle($fi.hIcon)
      $ms=New-Object System.IO.MemoryStream
      $icon.ToBitmap().Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)
      $b64=[Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose();$icon.Dispose()
      [void]$sb.AppendLine($line+'|'+$b64)
    }catch{ [void]$sb.AppendLine($line+'|FAIL') }
    [ShellIcon]::DestroyIcon($fi.hIcon)|Out-Null
  }else{ [void]$sb.AppendLine($line+'|FAIL') }
}
[System.IO.File]::WriteAllText('${outFile.replace(/\\/g, '\\$&')}', $sb.ToString(), [System.Text.UTF8Encoding]::new($false))`;

    return new Promise((resolve) => {
      const result = {};
      const proc = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true
      });
      proc.on('error', () => {
        cleanupFiles(listFile, outFile);
        resolve(result);
      });
      proc.on('close', () => {
        // 从输出文件读取结果（UTF-8）
        try {
          const content = fsDesk.readFileSync(outFile, 'utf8');
          for (const line of content.split('\n')) {
            const idx = line.indexOf('|');
            if (idx <= 0) continue;
            const p = line.substring(0, idx).trim();
            const rest = line.substring(idx + 1).trim();
            if (rest && rest !== 'FAIL') {
              result[p] = 'data:image/png;base64,' + rest;
            }
          }
        } catch (e) {}
        cleanupFiles(listFile, outFile);
        resolve(result);
      });
    });
  }

  /** 清理临时文件 */
  function cleanupFiles(...files) {
    for (const f of files) {
      try { fsDesk.unlinkSync(f); } catch (e) {}
    }
  }

  /**
   * Linux .desktop 文件图标解析
   * 解析 Icon= 字段，从系统图标主题查找真实图标文件
   * 支持：图标名（从主题查找）、绝对路径、deepin 图标
   */
  function resolveLinuxDesktopIcon(desktopPath) {
    try {
      const content = fsDesk.readFileSync(desktopPath, 'utf8');
      const iconMatch = content.match(/^Icon=(.+)$/m);
      if (!iconMatch) return '';

      const iconValue = iconMatch[1].trim();

      // 1. 如果是绝对路径，直接读取
      if (iconValue.startsWith('/')) {
        if (fsDesk.existsSync(iconValue)) {
          try {
            const nativeImage = require('electron').nativeImage;
            const img = nativeImage.createFromPath(iconValue);
            if (!img.isEmpty()) return img.toDataURL();
          } catch (e) {}
        }
        return '';
      }

      // 2. 从图标主题查找（bloom / hicolor / Adwaita）
      const iconDirs = [
        '/usr/share/icons/bloom/48', '/usr/share/icons/bloom/32',
        '/usr/share/icons/bloom-classic/48', '/usr/share/icons/bloom-classic/32',
        '/usr/share/icons/hicolor/48x48/apps', '/usr/share/icons/hicolor/48x48',
        '/usr/share/icons/Adwaita/48x48/apps',
        '/usr/share/pixmaps',
        '/usr/share/icons/bloom-dark/48', '/usr/share/icons/bloom-dark/32',
      ];
      const exts = ['.png', '.svg', '.xpm'];
      for (const dir of iconDirs) {
        for (const ext of exts) {
          const p = pathDesk.join(dir, iconValue + ext);
          if (fsDesk.existsSync(p)) {
            try {
              const nativeImage = require('electron').nativeImage;
              const img = nativeImage.createFromPath(p);
              if (!img.isEmpty()) return img.toDataURL();
            } catch (e) {}
          }
        }
      }

      // 3. deepin 应用图标（/opt/apps/xxx/entries/icons/）
      // 从 .desktop 文件的 Exec 或 Name 推断
      const appMatch = content.match(/^Exec=(\S+)/m);
      if (appMatch) {
        const appName = pathDesk.basename(appMatch[1]);
        const deepinIconDirs = [
          '/usr/share/icons/bloom/apps/48', '/usr/share/icons/bloom/apps/32',
          '/usr/share/icons/bloom-classic/apps/48',
        ];
        for (const dir of deepinIconDirs) {
          for (const ext of exts) {
            const p = pathDesk.join(dir, appName + ext);
            if (fsDesk.existsSync(p)) {
              try {
                const nativeImage = require('electron').nativeImage;
                const img = nativeImage.createFromPath(p);
                if (!img.isEmpty()) return img.toDataURL();
              } catch (e) {}
            }
          }
        }
      }

      return '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 扫描桌面，按类型分类
   */
  async function scanDesktop() {
    const result = { apps: [], folders: [], files: [] };
    // 从注册表读取真实桌面路径（解决 OneDrive 重定向）
    const userDesk = getRealDesktopPath();
    const publicDesk = platform.isWin
      ? pathDesk.join('C:', 'Users', 'Public', 'Desktop')
      : null;

    const desks = [userDesk];
    if (publicDesk && fsDesk.existsSync(publicDesk)) desks.push(publicDesk);

    const seen = new Set(); // 去重

    // 先收集所有文件项
    const allItems = []; // { name, fullPath, isDir, ext }
    for (const deskPath of desks) {
      if (!fsDesk.existsSync(deskPath)) continue;
      let entries;
      try {
        entries = fsDesk.readdirSync(deskPath, { withFileTypes: true });
      } catch (e) { continue; }

      for (const entry of entries) {
        const name = entry.name;
        if (name.startsWith('.') || name === 'desktop.ini' || name === 'thumbs.db') continue;
        const fullPath = pathDesk.join(deskPath, name);
        if (seen.has(name)) continue;
        seen.add(name);
        allItems.push({ name, fullPath, isDir: entry.isDirectory(), ext: pathDesk.extname(name).toLowerCase() });
      }
    }

    // ===== 批量提取图标 =====
    // 用 SHGetFileInfo（资源管理器同款 API）：直接传文件/.lnk 路径，
    // Windows 自动解析快捷方式返回目标应用的真实图标，与桌面显示完全一致。
    let iconMap = {}; // fullPath -> dataURL
    if (platform.isWin && allItems.length > 0) {
      // 直接用每个文件的完整路径（.lnk 也直接传，SHGetFileInfo 会自动解析）
      const sourcePaths = allItems.map(it => it.fullPath);
      iconMap = await extractIconsBatch(sourcePaths);
    }

    // 构建 result，补充 emoji 后备
    const emojiMap = { '.lnk':'🚀','.exe':'⚙️','.txt':'📝','.doc':'📄','.docx':'📄','.pdf':'📕','.xls':'📊','.xlsx':'📊','.ppt':'📽️','.pptx':'📽️','.zip':'📦','.rar':'📦','.7z':'📦','.mp4':'🎬','.mkv':'🎬','.avi':'🎬','.mp3':'🎵','.jpg':'🖼️','.jpeg':'🖼️','.png':'🖼️','.gif':'🖼️','.bmp':'🖼️','.html':'🌐','.js':'📜','.json':'📋' };

    for (const it of allItems) {
      let icon = iconMap[it.fullPath] || '';
      // Windows: SHGetFileInfo 失败时用 getFileIcon 兜底
      // Linux/Mac: 直接用 getFileIcon（SHGetFileInfo 不可用）
      if (!icon) {
        try {
          const img = await app.getFileIcon(it.fullPath, { size: 'normal' });
          if (img && !img.isEmpty()) icon = img.toDataURL();
        } catch (e) {}
      }
      // Linux .desktop 文件：解析 Icon 字段，从图标主题查找正确图标
      if (!icon && platform.isLinux && it.ext === '.desktop') {
        icon = resolveLinuxDesktopIcon(it.fullPath);
      }
      // 最终 emoji 后备
      if (!icon) icon = emojiMap[it.ext] || '📄';

      const item = { name: it.name, path: it.fullPath, icon };

      if (it.isDir) {
        result.folders.push(item);
      } else if (['.lnk', '.exe', '.desktop', '.app'].includes(it.ext)) {
        // .lnk 可能指向文件夹（如"桌面文件.lnk"指向某目录）
        if (it.ext === '.lnk' && platform.isWin) {
          try {
            const lnk = shell.readShortcutLink(it.fullPath);
            if (lnk.target && fsDesk.statSync(lnk.target).isDirectory()) {
              result.folders.push(item);
            } else {
              result.apps.push(item);
            }
          } catch (e) {
            result.apps.push(item);
          }
        } else {
          result.apps.push(item);
        }
      } else {
        result.files.push(item);
      }
    }

    return result;
  }
}
