/* ============================================================
   区域穿透控制
   - 穿透完全由主进程 cursor 轮询控制（200ms executeJavaScript）
   - renderer 端只做平台检测和模式切换时的状态重置
   - 不再注册 mousemove/pointerover/out（避免和主进程冲突）
   ============================================================ */

const ClickThrough = {
  _supported: true,

  async init() {
    // 查询平台能力
    if (window.dashboard && window.dashboard.getPlatformInfo) {
      try {
        const info = await window.dashboard.getPlatformInfo();
        this._supported = info.clickThroughSupported !== false;
      } catch (e) {
        this._supported = true;
      }
    }

    // 不支持穿透的平台（Linux）：整窗可交互
    if (!this._supported) {
      if (window.dashboard && window.dashboard.setMouseIgnore) {
        window.dashboard.setMouseIgnore(false);
      }
      return;
    }
    // Windows：穿透由主进程 cursor 轮询控制，renderer 不干预
  },

  /** 模式切换时调用，重置状态 */
  reset() {}
};
