'use strict';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

let _user32 = null;
let _winHwnds = new Map();

function getUser32() {
  if (_user32) return _user32;
  const koffi = require('koffi');
  const u = koffi.load('user32.dll');
  _user32 = {
    FindWindowA: u.func('void *FindWindowA(const char *cls, const char *win)'),
    SetParent: u.func('void *SetParent(void *child, void *parent)'),
    SendMessageTimeoutA: u.func('intptr_t SendMessageTimeoutA(void *h, uint msg, uintptr_t w, uintptr_t l, uint flags, uint timeout, void *result)'),
    SetWindowPos: u.func('bool SetWindowPos(void *h, void *after, int x, int y, int cx, int cy, uint flags)'),
    GetWindowLongPtrA: u.func('intptr_t GetWindowLongPtrA(void *h, int idx)'),
    SetWindowLongPtrA: u.func('intptr_t SetWindowLongPtrA(void *h, int idx, intptr_t val)'),
  };
  return _user32;
}

function getHwnd(win) {
  if (_winHwnds.has(win.id)) return _winHwnds.get(win.id);
  const buf = win.getNativeWindowHandle();
  const hwnd = process.arch === 'x64' ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
  _winHwnds.set(win.id, hwnd);
  return hwnd;
}

module.exports = {
  isMac, isWin, isLinux,

  shouldDisableHardwareAcceleration() { return isMac; },

  getMainWindowOptions() {
    const base = { frame: false, transparent: true, hasShadow: false, skipTaskbar: true };
    if (isMac) return { ...base, vibrancy: 'under-window', visualEffectState: 'active', roundedCorners: true };
    return base;
  },

  initWindowForPlatform(win) {
    if (isMac) {
      win.setVisibleOnAllWorkspaces(true, { transformProcessType: false });
      win.setAlwaysOnTop(true, 'floating');
    } else if (isWin) {
      try {
        const u = getUser32();
        const hwnd = getHwnd(win);
        const progman = u.FindWindowA('Progman', null);
        if (progman) {
          u.SendMessageTimeoutA(progman, 0x052C, 0, 0, 0, 1000, null);
          u.SetParent(hwnd, progman);
          u.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0043);
          // 默认开启 WS_EX_TRANSPARENT（系统级穿透，让桌面图标正常显示和交互）
          const GWL_EXSTYLE = -20;
          const WS_EX_TRANSPARENT = 0x00000020;
          let ex = Number(u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
          u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex | WS_EX_TRANSPARENT);
          console.info('[platform] Attached to Progman + WS_EX_TRANSPARENT');
        }
      } catch (e) { console.error('[platform] attach failed:', e.message); }
    }
  },

  setWindowLevel(win, interactive) {
    if (isMac) { win.setAlwaysOnTop(true, 'floating'); }
    else { win.showInactive(); }
  },

  setClickThrough(win, ignore) {
    if (isWin) {
      try {
        const u = getUser32();
        const hwnd = getHwnd(win);
        const GWL_EXSTYLE = -20;
        const WS_EX_TRANSPARENT = 0x00000020;
        let ex = Number(u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
        if (ignore) ex = ex | WS_EX_TRANSPARENT;
        else ex = ex & ~WS_EX_TRANSPARENT;
        u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex);
        // 关键：修改样式后必须调 SetWindowPos + SWP_FRAMECHANGED
        // 否则 Windows 不会立即应用新的 WS_EX_TRANSPARENT 状态
        // SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_FRAMECHANGED|SWP_NOACTIVATE = 0x0037
        u.SetWindowPos(hwnd, null, 0, 0, 0, 0, 0x0037);
      } catch (e) {}
    } else if (isLinux) {
      try { win.setIgnoreMouseEvents(ignore); } catch (e) {}
    }
  },

  isTraySupported() { return !isLinux || process.env.XDG_CURRENT_DESKTOP !== undefined; },
  setDesktopIconsHidden(hide) {},
};
