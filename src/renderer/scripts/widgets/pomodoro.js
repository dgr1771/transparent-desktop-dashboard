/* ============================================================
   番茄时钟 Widget - 双样式（进度环 / 指针时钟）+ 不抖动更新
   ============================================================ */

const PomodoroWidget = {
  _state: 'idle',
  _remainSec: 0,
  _totalSec: 0,
  _timer: null,
  _completedCount: 0,
  _showSettings: false,
  _prevState: null,

  _getWorkMin() { return parseInt((Store.get('pomodoro') || {}).workMin, 10) || 25; },
  _getBreakMin() { return parseInt((Store.get('pomodoro') || {}).breakMin, 10) || 5; },
  _getStyle() { return (Store.get('pomodoro') || {}).style || 'ring'; },
  _setStyle(s) {
    const cfg = Store.get('pomodoro') || {};
    cfg.style = s;
    Store.set('pomodoro', cfg);
  },

  init() {
    this._remainSec = this._getWorkMin() * 60;
    this._totalSec = this._getWorkMin() * 60;
    this._render();
  },

  /** 完整渲染（状态/样式变化时调用） */
  _render() {
    const el = document.querySelector('.widget[data-widget="pomodoro"] .widget__inner');
    if (!el) return;
    const stateText = { idle: '准备开始', working: '专注中', break: '休息中', paused: '已暂停' }[this._state] || '';
    const stateClass = { idle: '', working: 'pomo__state--work', break: 'pomo__state--break', paused: 'pomo__state--pause' }[this._state] || '';
    const btnText = (this._state === 'idle' || this._state === 'paused') ? '▶ 开始' : '⏸ 暂停';
    const style = this._getStyle();
    const workMin = this._getWorkMin();
    const breakMin = this._getBreakMin();

    const settingsHtml = this._showSettings ? `
      <div class="pomo__settings no-drag">
        <div class="pomo__style-switch">
          <button class="${style==='ring'?'pomo__style--active':''}" data-style="ring">⭕ 进度环</button>
          <button class="${style==='clock'?'pomo__style--active':''}" data-style="clock">🕐 时钟</button>
        </div>
        <div class="pomo__spinner-group">
          <div class="pomo__spinner-block">
            <div class="pomo__spinner-label">工作（分）</div>
            <div class="pomo__spinner">
              <button class="pomo__spinner-btn" data-spin="work" data-delta="5">▲▲</button>
              <button class="pomo__spinner-btn" data-spin="work" data-delta="1">▲</button>
              <div class="pomo__spinner-val" id="pomo-work-val">${workMin}</div>
              <button class="pomo__spinner-btn" data-spin="work" data-delta="-1">▼</button>
              <button class="pomo__spinner-btn" data-spin="work" data-delta="-5">▼▼</button>
            </div>
          </div>
          <div class="pomo__spinner-block">
            <div class="pomo__spinner-label">休息（分）</div>
            <div class="pomo__spinner">
              <button class="pomo__spinner-btn" data-spin="break" data-delta="5">▲▲</button>
              <button class="pomo__spinner-btn" data-spin="break" data-delta="1">▲</button>
              <div class="pomo__spinner-val" id="pomo-break-val">${breakMin}</div>
              <button class="pomo__spinner-btn" data-spin="break" data-delta="-1">▼</button>
              <button class="pomo__spinner-btn" data-spin="break" data-delta="-5">▼▼</button>
            </div>
          </div>
        </div>
        <div class="pomo__presets">
          <button data-w="25" data-b="5">25/5</button>
          <button data-w="50" data-b="10">50/10</button>
          <button data-w="15" data-b="3">15/3</button>
        </div>
      </div>
    ` : '';

    // 两种显示样式
    const pct = this._totalSec > 0 ? (1 - this._remainSec / this._totalSec) : 0;
    let displayHtml;
    if (style === 'clock') {
      // 指针时钟样式：SVG 表盘 + 分针 + 秒针
      const { minAngle, secAngle } = this._calcAngles();
      const clockColor = (this._state === 'break') ? '#4ade80' : '#f87171';
      displayHtml = `
        <div class="pomo__clock-wrap">
          <svg class="pomo__clock" width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="${clockColor}" stroke-width="3"
                    stroke-dasharray="339.3" stroke-dashoffset="${(339.3*(1-pct)).toFixed(1)}"
                    stroke-linecap="round" transform="rotate(-90 60 60)" id="pomo-clock-ring"/>
            ${this._clockTicks()}
            <line id="pomo-min-hand" x1="60" y1="60" x2="60" y2="28" stroke="${clockColor}" stroke-width="3"
                  stroke-linecap="round" transform="rotate(${minAngle} 60 60)"/>
            <line id="pomo-sec-hand" x1="60" y1="60" x2="60" y2="20" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"
                  stroke-linecap="round" transform="rotate(${secAngle} 60 60)"/>
            <circle cx="60" cy="60" r="4" fill="${clockColor}"/>
          </svg>
          <div class="pomo__digital-time pomo__digital-time--sm ${this._state==='break'?'pomo__digital--break':''}" id="pomo-time-text">${this._fmt(this._remainSec)}</div>
          <div class="pomo__state ${stateClass}">${stateText}</div>
        </div>
      `;
    } else {
      // 进度环样式
      const ringColor = (this._state === 'break') ? '#4ade80' : '#f87171';
      displayHtml = `
        <div class="pomo__ring-wrap">
          <svg class="pomo__ring" width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${ringColor}" stroke-width="6"
                    stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="${(326.7*(1-pct)).toFixed(1)}"
                    transform="rotate(-90 60 60)" id="pomo-ring-fg"/>
          </svg>
          <div class="pomo__time-display">
            <div class="pomo__time" id="pomo-time-text">${this._fmt(this._remainSec)}</div>
            <div class="pomo__state ${stateClass}">${stateText}</div>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="pomo">
        <div class="pomo__header">
          <span>🍅 番茄时钟</span>
          <span class="pomo__header-right">
            <span class="pomo__count">✓${this._completedCount}</span>
            <span class="pomo__gear ${this._showSettings?'pomo__gear--active':''}" id="pomo-gear" title="设置">⚙</span>
          </span>
        </div>
        ${settingsHtml}
        ${displayHtml}
        <div class="pomo__controls no-drag">
          <button class="pomo__btn pomo__btn--primary" id="pomo-toggle">${btnText}</button>
          <button class="pomo__btn" id="pomo-reset">↻</button>
          <button class="pomo__btn" id="pomo-skip" title="跳过">⏭</button>
        </div>
      </div>
    `;
    this._bindEvents();
  },

  /** 时钟刻度（12 个小点） */
  _clockTicks() {
    let s = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * 30) * Math.PI / 180;
      const x1 = 60 + Math.sin(a) * 46, y1 = 60 - Math.cos(a) * 46;
      const x2 = 60 + Math.sin(a) * 50, y2 = 60 - Math.cos(a) * 50;
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
    }
    return s;
  },

  /** 计算指针角度（基于剩余时间，倒计时旋转） */
  _calcAngles() {
    const totalMin = this._totalSec / 60;
    // 分针：随剩余时间从满圈转到0
    const minAngle = (this._remainSec / this._totalSec) * 360;
    // 秒针：在剩余秒数内转一圈
    const secAngle = ((this._remainSec % 60) / 60) * 360;
    return { minAngle: minAngle.toFixed(1), secAngle: secAngle.toFixed(1) };
  },

  /**
   * 轻量更新（每秒 tick 时调用，只改数字和指针，不重建 DOM）
   * 这是解决"窗口跳动"的关键
   */
  _updateDisplay() {
    const el = document.querySelector('.widget[data-widget="pomodoro"] .widget__inner');
    if (!el) return;
    const pct = this._totalSec > 0 ? (1 - this._remainSec / this._totalSec) : 0;
    const ringColor = (this._state === 'break') ? '#4ade80' : '#f87171';

    // 更新时间数字
    const timeEl = el.querySelector('#pomo-time-text');
    if (timeEl) timeEl.textContent = this._fmt(this._remainSec);

    // 更新进度环
    const ringFg = el.querySelector('#pomo-ring-fg');
    if (ringFg) {
      ringFg.setAttribute('stroke-dashoffset', (326.7 * (1 - pct)).toFixed(1));
      ringFg.setAttribute('stroke', ringColor);
    }

    // 更新时钟指针
    const minHand = el.querySelector('#pomo-min-hand');
    const secHand = el.querySelector('#pomo-sec-hand');
    const clockRing = el.querySelector('#pomo-clock-ring');
    if (minHand && secHand) {
      const { minAngle, secAngle } = this._calcAngles();
      minHand.setAttribute('transform', `rotate(${minAngle} 60 60)`);
      minHand.setAttribute('stroke', ringColor);
      secHand.setAttribute('transform', `rotate(${secAngle} 60 60)`);
    }
    if (clockRing) {
      clockRing.setAttribute('stroke-dashoffset', (339.3 * (1 - pct)).toFixed(1));
      clockRing.setAttribute('stroke', ringColor);
    }
  },

  _bindEvents() {
    const el = document.querySelector('.widget[data-widget="pomodoro"] .widget__inner');
    el.querySelector('#pomo-toggle').addEventListener('click', () => this._toggle());
    el.querySelector('#pomo-reset').addEventListener('click', () => this._reset());
    el.querySelector('#pomo-skip').addEventListener('click', () => this._skip());

    el.querySelector('#pomo-gear').addEventListener('click', () => {
      this._showSettings = !this._showSettings;
      this._render();
    });

    el.querySelectorAll('.pomo__style-switch button').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setStyle(btn.dataset.style);
        this._render();
      });
    });

    // 拨轮按钮：调整工作/休息时长
    el.querySelectorAll('.pomo__spinner-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const which = btn.dataset.spin;
        const delta = parseInt(btn.dataset.delta, 10);
        const cfg = Store.get('pomodoro') || {};
        if (which === 'work') {
          cfg.workMin = Math.max(1, Math.min(120, (cfg.workMin || 25) + delta));
        } else {
          cfg.breakMin = Math.max(1, Math.min(60, (cfg.breakMin || 5) + delta));
        }
        Store.set('pomodoro', cfg);
        // 更新显示值
        const valEl = el.querySelector(which === 'work' ? '#pomo-work-val' : '#pomo-break-val');
        if (valEl) valEl.textContent = which === 'work' ? cfg.workMin : cfg.breakMin;
        // 空闲时同步剩余时间
        if (this._state === 'idle') {
          this._remainSec = cfg.workMin * 60;
          this._totalSec = cfg.workMin * 60;
          this._updateDisplay();
        }
      });
    });

    el.querySelectorAll('.pomo__presets button').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.dataset.w, 10);
        const b = parseInt(btn.dataset.b, 10);
        Store.set('pomodoro', { workMin: w, breakMin: b, style: this._getStyle() });
        this._stopTick();
        this._state = 'idle';
        this._remainSec = w * 60;
        this._totalSec = w * 60;
        this._render();
      });
    });
  },

  _toggle() {
    if (this._state === 'idle' || this._state === 'paused') {
      this._state = this._prevState === 'break' ? 'break' : 'working';
      this._startTick();
    } else {
      this._prevState = this._state;
      this._state = 'paused';
      this._stopTick();
    }
    this._render();
  },

  _reset() {
    this._stopTick();
    this._prevState = null;
    this._state = 'idle';
    this._remainSec = this._getWorkMin() * 60;
    this._totalSec = this._getWorkMin() * 60;
    this._render();
  },

  _skip() {
    this._completePhase();
  },

  _startTick() {
    this._stopTick();
    this._timer = setInterval(() => {
      this._remainSec--;
      if (this._remainSec <= 0) {
        this._completePhase();
        return;
      }
      this._updateDisplay();  // 关键：只更新数字和指针，不重建 DOM
    }, 1000);
  },

  _stopTick() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  _completePhase() {
    this._stopTick();
    if (this._state === 'working') {
      this._completedCount++;
      this._state = 'break';
      this._remainSec = this._getBreakMin() * 60;
      this._totalSec = this._getBreakMin() * 60;
      this._notify('专注完成！', `休息 ${this._getBreakMin()} 分钟 ☕`);
      this._startTick();
    } else {
      this._state = 'working';
      this._remainSec = this._getWorkMin() * 60;
      this._totalSec = this._getWorkMin() * 60;
      this._notify('休息结束', `开始 ${this._getWorkMin()} 分钟专注 🍅`);
      this._startTick();
    }
    this._render();
  },

  _notify(title, body) {
    try { new Notification(title, { body }); } catch (e) {}
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
};
