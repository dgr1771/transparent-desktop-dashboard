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
      // 使用 koffi 调用 Win32 API 将窗口嵌入桌面层
      // 方案：SetParent 到 Progman + SetWindowPos HWND_TOP
      // 这样窗口成为桌面容器的一部分：
      //   - Win+D 跳过它（桌面组件不受 ShowDesktop 影响）
      //   - 在桌面图标(SHELLDLL_DefView)上面（卡片可交互）
      //   - 在其他应用窗口下面（不遮挡其他软件）
      try {
        const koffi = require('koffi');
        const user32 = koffi.load('user32.dll');
        const FindWindowA = user32.func('void *FindWindowA(const char *cls, const char *win)');
        const SetParent = user32.func('void *SetParent(void *child, void *parent)');
        const SendMessageTimeoutA = user32.func('intptr_t SendMessageTimeoutA(void *h, uint msg, uintptr_t w, uintptr_t l, uint flags, uint timeout, void *result)');
        const SetWindowPos = user32.func('bool SetWindowPos(void *h, void *after, int x, int y, int cx, int cy, uint flags)');

        // 正确读取 64 位 HWND
        const buf = win.getNativeWindowHandle();
        const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);

        const progman = FindWindowA('Progman', null);
        if (progman) {
          // 触发壁纸分离（确保 Progman 内部结构正确）
          SendMessageTimeoutA(progman, 0x052C, 0, 0, 0, 1000, null);

          // 1. SetParent 到 Progman（成为桌面容器的子窗口）
          SetParent(hwnd, progman);

          // 2. SetWindowPos HWND_TOP：提到桌面图标(SHELLDLL_DefView)上面
          //    HWND_TOP=0, SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW = 0x0043
          SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0043);

          console.info('[platform] Window attached to Progman + positioned above desktop icons');
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
