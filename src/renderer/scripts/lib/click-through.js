/* ============================================================
   区域穿透控制（renderer 事件驱动）
   - 用 mouseover/mouseout 检测鼠标进出交互元素
   - 零 IPC 开销，零延迟，不闪烁不卡顿
   ============================================================ */

const ClickThrough = {
  _supported: true,
  _currentIgnore: true,
  _pending: false,
  _lastX: 0,
  _lastY: 0,

  async init() {
    if (window.dashboard && window.dashboard.getPlatformInfo) {
      try {
        const info = await window.dashboard.getPlatformInfo();
        this._supported = info.clickThroughSupported !== false;
      } catch (e) { this._supported = true; }
    }

    if (!this._supported) {
      if (window.dashboard && window.dashboard.setMouseIgnore) {
        window.dashboard.setMouseIgnore(false);
      }
      return;
    }

    // 默认穿透
    this._setIgnore(true);

    // mousemove + requestAnimationFrame 节流：
    // 比 mouseover/mouseout 更平滑（每帧最多检查一次），避免在密集交互区
    // （如 links 列表）事件频繁触发导致 setIgnoreMouseEvents 震荡卡顿。
    document.addEventListener('mousemove', (e) => {
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      if (this._pending) return;
      this._pending = true;
      requestAnimationFrame(() => {
        this._pending = false;
        if (document.body.classList.contains('interactive')) return;
        const el = document.elementFromPoint(this._lastX, this._lastY);
        this._setIgnore(!this._isInteractive(el));
      });
    });
  },

  _isInteractive(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (['input', 'button', 'a', 'select', 'textarea'].includes(tag)) return true;
    if (el.contentEditable === 'true') return true;
    if (el.classList && el.classList.contains('no-drag')) return true;
    if (el.closest) {
      return !!el.closest('input, button, a, select, textarea, .no-drag, [contenteditable], #grass-deco');
    }
    return false;
  },

  _setIgnore(ignore) {
    if (ignore === this._currentIgnore) return;
    this._currentIgnore = ignore;
    if (window.dashboard && window.dashboard.setMouseIgnore) {
      window.dashboard.setMouseIgnore(ignore);
    }
  },

  reset() {
    this._currentIgnore = null;
  }
};
