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
    // Windows：type:'desktop' 让窗口被视为桌面层组件，Win+D 跳过它
    if (isWin) {
      return { ...base, type: 'desktop', focusable: true };
    }
    return base;
  },

  initWindowForPlatform(win) {
    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { transformProcessType: false });
      win.setAlwaysOnTop(true, 'floating');
    } else if (isWin) {
      // 拦截 WM_SYSCOMMAND(0x0112) 的 SC_MINIMIZE(0xF020)
      // 阻止系统最小化命令执行——Win+D 的部分路径会走 WM_SYSCOMMAND
      try {
        win.hookWindowMessage(0x0112, (wParam) => {
          const cmd = wParam.readUInt32LE(0) & 0xFFF0;
          // SC_MINIMIZE = 0xF020
          if (cmd === 0xF020) return true;
        });
      } catch (e) {}
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
