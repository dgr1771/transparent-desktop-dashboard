/* ============================================================
   区域穿透控制
   - 穿透模式下：鼠标在卡片上 → 该区域不穿透（可交互）；在空白 → 穿透到桌面
   - 编辑模式下：整个窗口可交互（此模块不干预）

   实现方式（双保险）：
   1. mousemove（forward:true 下即使穿透也收到）→ 用 elementFromPoint 判断
   2. 卡片 pointerover/pointerout → 进入/离开卡片时立即切换
   ============================================================ */

const ClickThrough = {
  _currentIgnore: true,   // 当前穿透状态
  _onWidgetCount: 0,      // 当前指针在卡片上的计数（用于 pointerover/out）
  _supported: true,       // 当前平台是否支持穿透（Linux 不支持）

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

    // 不支持穿透的平台（Linux）：整窗始终可交互，不做穿透切换
    // 原因：Linux setIgnoreMouseEvents 频繁切换会导致输入框无法获取焦点
    // 配合窗口"不置顶+避开任务栏"，Linux 用户体验可接受
    if (!this._supported) {
      console.log('[ClickThrough] 当前平台不支持穿透，整窗可交互（输入正常）');
      // 确保窗口处于可接收事件状态
      if (window.dashboard && window.dashboard.setMouseIgnore) {
        window.dashboard.setMouseIgnore(false);
      }
      return;
    }

    // 主检测：mousemove（forward 模式保证穿透时也能收到）
    // 这是唯一可靠的检测方式（pointerover/out 在穿透模式下不可靠）
    document.addEventListener('mousemove', (e) => this._handleMove(e), { passive: true });

    // 启动时强制设置初始穿透状态（不依赖缓存）
    // 主进程 setInteractionMode(false) 已设了 setIgnoreMouseEvents(true)，
    // 但渲染进程需要同步自己的状态，并确保 main 的状态没被后续操作覆盖。
    setTimeout(() => this._forceResync(), 500);
    setTimeout(() => this._forceResync(), 2000);
    setTimeout(() => this._forceResync(), 5000);

    // 补充：卡片进入/离开（更跟手）
    document.addEventListener('pointerover', (e) => {
      if (e.target.closest && e.target.closest('.widget')) {
        this._onWidgetCount++;
        this._update();
      }
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest && e.target.closest('.widget')) {
        this._onWidgetCount = Math.max(0, this._onWidgetCount - 1);
        this._update();
      }
    });

    // 离开窗口恢复穿透
    document.addEventListener('mouseleave', () => {
      this._onWidgetCount = 0;
      this._setIgnore(true);
    });

    // 定期重新应用穿透状态（保险）：
    // Windows 的 setIgnoreMouseEvents 状态在某些情况下会被重置
    // （窗口失焦/恢复/层级变化），导致空白区域不再穿透。
    // 每 2 秒强制同步一次，确保穿透不丢失。
    setInterval(() => {
      if (document.body.classList.contains('interactive')) return; // 编辑模式不管
      // 重新检测当前指针位置下的元素
      this._forceResync();
    }, 2000);
  },

  /** 强制重新同步穿透状态（绕过缓存） */
  _forceResync() {
    this._currentIgnore = null; // 清除缓存，强制下次 _setIgnore 生效
    this._update();
  },

  _handleMove(e) {
    // 编辑模式：完全可交互
    if (document.body.classList.contains('interactive')) {
      this._setIgnore(false);
      return;
    }
    // 穿透模式：elementFromPoint 判断
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const onWidget = !!(el && el.closest && el.closest('.widget'));
    // 同步计数（防止 pointer 事件漏触）
    this._onWidgetCount = onWidget ? 1 : 0;
    this._setIgnore(!onWidget);
  },

  _update() {
    // 编辑模式不干预
    if (document.body.classList.contains('interactive')) {
      this._setIgnore(false);
      return;
    }
    this._setIgnore(this._onWidgetCount === 0);
  },

  _setIgnore(ignore) {
    if (ignore === this._currentIgnore) return;
    this._currentIgnore = ignore;
    if (window.dashboard && window.dashboard.setMouseIgnore) {
      window.dashboard.setMouseIgnore(ignore);
    }
  },

  /**
   * 模式切换时调用，重置状态
   */
  reset() {
    this._onWidgetCount = 0;
    this._currentIgnore = null; // 强制下次 _setIgnore 生效
  }
};
