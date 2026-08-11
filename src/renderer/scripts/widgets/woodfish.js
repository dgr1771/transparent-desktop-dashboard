/* ============================================================
   电子木鱼 - 真实木鱼图片 + 真实音效 + 功德计数
   ============================================================ */

const WoodfishWidget = {
  _merit: 0,
  _audio: null,
  _autoTimer: null,
  _autoMode: false,

  init() {
    if (window.__dashboard.timers.woodfish) clearInterval(window.__dashboard.timers.woodfish);
    this._merit = Store.get('woodfishMerit') || 0;
    // 预加载音效
    this._audio = new Audio('assets/woodfish/knock.wav');
    this._audio.preload = 'auto';
    this._render();
  },

  _render() {
    const el = document.querySelector('.widget[data-widget="woodfish"] .widget__inner');
    if (!el) return;

    el.innerHTML = `
      <div class="woodfish">
        <div class="woodfish__header">
          <span>🔔 电子木鱼</span>
          <span class="woodfish__auto-btn no-drag" id="woodfish-auto" title="自动敲击">▶</span>
        </div>
        <div class="woodfish__merit" id="woodfish-merit">功德 ${this._merit}</div>
        <div class="woodfish__body" id="woodfish-body">
          <img class="woodfish__img no-drag" id="woodfish-img"
               src="assets/woodfish/woodfish.png"
               alt="木鱼"
               draggable="false">
          <div class="woodfish__float" id="woodfish-float"></div>
        </div>
        <div class="woodfish__hint">轻触木鱼，积累功德 🙏</div>
      </div>
    `;
    this._bindEvents();
  },

  _bindEvents() {
    const el = document.querySelector('.widget[data-widget="woodfish"] .widget__inner');
    if (!el) return;

    const img = el.querySelector('#woodfish-img');
    if (img) {
      img.addEventListener('click', () => this._knock(img));
    }

    const autoBtn = el.querySelector('#woodfish-auto');
    if (autoBtn) {
      autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleAuto();
      });
    }
  },

  _knock(imgEl) {
    // 功德+1
    this._merit++;
    Store.set('woodfishMerit', this._merit);

    // 更新计数
    const meritEl = document.getElementById('woodfish-merit');
    if (meritEl) meritEl.textContent = `功德 ${this._merit}`;

    // 木鱼缩放动画
    if (imgEl) {
      imgEl.style.transition = 'transform 0.06s';
      imgEl.style.transform = 'scale(0.88)';
      setTimeout(() => {
        imgEl.style.transition = 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)';
        imgEl.style.transform = 'scale(1)';
      }, 60);
    }

    // "功德+1" 浮动文字
    const floatEl = document.getElementById('woodfish-float');
    if (floatEl) {
      const span = document.createElement('span');
      span.className = 'woodfish__float-text';
      span.textContent = '功德+1';
      span.style.left = (25 + Math.random() * 50) + '%';
      floatEl.appendChild(span);
      setTimeout(() => span.remove(), 1200);
    }

    // 播放真实木鱼音效
    this._playSound();
  },

  _playSound() {
    if (this._audio) {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
    }
  },

  _toggleAuto() {
    const btn = document.getElementById('woodfish-auto');
    if (this._autoMode) {
      this._autoMode = false;
      if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
      if (btn) { btn.textContent = '▶'; btn.title = '自动敲击'; }
    } else {
      this._autoMode = true;
      if (btn) { btn.textContent = '⏸'; btn.title = '停止'; }
      this._autoTimer = setInterval(() => {
        const img = document.getElementById('woodfish-img');
        if (img) this._knock(img);
      }, 600);
    }
  }
};
