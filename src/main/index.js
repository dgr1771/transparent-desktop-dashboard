'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
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
app.isQuiting = false;  // 标记是否用户主动退出（防止 Alt+Space 关闭）

// 交互模式：false=鼠标穿透（透明壁纸），true=编辑模式（可交互）
let interactionMode = false;
let _protectionStarted = false;        // startProtectionTimers 防重入（避免 createAllWindows 重复调用叠加定时器）
let _displayEventsRegistered = false;  // registerDisplayEvents 防重入
let _lastWinDRecover = 0;              // 上次模拟 Win+D 恢复的时间戳（冷却防 toggle 震荡）
let keyBlockerProcess = null;

// 是否开发模式（带 --dev 参数启动）
function isDev() {
  return process.argv.includes('--dev') || !app.isPackaged;
}

function setWindowsDShortcutBlocked(blocked) {
  if (!platform.isWin) return;
  if (blocked && keyBlockerProcess && !keyBlockerProcess.killed) return;
  if (!blocked && keyBlockerProcess) {
    try { keyBlockerProcess.kill(); } catch (e) {}
    keyBlockerProcess = null;
    return;
  }
  if (!blocked) return;
  const candidates = [
    path.join(process.resourcesPath || '', 'tools', 'keyblocker.exe'),
    path.join(app.getAppPath(), 'tools', 'keyblocker.exe'),
    path.join(__dirname, '..', '..', 'tools', 'keyblocker.exe'),
    path.join(process.resourcesPath || '', '..', 'tools', 'keyblocker.exe'),
    path.join(process.resourcesPath || '', '..', '..', 'tools', 'keyblocker.exe'),
  ];
  const exePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!exePath) {
    console.error('[keyblocker] helper not found', candidates);
    return;
  }
  keyBlockerProcess = spawn(exePath, [], { windowsHide: true, detached: false, stdio: 'ignore' });
  keyBlockerProcess.on('exit', () => { keyBlockerProcess = null; });
  console.info('[keyblocker] Win+D blocked during interaction mode');
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
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--display-id=${displayId}`]
    }
  });

  // 存储 displayId 到窗口对象，方便后续查找
  win._displayId = displayId;
  win._isPrimary = display.id === screen.getPrimaryDisplay().id;

  // 平台特定的窗口初始化
  platform.initWindowForPlatform(win);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Win+D 防护（三层）
  // 1. minimize preventDefault（拦截 WM_SYSCOMMAND 路径）
  win.on('minimize', (e) => {
    if (win._userHidden) return;
    console.info('[win-d] minimize 事件 → preventDefault+restore');
    e.preventDefault();
    try { win.restore(); } catch (err) {}
  });
  // 2. blur + document.hidden 检测（拦截 ShowDesktop/DWM 隐藏路径）
  win.on('blur', () => {
    if (win._userHidden) return;
    setTimeout(() => {
      if (win.isDestroyed() || win._userHidden) return;
      if (win.isVisible() && !win.isFocused()) {
        win.webContents.executeJavaScript('document.hidden', true).then(hidden => {
          if (hidden && platform.isShowDesktop()) {
            // 真正的 Show Desktop（前台窗口是桌面 Progman + 看板页面隐藏）。
            // simulateWinD 是 toggle，误判会主动最小化所有窗口——加 3 秒冷却防震荡/误触。
            const now = Date.now();
            if (now - _lastWinDRecover > 3000) {
              _lastWinDRecover = now;
              console.info('[win-d] Show Desktop（前台=桌面）→ 模拟 Win+D 恢复');
              platform.simulateWinD();
            }
          }
        }).catch(() => {});
      }
    }, 600);
  });
  // 注：窗口级兜底定时器已移除——与全局 startProtectionTimers 重叠（都检查
  // isMinimized/!isVisible 并 restore），且不保存 id 会在窗口销毁后泄漏。
  // 统一由 startProtectionTimers 兜底（全局遍历 + 重设穿透）。

  // 开发模式：只给主屏窗口开 DevTools
  if (process.argv.includes('--dev') && win._isPrimary) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // 拦截窗口关闭（Alt+Space → 关闭）：阻止意外关闭
  win.on('close', (e) => {
    if (win._userHidden) return;
    if (!app.isQuiting) {
      e.preventDefault();
    }
  });

  win.on('closed', () => {
    platform.untrackHwnd(win);
    windows.delete(displayId);
  });

  windows.set(displayId, win);
}

/**
 * Win+D 防护 + 穿透状态定时器（全局，遍历所有窗口）
 */
function startProtectionTimers() {
  if (_protectionStarted) return;  // 防重入：全局定时器只启动一次
  _protectionStarted = true;
  // Win+D 兜底：type:'desktop' + hookWindowMessage 已在窗口层处理
  // 这里只保留简单的窗口恢复（防止意外最小化）
  if (platform.isWin) {
    setInterval(() => {
      for (const win of windows.values()) {
        if (!win || win.isDestroyed() || win._userHidden) continue;
        if (win.isMinimized() || !win.isVisible()) {
          try {
            win.restore();
            win.showInactive();
            platform.setClickThrough(win, !interactionMode);
          } catch (err) {}
        }
      }
    }, 1000);
  }

  // ===== 区域穿透：renderer 事件驱动 + 低频兜底 =====
  // 渲染进程通过 mouseover/mouseout 检测鼠标进出交互元素，发 IPC 给主进程切换穿透
  // 零 IPC 开销（不用 executeJavaScript），零延迟，不闪烁不卡顿
  if (platform.isWin || platform.isLinux) {
    // 低频兜底：每 2 秒检查一次窗口状态（防止 renderer 事件丢失）
    setInterval(() => {
      if (interactionMode) return;
      for (const win of windows.values()) {
        if (!win || win.isDestroyed() || win._userHidden) continue;
        // 只在窗口被最小化/隐藏时恢复（正常情况下不干预）
        if (win.isMinimized() || !win.isVisible()) {
          try { win.restore(); win.showInactive(); } catch (e) {}
        }
      }
    }, 2000);
  }
}

/**
 * 监听显示器热插拔事件
 */
function registerDisplayEvents() {
  if (_displayEventsRegistered) return;  // 防重入：screen 监听只注册一次
  _displayEventsRegistered = true;
  screen.on('display-added', (_e, display) => {
    createWindowForDisplay(display);
  });

  screen.on('display-removed', (_e, display) => {
    const win = windows.get(display.id);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    windows.delete(display.id);
  });

  screen.on('display-metrics-changed', (_e, display, _changedMetrics) => {
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
  setWindowsDShortcutBlocked(interactive);
  if (windows.size === 0) return;

  for (const win of windows.values()) {
    if (!win || win.isDestroyed()) continue;
    // 切换穿透
    platform.setClickThrough(win, !interactive);
    win._cursorIgnore = null;  // 重置缓存
    // 退出编辑模式时重新应用 GWLP_HWNDPARENT（Electron 内部操作可能重置了它）
    if (!interactive && platform.isWin) {
      try {
        platform.initWindowForPlatform(win);
      } catch (e) {}
    }
    if (!platform.isWin) platform.setWindowLevel(win, interactive);
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
/** 显示所有看板窗口（强制恢复，托盘左键/菜单/Ctrl+Shift+H 共用） */
function showAllWindows() {
  for (const win of windows.values()) {
    if (!win || win.isDestroyed()) continue;
    win._userHidden = false;
    try {
      if (win.isMinimized()) win.restore();
      win.show();
      platform.setClickThrough(win, !interactionMode);
    } catch (e) { console.error('[window] show failed:', e.message); }
  }
  updateTrayTooltip(true);
  console.info('[window] showAllWindows 完成');
}

/** 隐藏所有看板窗口 */
function hideAllWindows() {
  for (const win of windows.values()) {
    if (!win || win.isDestroyed()) continue;
    win._userHidden = true;
    try { win.hide(); } catch (e) {}
  }
  updateTrayTooltip(false);
  console.info('[window] hideAllWindows 完成');
}

/** 切换所有窗口显示/隐藏（托盘左键/右键菜单/Ctrl+Shift+H 共用） */
function toggleAllWindows() {
  if (windows.size === 0) { createAllWindows(); setInteractionMode(interactionMode); return; }
  const anyShown = [...windows.values()].some(w => w && !w.isDestroyed() && w.isVisible());
  console.info('[window] toggleAllWindows anyShown=' + anyShown + ' size=' + windows.size);
  if (anyShown) hideAllWindows(); else showAllWindows();
}

/** 更新托盘 tooltip（隐藏时提示恢复方式） */
function updateTrayTooltip(visible) {
  if (!tray) return;
  tray.setToolTip(visible ? '透明桌面看板（左键单击 隐藏/显示）' : '看板已隐藏 — 左键单击托盘恢复');
}

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
    updateTrayTooltip(true);
    tray.on('click', () => toggleAllWindows());
    // 配置保存后（data.js 的 config:set）刷新托盘菜单，布局方案列表保持最新
    global.__refreshTrayMenu = updateTrayMenu;
    console.log('[Tray] 托盘创建成功（左键单击切换显示）');
  } catch (e) {
    console.error('[Tray] 托盘创建失败（可能缺少 libappindicator）:', e.message);
    tray = null;
  }
}

function updateTrayMenu() {
  if (!tray) return;
  // 布局方案子菜单：直接从 config 读取，点击即切换（Rainmeter Layout Profiles 实践）
  const layoutProfiles = (configStore && configStore.getAll().layoutProfiles) || {};
  const profileNames = Object.keys(layoutProfiles);
  const profileMenu = {
    label: '🗂️ 布局方案',
    submenu: profileNames.length > 0
      ? profileNames.map(name => ({
          label: `切换到：${name}`,
          click: () => {
            try {
              const cfg = configStore.getAll();
              cfg.displayLayout = JSON.parse(JSON.stringify(layoutProfiles[name]));
              configStore.setAll(cfg);
              for (const win of windows.values()) {
                if (win && !win.isDestroyed()) {
                  win.webContents.send('config-updated');
                  win.webContents.send('refresh-all');
                }
              }
            } catch (e) { console.error('[layout-profile] 切换失败:', e.message); }
          }
        }))
      : [{ label: '暂无方案（在设置-外观里保存）', enabled: false }]
  };
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
    profileMenu,
    {
      label: '切换编辑/穿透模式 (Ctrl+Shift+D)',
      click: () => toggleInteractionMode(),
      type: 'checkbox',
      checked: interactionMode
    },
    { type: 'separator' },
    {
      label: '显示/隐藏看板（左键单击 或 Ctrl+Shift+H）',
      click: () => toggleAllWindows()
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
        app.isQuiting = true;
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
  const dOk = globalShortcut.register('CommandOrControl+Shift+D', () => toggleInteractionMode());
  console.info('[shortcut] Ctrl+Shift+D ' + (dOk ? '注册成功' : '注册失败'));

  // Ctrl+Shift+H 隐藏/显示所有窗口（检查注册是否成功——失败时可用托盘左键恢复）
  const hOk = globalShortcut.register('CommandOrControl+Shift+H', () => toggleAllWindows());
  console.info('[shortcut] Ctrl+Shift+H ' + (hOk ? '注册成功' : '注册失败（可能被其他程序占用，请用托盘左键单击恢复）'));
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

  // 迁移：旧版 customPlantImage/customMokugyoImage 把 dataURL 塞进 config.json，
  // 新版改为独立文件存储。这里把旧 dataURL 迁移到文件，config 改存 true 标志。
  (function migrateCustomImages() {
    const cfg = configStore.getAll();
    let changed = false;
    const dir = path.join(app.getPath('userData'), 'images');
    for (const [cfgKey, imgKey] of [['customPlantImage', 'plant'], ['customMokugyoImage', 'mokugyo']]) {
      const val = cfg[cfgKey];
      if (typeof val === 'string' && val.startsWith('data:')) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${imgKey}.data`), val);
          cfg[cfgKey] = true;
          changed = true;
          console.info(`[migrate] ${cfgKey} dataURL → 独立文件`);
        } catch (e) { console.error('[migrate] failed:', e.message); }
      }
    }
    if (changed) configStore.setAll(cfg);
  })();

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
  app.isQuiting = true;
  setWindowsDShortcutBlocked(false);
  globalShortcut.unregisterAll();
});

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

  // 透明度实时预览：设置滑块拖动时转发到看板窗口（不持久化，保存时才写）
  ipcMain.on('preview-opacity', (_event, val) => {
    for (const win of windows.values()) {
      if (win && !win.isDestroyed()) win.webContents.send('preview-opacity', val);
    }
  });

  // ===== 自定义图片存储（单独文件，不塞 config.json，避免配置膨胀 + 读写变慢）=====
  const customImageDir = () => path.join(app.getPath('userData'), 'images');
  ipcMain.handle('custom-image:save', (_e, key, dataUrl) => {
    try {
      fs.mkdirSync(customImageDir(), { recursive: true });
      fs.writeFileSync(path.join(customImageDir(), `${key}.data`), dataUrl);
      return true;
    } catch (err) { console.error('[custom-image] save failed:', err.message); return false; }
  });
  ipcMain.handle('custom-image:load', (_e, key) => {
    try {
      const f = path.join(customImageDir(), `${key}.data`);
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    } catch (err) { return null; }
  });
  ipcMain.handle('custom-image:clear', (_e, key) => {
    try { fs.unlinkSync(path.join(customImageDir(), `${key}.data`)); } catch (e) {}
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

  /**
   * 获取真实桌面路径（OneDrive 重定向后用注册表读取）
   */
  let _cachedDesktopPath = null;
  async function getRealDesktopPath() {
    if (_cachedDesktopPath) return _cachedDesktopPath;  // 桌面路径不变，缓存避免重复 reg query
    if (platform.isWin) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const out = await promisify(exec)('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Desktop', { encoding: 'utf8', timeout: 2000 });
        const m = (out.stdout || '').match(/Desktop\s+REG_[A-Z_]+\s+(.+)/);
        if (m) { _cachedDesktopPath = m[1].trim(); return _cachedDesktopPath; }
      } catch (e) {}
      _cachedDesktopPath = pathDesk.join(app.getPath('home'), 'Desktop');
      return _cachedDesktopPath;
    } else if (platform.isLinux) {
      // 优先中文桌面，否则英文
      const cn = pathDesk.join(app.getPath('home'), '桌面');
      _cachedDesktopPath = fsDesk.existsSync(cn) ? cn : pathDesk.join(app.getPath('home'), 'Desktop');
      return _cachedDesktopPath;
    }
    _cachedDesktopPath = app.getPath('desktop');
    return _cachedDesktopPath;
  }

  /**
   * 批量提取桌面图标：优先 koffi SHGetFileInfo（系统级 Shell 解析，正确处理
   * .lnk 含自定义 IconLocation / UWP），失败兜底 Electron getFileIcon。
   * 分批 + setImmediate 让出主进程，避免同步调用连续阻塞。
   */
  async function extractIcons(items) {
    const iconMap = {};
    const batchSize = 6;
    let koffiOk = 0, fallbackOk = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(async (it) => {
        try {
          // 优先 koffi SHGetFileInfo：系统级 Shell 解析，正确处理 .lnk（含自定义
          // IconLocation）、UWP 应用等，比 Electron getFileIcon 全面可靠。
          if (platform.isWin && platform.extractIconViaKoffi) {
            const dataUrl = platform.extractIconViaKoffi(it.fullPath);
            if (dataUrl) { iconMap[it.fullPath] = dataUrl; koffiOk++; return; }
          }
          // 兜底（Linux/Mac 或 koffi 失败）：Electron getFileIcon
          const img = await app.getFileIcon(it.fullPath, { size: 'normal' });
          if (img && !img.isEmpty()) { iconMap[it.fullPath] = img.toDataURL(); fallbackOk++; }
        } catch (e) {}
      }));
      // 让出主进程，避免同步 koffi 调用连续阻塞过久
      await new Promise(r => setImmediate(r));
    }
    console.info(`[icon] 提取完成: koffi成功=${koffiOk} 兜底=${fallbackOk} 共${items.length}项`);
    return iconMap;
  }

  /**
   * 扫描桌面，按类型分类
   */
  async function scanDesktop() {
    const result = { apps: [], folders: [], files: [] };
    // 从注册表读取真实桌面路径（解决 OneDrive 重定向）
    const userDesk = await getRealDesktopPath();
    const publicDesk = platform.isWin
      ? pathDesk.join(process.env.SystemDrive || 'C:', 'Users', 'Public', 'Desktop')
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

    // ===== 批量提取图标：Electron 原生 app.getFileIcon =====
    // Windows 上内部即 SHGetFileInfo，自动解析 .lnk 目标，进程内毫秒级，
    // 彻底去掉 PowerShell 子进程 + C# 编译，零系统依赖、跨用户机器兼容。
    let iconMap = {};
    if (allItems.length > 0) {
      iconMap = await extractIcons(allItems);
    }

    // 构建 result，补充 emoji 后备
    const emojiMap = { '.lnk':'🚀','.exe':'⚙️','.txt':'📝','.doc':'📄','.docx':'📄','.pdf':'📕','.xls':'📊','.xlsx':'📊','.ppt':'📽️','.pptx':'📽️','.zip':'📦','.rar':'📦','.7z':'📦','.mp4':'🎬','.mkv':'🎬','.avi':'🎬','.mp3':'🎵','.jpg':'🖼️','.jpeg':'🖼️','.png':'🖼️','.gif':'🖼️','.bmp':'🖼️','.html':'🌐','.js':'📜','.json':'📋' };

    for (const it of allItems) {
      // getFileIcon 已是主提取方式，失败则用 emoji 后备
      const icon = iconMap[it.fullPath] || emojiMap[it.ext] || '📄';

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
