/* ============================================================
   电子木鱼 - 点击敲击，功德+1，真实音效，解压放松
   ============================================================ */

const WoodfishWidget = {
  _merit: 0,
  _audioCtx: null,
  _autoTimer: null,
  _autoMode: false,

  init() {
    if (window.__dashboard.timers.woodfish) clearInterval(window.__dashboard.timers.woodfish);
    this._merit = Store.get('woodfishMerit') || 0;
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
          <svg class="woodfish__svg no-drag" id="woodfish-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
            <!-- 木鱼主体（椭圆） -->
            <defs>
              <radialGradient id="wf-grad" cx="50%" cy="35%">
                <stop offset="0%" stop-color="#c08850"/>
                <stop offset="50%" stop-color="#a06030"/>
                <stop offset="100%" stop-color="#704020"/>
              </radialGradient>
              <radialGradient id="wf-striker" cx="40%" cy="30%">
                <stop offset="0%" stop-color="#d09060"/>
                <stop offset="100%" stop-color="#80502a"/>
              </radialGradient>
            </defs>
            <!-- 木鱼底座阴影 -->
            <ellipse cx="100" cy="140" rx="75" ry="10" fill="rgba(0,0,0,0.25)"/>
            <!-- 木鱼主体 -->
            <ellipse cx="100" cy="80" rx="75" ry="55" fill="url(#wf-grad)" stroke="#5a3010" stroke-width="2"/>
            <!-- 木鱼开口（中间凹槽） -->
            <ellipse cx="100" cy="80" rx="60" ry="8" fill="none" stroke="#5a3010" stroke-width="3" opacity="0.6"/>
            <!-- 木鱼高光 -->
            <ellipse cx="80" cy="55" rx="30" ry="15" fill="rgba(255,220,150,0.3)"/>
            <!-- 木鱼纹理线条 -->
            <path d="M 40 80 Q 100 50 160 80" fill="none" stroke="#6a3818" stroke-width="1.5" opacity="0.5"/>
            <path d="M 35 90 Q 100 65 165 90" fill="none" stroke="#6a3818" stroke-width="1.5" opacity="0.4"/>
            <path d="M 40 100 Q 100 80 160 100" fill="none" stroke="#6a3818" stroke-width="1.5" opacity="0.3"/>
            <!-- 敲击棒 -->
            <g id="wf-striker-group">
              <rect x="135" y="15" width="8" height="55" rx="4" fill="url(#wf-striker)" stroke="#5a3010" stroke-width="1.5" transform="rotate(25, 139, 42)"/>
              <circle cx="165" cy="8" r="9" fill="url(#wf-striker)" stroke="#5a3010" stroke-width="1.5"/>
            </g>
          </svg>
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

    const svg = el.querySelector('#woodfish-svg');
    const striker = el.querySelector('#wf-striker-group');

    const knock = () => {
      this._knock(svg, striker);
    };

    svg.addEventListener('click', knock);

    // 自动敲击
    el.querySelector('#woodfish-auto').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleAuto();
    });
  },

  _knock(svg, striker) {
    // 功德+1
    this._merit++;
    Store.set('woodfishMerit', this._merit);

    // 更新计数
    const meritEl = document.getElementById('woodfish-merit');
    if (meritEl) meritEl.textContent = `功德 ${this._merit}`;

    // 木鱼晃动动画
    svg.style.transition = 'transform 0.06s';
    svg.style.transform = 'scale(0.92)';
    setTimeout(() => {
      svg.style.transition = 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)';
      svg.style.transform = 'scale(1)';
    }, 60);

    // 敲击棒动画
    if (striker) {
      striker.style.transition = 'transform 0.08s';
      striker.style.transformOrigin = '139px 42px';
      striker.style.transform = 'rotate(45deg)';
      setTimeout(() => {
        striker.style.transition = 'transform 0.2s ease-out';
        striker.style.transform = 'rotate(25deg)';
      }, 80);
    }

    // "功德+1" 浮动文字
    const floatEl = document.getElementById('woodfish-float');
    if (floatEl) {
      const span = document.createElement('span');
      span.className = 'woodfish__float-text';
      span.textContent = '功德+1';
      span.style.left = (30 + Math.random() * 40) + '%';
      floatEl.appendChild(span);
      setTimeout(() => span.remove(), 1200);
    }

    // 播放木鱼音效
    this._playSound();
  },

  /** 用 Web Audio API 合成木鱼音效（不需要外部音频文件）*/
  _playSound() {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const ctx = this._audioCtx;
      const now = ctx.currentTime;

      // 木鱼声 = 短促的击打音 + 共鸣音
      // 1. 击打噪声（瞬态）
      const noise = ctx.createBufferSource();
      const noiseBuf = ctx.createBuffer(1, 800, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 50);

      noise.buffer = noiseBuf;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 2;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
      noise.start(now);

      // 2. 木鱼共鸣（正弦波，快速衰减）
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);

    } catch (e) {}
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
        const svg = document.getElementById('woodfish-svg');
        const striker = document.getElementById('wf-striker-group');
        if (svg) this._knock(svg, striker);
      }, 600);
    }
  }
};
