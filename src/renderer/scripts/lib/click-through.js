/* ============================================================
   区域穿透控制（renderer 事件驱动）
   - 用 mouseover/mouseout 检测鼠标进出交互元素
   - 零 IPC 开销，零延迟，不闪烁不卡顿
   ============================================================ */

const ClickThrough = {
  _supported: true,
  _currentIgnore: true,

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

    // 事件委托：监听整个 document 的 mouseover/mouseout
    // 判断鼠标下是否是交互元素（input/button/a/.no-drag/#grass-deco）
    document.addEventListener('mouseover', (e) => {
      if (document.body.classList.contains('interactive')) return;
      const onInteractive = this._isInteractive(e.target);
      this._setIgnore(!onInteractive);
    });

    document.addEventListener('mouseout', (e) => {
      if (document.body.classList.contains('interactive')) return;
      // 检查鼠标移到了哪里（relatedTarget）
      const related = e.relatedTarget;
      if (!related || related === document.documentElement || related === document.body) {
        // 移出了窗口或到了 body → 穿透
        this._setIgnore(true);
      } else {
        // 还在窗口内，检查新位置是否是交互元素
        const onInteractive = this._isInteractive(related);
        this._setIgnore(!onInteractive);
      }
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
