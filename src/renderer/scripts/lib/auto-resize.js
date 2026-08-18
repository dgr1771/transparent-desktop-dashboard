/* ============================================================
   自动避让引擎
   - 卡片内容变化后，检测高度变化
   - 如果卡片因内容撑高，与下方卡片重叠，自动推开下方卡片
   - 在 widget update 后调用 AutoResize.check(widgetKey)
   ============================================================ */

const AutoResize = {
  _lastHeights: {},   // 记录每个卡片的上次高度
  GAP: 24,             // 卡片间最小间距
  _suspended: false,   // 暂停避让（应用布局方案时防止把刚应用的位置推开）

  /**
   * 暂停自动避让一段时间（应用布局方案后调用，防止 refresh 过程把方案布局推开）
   */
  suspend(duration = 2500) {
    this._suspended = true;
    clearTimeout(this._suspendTimer);
    this._suspendTimer = setTimeout(() => { this._suspended = false; }, duration);
  },

  /**
   * 检查某个卡片的高度变化，推开被遮挡的卡片
   * @param {string} widgetKey - 触发检查的卡片 key（可选，不传则检查全部）
   */
  check(widgetKey) {
    if (this._suspended) return;   // 应用布局方案期间暂停避让
    const widgets = document.querySelectorAll('.widget[data-widget]');
    if (!widgets.length) return;

    // 如果指定了卡片，只检查它的高度变化
    if (widgetKey) {
      const el = document.querySelector(`.widget[data-widget="${widgetKey}"]`);
      if (el) this._checkAndPush(el);
    } else {
      widgets.forEach(el => this._checkAndPush(el));
    }
  },

  /**
   * 检查单个卡片是否变高，推开下方重叠的卡片
   */
  _checkAndPush(el) {
    if (el.style.display === 'none') return;

    const rect = el.getBoundingClientRect();
    const bottom = rect.bottom;
    const left = rect.left;
    const right = rect.right;
    const key = el.dataset.widget;

    // 检测同列（水平重叠）的下方卡片
    document.querySelectorAll('.widget[data-widget]').forEach(other => {
      if (other === el || other.style.display === 'none') return;
      const oRect = other.getBoundingClientRect();
      // 水平有重叠（同列）
      const hOverlap = !(right < oRect.left + 5 || left > oRect.right - 5);
      if (!hOverlap) return;
      // other 在 el 下方
      if (oRect.top >= rect.top - 5) {
        // 检查是否重叠：other.top < el.bottom + GAP
        const minTop = bottom + this.GAP;
        if (oRect.top < minTop) {
          // 推开：调整 other 的 top
          const delta = minTop - oRect.top;
          const curTop = parseInt(other.style.top, 10);
          if (!isNaN(curTop)) {
            other.style.top = (curTop + delta) + 'px';
            // 递归检查被推开的卡片是否又撞到更下面的
            this._checkAndPush(other);
          }
        }
      }
    });
  },

  /**
   * 内容变化后延迟检测（防抖，避免频繁触发）
   */
  _timer: null,
  schedule(widgetKey) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.check(widgetKey);
      // 检查完保存新高度
      this._saveHeights();
    }, 300);
  },

  _saveHeights() {
    document.querySelectorAll('.widget[data-widget]').forEach(el => {
      this._lastHeights[el.dataset.widget] = el.getBoundingClientRect().height;
    });
  }
};
