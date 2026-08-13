'use strict';

/**
 * 平台适配层
 * 统一封装 Windows / macOS / Linux 的窗口行为差异
 */

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

module.exports = {
  isMac,
  isWin,
  isLinux,

  /**
   * 是否需要在 app ready 前禁用硬件加速
   */
  shouldDisableHardwareAcceleration() {
    return isMac;
  },

  /**
   * 主窗口的 BrowserWindow 配置
   */
  getMainWindowOptions() {
    const base = {
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
    };
    if (isMac) {
      return { ...base, vibrancy: 'under-window', visualEffectState: 'active', roundedCorners: true };
    }
    return base;
  },

  initWindowForPlatform(win) {
    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { transformProcessType: false });
      win.setAlwaysOnTop(true, 'floating');
    } else if (isWin) {
      // 使用 koffi 直接调用 Win32 API 挂载到 WorkerW 桌面壁纸层
      // 这是解决 Win+D 问题的正确方案：
      // 1. 正确读取 64 位 HWND（之前 readInt32LE 会截断导致 SetParent 失败）
      // 2. 剥离 WS_EX_APPWINDOW + 添加 WS_EX_TOOLWINDOW
      // 3. SetParent 到 WorkerW（Win+D 的 ShowDesktop 跳过子窗口）
      try {
        const koffi = require('koffi');
        const user32 = koffi.load('user32.dll');
        const FindWindowA = user32.func('void *FindWindowA(const char *lpClassName, const char *lpWindowName)');
        const FindWindowExA = user32.func('void *FindWindowExA(void *hWndParent, void *hWndChildAfter, const char *lpszClass, const char *lpszWindow)');
        const SetParent = user32.func('void *SetParent(void *hWndChild, void *hWndNewParent)');
        const SendMessageTimeoutA = user32.func('intptr_t SendMessageTimeoutA(void *hWnd, uint Msg, uintptr_t wParam, uintptr_t lParam, uint fuFlags, uint uTimeout, void *lpdwResult)');
        const GetWindowLongPtrA = user32.func('intptr_t GetWindowLongPtrA(void *hWnd, int nIndex)');
        const SetWindowLongPtrA = user32.func('intptr_t SetWindowLongPtrA(void *hWnd, int nIndex, intptr_t dwNewLong)');

        // 1. 正确读取 64 位 HWND（关键修复！）
        const buf = win.getNativeWindowHandle();
        const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);

        // 2. 找 WorkerW
        const progman = FindWindowA('Progman', null);
        if (progman) {
          // 触发 WorkerW 创建
          SendMessageTimeoutA(progman, 0x052C, 0, 0, 0, 1000, null);

          let workerW = null;
          let curr = FindWindowExA(null, null, 'WorkerW', null);
          while (curr) {
            const shellView = FindWindowExA(curr, null, 'SHELLDLL_DefView', null);
            if (shellView) {
              workerW = FindWindowExA(null, curr, 'WorkerW', null);
              break;
            }
            curr = FindWindowExA(null, curr, 'WorkerW', null);
          }

          const targetParent = workerW || progman;

          // 3. 修改扩展样式
          const GWL_EXSTYLE = -20;
          const WS_EX_TOOLWINDOW = 0x00000080;
          const WS_EX_APPWINDOW = 0x00040000;
          let exStyle = Number(GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
          exStyle = (exStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
          SetWindowLongPtrA(hwnd, GWL_EXSTYLE, exStyle);

          // 4. SetParent 到 WorkerW
          SetParent(hwnd, targetParent);
          console.info('[platform] Window attached to desktop layer (WorkerW)');
        }
      } catch (e) {
        console.error('[platform] koffi attach failed:', e.message);
      }
    }
  },

  setWindowLevel(win, interactive) {
    if (isMac) {
      win.setAlwaysOnTop(true, 'floating');
    } else if (isWin) {
      if (interactive) {
        win.setAlwaysOnTop(true, 'screen-saver');
        win.show();
      } else {
        win.setAlwaysOnTop(false);
        win.showInactive();
      }
    } else {
      if (interactive) {
        win.setAlwaysOnTop(true, 'screen-saver');
        win.show();
      } else {
        win.setAlwaysOnTop(false);
        win.showInactive();
      }
    }
  },

  setClickThrough(win, ignore) {
    if (isLinux) {
      try { win.setIgnoreMouseEvents(ignore, { forward: true }); } catch (e) {}
      return;
    }
    win.setIgnoreMouseEvents(ignore, { forward: true });
  },

  isTraySupported() {
    return !isLinux || process.env.XDG_CURRENT_DESKTOP !== undefined;
  },

  /**
   * 桌面图标显示控制
   * ⚠️ 重要教训：不使用注册表 HideIcons + 重启 Explorer 的方式
   *   （Explorer 重启会从内存缓存覆盖注册表，导致无法恢复）
   *
   * 新方案：完全不隐藏桌面原始图标。
   *   看板只是"读取并展示"桌面文件，不动桌面图标。
   *   用户如果想要干净桌面，可以自己在桌面右键关闭图标显示。
   *   退出看板后桌面保持原样（因为从没改过）。
   */
  setDesktopIconsHidden(hide) {
    // 不再操作桌面图标显示——避免无法恢复的风险
    // 看板只读取桌面文件，不修改桌面图标状态
  },
};
