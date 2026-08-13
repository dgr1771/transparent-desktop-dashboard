'use strict';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

const fs = require('fs');
const path = require('path');
const os = require('os');

let _user32 = null;
let _winHwnds = new Map();
let _shell32 = null;
let _gdiplus = null;
let _gdiplusToken = null;
let _pngClsid = null;

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
    DestroyIcon: u.func('bool DestroyIcon(void *hicon)'),
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

/* ============================================================
   桌面图标提取：koffi SHGetFileInfo + GDI+
   SHGetFileInfo 是系统级 Shell 解析，正确处理 .lnk（含自定义 IconLocation）、
   UWP 应用、.url 等，比 Electron getFileIcon 全面可靠。
   GDI+ 的 GdipCreateBitmapFromHICON 自动处理 alpha/掩码，HICON→PNG 一步到位。
   ============================================================ */

function getShell32() {
  if (_shell32) return _shell32;
  const koffi = require('koffi');
  const sh = koffi.load('shell32.dll');
  // SHFILEINFOW（必须完整定义，保证内存对齐）
  const SHFILEINFOW = koffi.struct('SHFILEINFOW', {
    hIcon: 'void *',
    iIcon: 'int32',
    dwAttributes: 'uint32',
    szDisplayName: 'uint16_t [260]',
    szTypeName: 'uint16_t [80]',
  });
  _shell32 = {
    SHFILEINFOW,
    // 传文件/.lnk 路径，SHGetFileInfo 自动解析返回正确图标（HICON 存于 psfi.hIcon）
    SHGetFileInfoW: sh.func('uintptr_t SHGetFileInfoW(const char16_t *path, uint32_t attr, _Out_ SHFILEINFOW *psfi, uint32_t cb, uint32_t flags)'),
  };
  return _shell32;
}

function getGdiplus() {
  if (_gdiplus) return _gdiplus;
  const koffi = require('koffi');
  const g = koffi.load('gdiplus.dll');
  _gdiplus = {
    GdiplusStartup: g.func('int32 GdiplusStartup(_Out_ uintptr_t *token, const void *input, void *output)'),
    GdipCreateBitmapFromHICON: g.func('int32 GdipCreateBitmapFromHICON(void *hicon, _Out_ void **bitmap)'),
    GdipSaveImageToFile: g.func('int32 GdipSaveImageToFile(void *image, const char16_t *filename, const void *clsid, void *params)'),
    GdipDisposeImage: g.func('int32 GdipDisposeImage(void *image)'),
    GdiplusShutdown: g.func('void GdiplusShutdown(uintptr_t token)'),
  };
  return _gdiplus;
}

// 初始化 GDI+（进程级，只需一次）
function ensureGdiplus() {
  if (_gdiplusToken !== null) return true;
  try {
    const g = getGdiplus();
    // GdiplusStartupInput：GdiplusVersion=1，其余 0（x64 对齐后 24 字节）
    const input = Buffer.alloc(24);
    input.writeUInt32LE(1, 0);
    const tokenOut = [0];
    const status = g.GdiplusStartup(tokenOut, input, null);
    if (status !== 0) { console.error('[icon] GdiplusStartup failed:', status); return false; }
    _gdiplusToken = tokenOut[0];
    // PNG 编码器 CLSID: {557CF406-1A04-11D3-9A73-0000F81EF32E}
    _pngClsid = Buffer.alloc(16);
    _pngClsid.writeUInt32LE(0x557CF406, 0);
    _pngClsid.writeUInt16LE(0x1A04, 4);
    _pngClsid.writeUInt16LE(0x11D3, 6);
    _pngClsid[8] = 0x9A; _pngClsid[9] = 0x73; _pngClsid[10] = 0x00; _pngClsid[11] = 0x00;
    _pngClsid[12] = 0xF8; _pngClsid[13] = 0x1E; _pngClsid[14] = 0xF3; _pngClsid[15] = 0x2E;
    return true;
  } catch (e) { console.error('[icon] ensureGdiplus error:', e.message); return false; }
}

/** 提取单个文件/.lnk 的图标，返回 data:image/png;base64,... 或 null */
function extractIconViaKoffi(filePath) {
  if (!isWin) return null;
  try {
    if (!ensureGdiplus()) return null;
    const koffi = require('koffi');
    const g = getGdiplus();
    const sh = getShell32();
    const u = getUser32();

    const SHGFI_ICON = 0x00000100;
    const SHGFI_LARGEICON = 0x00000000;
    const shfi = {};
    sh.SHGetFileInfoW(filePath, 0, shfi, koffi.sizeof(sh.SHFILEINFOW), SHGFI_ICON | SHGFI_LARGEICON);
    const hIcon = shfi.hIcon;
    if (!hIcon) return null;

    // HICON → GDI+ Bitmap → PNG 文件 → base64
    const bitmapOut = [null];
    const st = g.GdipCreateBitmapFromHICON(hIcon, bitmapOut);
    u.DestroyIcon(hIcon);
    if (st !== 0 || !bitmapOut[0]) return null;

    const tmpFile = path.join(os.tmpdir(), 'deskicon-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png');
    const st2 = g.GdipSaveImageToFile(bitmapOut[0], tmpFile, _pngClsid, null);
    g.GdipDisposeImage(bitmapOut[0]);
    if (st2 !== 0) return null;

    const data = fs.readFileSync(tmpFile);
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    return 'data:image/png;base64,' + data.toString('base64');
  } catch (e) {
    console.error('[icon] extract failed:', filePath, e.message);
    return null;
  }
}

module.exports = {
  isMac, isWin, isLinux,
  extractIconViaKoffi,

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
      // SetParent 会让窗口变成 Progman 的子窗口，触发 GDI 裁切 bug（桌面图标消失）。
      // GWLP_HWNDPARENT 只设 Owner，窗口仍是独立顶层，DWM 独立渲染。
      try {
        const u = getUser32();
        const hwnd = getHwnd(win);
        const progman = u.FindWindowA('Progman', null);
        if (progman) {
          const GWLP_HWNDPARENT = -8;
          u.SetWindowLongPtrA(hwnd, GWLP_HWNDPARENT, progman);
          const GWL_EXSTYLE = -20;
          const WS_EX_TOOLWINDOW = 0x00000080;
          const WS_EX_APPWINDOW = 0x00040000;
          let ex = Number(u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
          ex = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
          u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex);
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
