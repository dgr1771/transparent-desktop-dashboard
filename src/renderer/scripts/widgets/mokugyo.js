/* 敲木鱼：轻量点击反馈 + 功德持久化 + 自动敲击 */
const MokugyoWidget = {
  _autoRunning: false,
  _autoTimer: null,

  init() {
    this._render();
    const inner = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
    if (!inner) return;
    inner.querySelector('#mokugyo-hit').addEventListener('click', () => this._hit(inner));
    this._applyCustomImage();
  },

  /** 从独立文件加载自定义木鱼图（数据不塞 config，避免配置膨胀） */
  async _applyCustomImage() {
    if (!Store.get('customMokugyoImage') || !window.dashboard || !window.dashboard.customImageLoad) return;
    const dataUrl = await window.dashboard.customImageLoad('mokugyo');
    const img = document.querySelector('.widget[data-widget="mokugyo"] .mokugyo__stage img');
    if (img && dataUrl) img.src = dataUrl;
  },

  /** 保存后刷新木鱼图（不重建 DOM，避免丢失事件绑定） */
  update() {
    if (Store.get('customMokugyoImage')) {
      this._applyCustomImage();
    } else {
      const img = document.querySelector('.widget[data-widget="mokugyo"] .mokugyo__stage img');
      if (img) img.src = 'assets/interactive/mokugyo.png';
    }
  },

  _render() {
    const inner = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
    if (!inner) return;
    const total = Number((Store.get('mokugyo') || {}).merit || 0);
    inner.innerHTML = `
      <div class="mokugyo no-drag">
        <div class="mokugyo__title">🪵 今日敲木鱼
          <span class="mokugyo__auto-btn no-drag" id="mokugyo-auto" title="自动敲击">${this._autoRunning ? '⏸ 停止' : '▶ 自动'}</span>
        </div>
        <button id="mokugyo-hit" class="mokugyo__stage" aria-label="敲一下木鱼">
          <img src="assets/interactive/mokugyo.png" alt="可爱的木鱼">
          <span class="mokugyo__hammer" aria-hidden="true"></span>
          <span class="mokugyo__impact" aria-hidden="true">✦</span>
          <span class="mokugyo__sparkle">✦</span>
        </button>
        <div class="mokugyo__merit">功德 <b id="mokugyo-count">${total}</b></div>
        <div class="mokugyo__hint">点击一下，功德加一</div>
      </div>`;
    // 自动敲击按钮（重渲染后保持状态）
    const autoBtn = inner.querySelector('#mokugyo-auto');
    if (autoBtn) autoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleAuto();
    });
  },

  /** 自动敲击开关：每 1.5 秒敲一下 */
  _toggleAuto() {
    if (this._autoRunning) {
      this._stopAuto();
    } else {
      this._startAuto();
    }
    const btn = document.querySelector('.widget[data-widget="mokugyo"] #mokugyo-auto');
    if (btn) btn.textContent = this._autoRunning ? '⏸ 停止' : '▶ 自动';
  },

  _startAuto() {
    this._autoRunning = true;
    const inner = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
    if (!inner) return;
    this._hit(inner);
    this._autoTimer = setInterval(() => {
      const el = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
      if (el) this._hit(el);
    }, 1500);
    if (window.__dashboard && window.__dashboard.timers) {
      window.__dashboard.timers.mokugyo_auto = this._autoTimer;
    }
  },

  _stopAuto() {
    this._autoRunning = false;
    if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
    if (window.__dashboard && window.__dashboard.timers) {
      delete window.__dashboard.timers.mokugyo_auto;
    }
  },

  _hit(inner) {
    const cfg = Store.get('mokugyo') || {};
    cfg.merit = Number(cfg.merit || 0) + 1;
    cfg.lastHit = Date.now();
    Store.set('mokugyo', cfg);
    const stage = inner.querySelector('#mokugyo-hit');
    const count = inner.querySelector('#mokugyo-count');
    if (count) count.textContent = cfg.merit;
    if (stage) {
      stage.classList.remove('mokugyo--hit');
      void stage.offsetWidth;
      stage.classList.add('mokugyo--hit');
    }
    const plus = document.createElement('span');
    plus.className = 'mokugyo__plus';
    plus.textContent = '+1 功德';
    inner.querySelector('.mokugyo').appendChild(plus);
    setTimeout(() => plus.remove(), 900);
  }
};
