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
      // 关键方案：GWLP_HWNDPARENT 设置 Owner（不是 SetParent！）
      // SetParent 会让窗口变成 Progman 的子窗口，和 SHELLDLL_DefView 同级，
      // 导致 GDI 裁切 bug（桌面图标消失）。
      // GWLP_HWNDPARENT 只设 Owner，窗口仍是独立顶层窗口，DWM 独立渲染。
      try {
        const u = getUser32();
        const hwnd = getHwnd(win);
        const progman = u.FindWindowA('Progman', null);
        if (progman) {
          // 1. 设置 Owner = Progman（桌面层归属，Win+D 可能跳过）
          const GWLP_HWNDPARENT = -8;
          u.SetWindowLongPtrA(hwnd, GWLP_HWNDPARENT, progman);
          // 2. 设置 WS_EX_TOOLWINDOW（不在 Alt+Tab/任务栏出现）
          const GWL_EXSTYLE = -20;
          const WS_EX_TOOLWINDOW = 0x00000080;
          const WS_EX_APPWINDOW = 0x00040000;
          let ex = Number(u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
          ex = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
          u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex);
          // 3. 拦截 WM_SYSCOMMAND 的 SC_MINIMIZE
          win.hookWindowMessage(0x0112, (wParam) => {
            if ((wParam.readUInt32LE(0) & 0xFFF0) === 0xF020) return true;
          });
          console.info('[platform] Owner=Progman + WS_EX_TOOLWINDOW + hookWM_SYSCOMMAND');
        }
      } catch (e) { console.error('[platform] init failed:', e.message); }
    }
  },

  setWindowLevel(win, interactive) {
    if (isMac) { win.setAlwaysOnTop(true, 'floating'); }
    else if (isWin) {
      // 普通窗口：交互时置顶，非交互时不置顶
      if (interactive) { win.setAlwaysOnTop(true, 'screen-saver'); win.show(); }
      else { win.setAlwaysOnTop(false); win.showInactive(); }
    } else {
      win.setAlwaysOnTop(false); win.showInactive();
    }
  },

  setClickThrough(win, ignore) {
    // 使用 Electron 原生 setIgnoreMouseEvents（已验证可靠，不干扰桌面图标）
    if (isLinux) {
      try { win.setIgnoreMouseEvents(ignore); } catch (e) {}
    } else {
      try { win.setIgnoreMouseEvents(ignore, { forward: true }); } catch (e) {}
    }
  },

  isTraySupported() { return !isLinux || process.env.XDG_CURRENT_DESKTOP !== undefined; },
  setDesktopIconsHidden(hide) {},
};
