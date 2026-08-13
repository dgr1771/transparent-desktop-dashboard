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
let _gdi32 = null;
let _gdiplus = null;
let _gdiplusToken = null;
let _pngClsid = null;

function getUser32() {
  if (_user32) return _user32;
  const koffi = require('koffi');
  const u = koffi.load('user32.dll');
  const ICONINFO = koffi.struct('ICONINFO', {
    fIcon: 'int32', xHotspot: 'uint32', yHotspot: 'uint32',
    hbmMask: 'void *', hbmColor: 'void *',
  });
  _user32 = {
    FindWindowA: u.func('void *FindWindowA(const char *cls, const char *win)'),
    FindWindowExA: u.func('void *FindWindowExA(void *parent, void *childAfter, const char *cls, const char *win)'),
    SetParent: u.func('void *SetParent(void *child, void *parent)'),
    SendMessageTimeoutA: u.func('intptr_t SendMessageTimeoutA(void *h, uint msg, uintptr_t w, uintptr_t l, uint flags, uint timeout, void *result)'),
    SetWindowPos: u.func('bool SetWindowPos(void *h, void *after, int x, int y, int cx, int cy, uint flags)'),
    GetWindowLongPtrA: u.func('intptr_t GetWindowLongPtrA(void *h, int idx)'),
    SetWindowLongPtrA: u.func('intptr_t SetWindowLongPtrA(void *h, int idx, intptr_t val)'),
    GetIconInfo: u.func('bool GetIconInfo(void *hicon, _Out_ ICONINFO *piconinfo)'),
    DestroyIcon: u.func('bool DestroyIcon(void *hicon)'),
    ICONINFO,
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

/**
 * 嵌入 WorkerW 壁纸层（桌面图标下方），彻底免疫 Show Desktop / Win+D
 * 原理（Rainmeter 同款）：发 0x052C 给 Progman 让它创建 WorkerW，再 SetParent 到 WorkerW。
 * 窗口进入壁纸层后，"显示桌面"只隐藏普通应用窗口，壁纸层窗口和桌面一起保留。
 * 注意：区别于 SetParent 到 Progman（会和桌面图标同级触发 GDI 裁切），WorkerW 在图标下方。
 */
function embedToDesktopLayer(hwnd) {
  try {
    const u = getUser32();
    const progman = u.FindWindowA('Progman', null);
    if (!progman) return false;
    // 1. 触发 Progman 创建 WorkerW
    const res = Buffer.alloc(8);
    u.SendMessageTimeoutA(progman, 0x052C, 0, 0, 0x0002 /*SMTO_NORMAL*/, 1000, res);
    // 2. 找 SHELLDLL_DefView（Progman 的子窗口 = 桌面图标层）
    const defView = u.FindWindowExA(progman, null, 'SHELLDLL_DefView', null);
    if (!defView) { console.info('[platform] 未找到 SHELLDLL_DefView'); return false; }
    // 3. 找 defView 之后的 WorkerW（壁纸层）
    const workerW = u.FindWindowExA(null, defView, 'WorkerW', null);
    if (!workerW) { console.info('[platform] 未找到 WorkerW'); return false; }
    // 4. 嵌入 WorkerW
    const r = u.SetParent(hwnd, workerW);
    console.info('[platform] 嵌入 WorkerW 壁纸层 ' + (r ? '成功' : 'SetParent 返回空'));
    return !!r;
  } catch (e) {
    console.error('[platform] embedToDesktopLayer failed:', e.message);
    return false;
  }
}

/* ============================================================
   桌面图标提取：koffi SHGetFileInfo + GetDIBits + GDI+
   SHGetFileInfo 系统级 Shell 解析（正确处理 .lnk IconLocation/UWP）。
   弃用有 bug 的 GdipCreateBitmapFromHICON（它丢失 alpha，透明区域变黑框），
   改用 GetIconInfo + GetDIBits 手动读 32bpp 像素：
   - 32bpp 图标：alpha 通道直接可用
   - 老格式（24bpp+掩码）：alpha 全 0 时用掩码推导透明度
   再用 GdipCreateBitmapFromData 重建，SaveImageToFile 输出 PNG。
   ============================================================ */

function getShell32() {
  if (_shell32) return _shell32;
  const koffi = require('koffi');
  const sh = koffi.load('shell32.dll');
  const SHFILEINFOW = koffi.struct('SHFILEINFOW', {
    hIcon: 'void *',
    iIcon: 'int32',
    dwAttributes: 'uint32',
    szDisplayName: 'uint16_t [260]',
    szTypeName: 'uint16_t [80]',
  });
  _shell32 = {
    SHFILEINFOW,
    SHGetFileInfoW: sh.func('uintptr_t SHGetFileInfoW(const char16_t *path, uint32_t attr, _Out_ SHFILEINFOW *psfi, uint32_t cb, uint32_t flags)'),
  };
  return _shell32;
}

function getGdi32() {
  if (_gdi32) return _gdi32;
  const koffi = require('koffi');
  const gd = koffi.load('gdi32.dll');
  const BITMAP = koffi.struct('BITMAP', {
    bmType: 'int32', bmWidth: 'int32', bmHeight: 'int32', bmWidthBytes: 'int32',
    bmPlanes: 'uint16', bmBitsPixel: 'uint16', bmBits: 'void *',
  });
  const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
    biSize: 'uint32', biWidth: 'int32', biHeight: 'int32', biPlanes: 'uint16',
    biBitCount: 'uint16', biCompression: 'uint32', biSizeImage: 'uint32',
    biXPelsPerMeter: 'int32', biYPelsPerMeter: 'int32', biClrUsed: 'uint32', biClrImportant: 'uint32',
  });
  _gdi32 = {
    BITMAP, BITMAPINFOHEADER,
    CreateCompatibleDC: gd.func('void *CreateCompatibleDC(void *hdc)'),
    DeleteDC: gd.func('bool DeleteDC(void *hdc)'),
    DeleteObject: gd.func('bool DeleteObject(void *h)'),
    GetObjectW: gd.func('int32 GetObjectW(void *h, int32 cb, _Out_ BITMAP *pv)'),
    // lpvBits 传 Buffer，API 直接写入；lpbmi 传 header 对象（32bpp 无 color table）
    GetDIBits: gd.func('int32 GetDIBits(void *hdc, void *hbm, uint32 start, uint32 cLines, void *lpvBits, _Inout_ BITMAPINFOHEADER *lpbmi, uint32 usage)'),
  };
  return _gdi32;
}

function getGdiplus() {
  if (_gdiplus) return _gdiplus;
  const koffi = require('koffi');
  const g = koffi.load('gdiplus.dll');
  _gdiplus = {
    GdiplusStartup: g.func('int32 GdiplusStartup(_Out_ uintptr_t *token, const void *input, void *output)'),
    // 从已修正 alpha 的像素数据创建 bitmap（scan0 = top-down BGRA）
    GdipCreateBitmapFromScan0: g.func('int32 GdipCreateBitmapFromScan0(int32 width, int32 height, int32 stride, uint32 format, void *scan0, _Out_ void **bitmap)'),
    GdipSaveImageToFile: g.func('int32 GdipSaveImageToFile(void *image, const char16_t *filename, const void *clsid, void *params)'),
    GdipDisposeImage: g.func('int32 GdipDisposeImage(void *image)'),
    GdiplusShutdown: g.func('void GdiplusShutdown(uintptr_t token)'),
  };
  return _gdiplus;
}

function ensureGdiplus() {
  if (_gdiplusToken !== null) return true;
  try {
    const g = getGdiplus();
    const input = Buffer.alloc(24);
    input.writeUInt32LE(1, 0);
    const tokenOut = [0];
    const status = g.GdiplusStartup(tokenOut, input, null);
    if (status !== 0) { console.error('[icon] GdiplusStartup failed:', status); return false; }
    _gdiplusToken = tokenOut[0];
    _pngClsid = Buffer.alloc(16);
    _pngClsid.writeUInt32LE(0x557CF406, 0);
    _pngClsid.writeUInt16LE(0x1A04, 4);
    _pngClsid.writeUInt16LE(0x11D3, 6);
    _pngClsid[8] = 0x9A; _pngClsid[9] = 0x73; _pngClsid[10] = 0x00; _pngClsid[11] = 0x00;
    _pngClsid[12] = 0xF8; _pngClsid[13] = 0x1E; _pngClsid[14] = 0xF3; _pngClsid[15] = 0x2E;
    return true;
  } catch (e) { console.error('[icon] ensureGdiplus error:', e.message); return false; }
}

/**
 * 提取单个文件/.lnk 的图标，返回 data:image/png;base64,... 或 null
 * 用 GetIconInfo + GetDIBits 手动读像素并修正 alpha，避免 GdipCreateBitmapFromHICON 的黑框 bug
 */
function extractIconViaKoffi(filePath) {
  if (!isWin) return null;
  let hdc = null, hbmColor = null, hbmMask = null, hIcon = null, bitmap = null;
  try {
    if (!ensureGdiplus()) return null;
    const koffi = require('koffi');
    const g = getGdiplus();
    const sh = getShell32();
    const u = getUser32();
    const gd = getGdi32();

    // 1. SHGetFileInfo → HICON
    const SHGFI_ICON = 0x00000100;
    const SHGFI_LARGEICON = 0x00000000;
    const shfi = {};
    sh.SHGetFileInfoW(filePath, 0, shfi, koffi.sizeof(sh.SHFILEINFOW), SHGFI_ICON | SHGFI_LARGEICON);
    hIcon = shfi.hIcon;
    if (!hIcon) return null;

    // 2. GetIconInfo → 颜色位图 + 掩码位图
    const ii = {};
    if (!u.GetIconInfo(hIcon, ii)) return null;
    hbmColor = ii.hbmColor;
    hbmMask = ii.hbmMask;
    if (!hbmColor) return null;

    // 3. 尺寸
    const bm = {};
    gd.GetObjectW(hbmColor, koffi.sizeof(gd.BITMAP), bm);
    const w = bm.bmWidth, h = bm.bmHeight;
    if (w <= 0 || h <= 0 || w > 256 || h > 256) return null;

    // 4. CreateCompatibleDC
    hdc = gd.CreateCompatibleDC(null);
    if (!hdc) return null;
    const stride = w * 4;
    const bi = {
      biSize: 40, biWidth: w, biHeight: h, biPlanes: 1, biBitCount: 32,
      biCompression: 0, biSizeImage: stride * h, biXPelsPerMeter: 0,
      biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
    };

    // 5. 读颜色位图（bottom-up BGRA）
    const colorBuf = Buffer.alloc(stride * h);
    gd.GetDIBits(hdc, hbmColor, 0, h, colorBuf, bi, 0);
    // 读掩码（bottom-up，用于补 alpha）
    const maskBuf = hbmMask ? Buffer.alloc(stride * h) : null;
    if (maskBuf) gd.GetDIBits(hdc, hbmMask, 0, h, maskBuf, bi, 0);

    // 6. 检查 alpha 是否全 0（老格式图标，需用掩码推导透明度）
    let hasAlpha = false;
    for (let i = 3; i < stride * h; i += 4) { if (colorBuf[i] > 0) { hasAlpha = true; break; } }

    // 7. bottom-up → top-down 翻转 + 修正 alpha
    const topDown = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
      const srcRow = y * stride;
      const dstRow = (h - 1 - y) * stride;
      colorBuf.copy(topDown, dstRow, srcRow, srcRow + stride);
    }
    if (!hasAlpha && maskBuf) {
      // 老格式：掩码白(>128)=透明，黑=不透明
      for (let y = 0; y < h; y++) {
        const srcRow = y * stride;
        const dstRow = (h - 1 - y) * stride;
        for (let x = 0; x < w; x++) {
          topDown[dstRow + x * 4 + 3] = maskBuf[srcRow + x * 4] > 128 ? 0 : 255;
        }
      }
    }

    // 8. GdipCreateBitmapFromScan0（top-down BGRA = PixelFormat32bppARGB）
    const PixelFormat32bppARGB = 0x0026200A;
    const bmpOut = [null];
    const st = g.GdipCreateBitmapFromScan0(w, h, stride, PixelFormat32bppARGB, topDown, bmpOut);
    if (st !== 0 || !bmpOut[0]) { console.error('[icon] GdipCreateBitmapFromScan0 failed:', st); return null; }
    bitmap = bmpOut[0];

    // 9. 保存 PNG → base64
    const tmpFile = path.join(os.tmpdir(), 'deskicon-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png');
    const st2 = g.GdipSaveImageToFile(bitmap, tmpFile, _pngClsid, null);
    if (st2 !== 0) { console.error('[icon] GdipSaveImageToFile failed:', st2); return null; }
    const data = fs.readFileSync(tmpFile);
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    return 'data:image/png;base64,' + data.toString('base64');
  } catch (e) {
    console.error('[icon] extract failed:', filePath, e.message);
    return null;
  } finally {
    // 释放所有 GDI 资源，避免句柄泄漏
    try { if (bitmap) getGdiplus().GdipDisposeImage(bitmap); } catch (e) {}
    try { if (hdc) getGdi32().DeleteDC(hdc); } catch (e) {}
    try { if (hbmColor) getGdi32().DeleteObject(hbmColor); } catch (e) {}
    try { if (hbmMask) getGdi32().DeleteObject(hbmMask); } catch (e) {}
    try { if (hIcon) getUser32().DestroyIcon(hIcon); } catch (e) {}
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
      // GWLP_HWNDPARENT 设置 Owner=Progman（不用 SetParent，避免 GDI 裁切桌面图标）
      // 注意：25H2 的 RaisedDesktop 模型下 WorkerW 壁纸嵌入无效，用 Owner + 模拟Win+D 恢复
      try {
        const u = getUser32();
        const hwnd = getHwnd(win);
        const progman = u.FindWindowA('Progman', null);
        if (progman) {
          u.SetWindowLongPtrA(hwnd, -8 /*GWLP_HWNDPARENT*/, progman);
          const GWL_EXSTYLE = -20;
          const WS_EX_TOOLWINDOW = 0x00000080;
          const WS_EX_APPWINDOW = 0x00040000;
          let ex = Number(u.GetWindowLongPtrA(hwnd, GWL_EXSTYLE));
          ex = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
          u.SetWindowLongPtrA(hwnd, GWL_EXSTYLE, ex);
          win.hookWindowMessage(0x0112, (wParam) => {
            if ((wParam.readUInt32LE(0) & 0xFFF0) === 0xF020) return true;
          });
          console.info('[platform] Owner=Progman + WS_EX_TOOLWINDOW');
        }
      } catch (e) { console.error('[platform] init failed:', e.message); }
    }
  },

  setWindowLevel(win, interactive) {
    if (isMac) { win.setAlwaysOnTop(true, 'floating'); }
    else if (isWin) {
      if (interactive) { win.setAlwaysOnTop(true, 'screen-saver'); win.show(); }
      else { win.setAlwaysOnTop(false); win.showInactive(); }
    } else {
      win.setAlwaysOnTop(false); win.showInactive();
    }
  },

  setClickThrough(win, ignore) {
    if (isLinux) {
      try { win.setIgnoreMouseEvents(ignore); } catch (e) {}
    } else {
      try { win.setIgnoreMouseEvents(ignore, { forward: true }); } catch (e) {}
    }
  },

  /** 模拟 Win+D（toggle "显示桌面"状态）。
   *  25H2 上点"显示桌面"用 DWM 层隐藏看板（isVisible 仍 true，show/restore 无效），
   *  唯一恢复方式是再 toggle 一次退出该状态。检测到 document.hidden=true 时调用。 */
  simulateWinD() {
    if (!isWin) return;
    try {
      const koffi = require('koffi');
      const uu = koffi.load('user32.dll');
      const keybd_event = uu.func('void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)');
      const VK_LWIN = 0x5B, VK_D = 0x44, KEYEVENTF_KEYUP = 0x0002;
      keybd_event(VK_LWIN, 0, 0, 0);
      keybd_event(VK_D, 0, 0, 0);
      keybd_event(VK_D, 0, KEYEVENTF_KEYUP, 0);
      keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
      console.info('[platform] 模拟 Win+D（恢复显示桌面状态）');
    } catch (e) { console.error('[platform] simulateWinD failed:', e.message); }
  },

  isTraySupported() { return !isLinux || process.env.XDG_CURRENT_DESKTOP !== undefined; },
  setDesktopIconsHidden(hide) {},
};
