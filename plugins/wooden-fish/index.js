/* ============================================================
   电子木鱼 · 赛博功德
   - 点击木鱼：功德 +1（基础），连击有节奏加成
   - 今日 / 累计 双统计，每日 0 点自动归零今日
   - 功德热力：最近 7 天柱状
   - 纯前端，无依赖；音效用 WebAudio 合成（无需音频文件）
   ============================================================ */

class WoodenFishPlugin {
  async init(sdk) {
    this.sdk = sdk;
    this._todayKey = this._dateKey();
    this._combo = 0;
    this._comboTimer = null;
    this._audioCtx = null;
    // 初始化数据结构
    const data = this._load();
    if (data.date !== this._todayKey) this._rollover(data);
    this._save(data);
  }

  async update() {
    // 无异步数据；返回当前功德用于首屏渲染
    return this._load();
  }

  /* ---------- 渲染 ---------- */
  render(data) {
    const d = data || this._load();
    const total = d.total || 0;
    const today = d.today || 0;
    const heat = this._heatHtml(d.history || {});
    return `
      <div class="muyu">
        <div class="muyu__header">
          <span>🪵 电子木鱼</span>
          <span class="muyu__menu no-drag" id="muyu-reset" title="清零功德">⟲</span>
        </div>
        <div class="muyu__stats">
          <div class="muyu__stat">
            <div class="muyu__stat-v" id="muyu-today">${today}</div>
            <div class="muyu__stat-k">今日功德</div>
          </div>
          <div class="muyu__stat">
            <div class="muyu__stat-v muyu__stat-v--total" id="muyu-total">${total}</div>
            <div class="muyu__stat-k">累计功德</div>
          </div>
        </div>
        <div class="muyu__body no-drag" id="muyu-body">
          <div class="muyu__fish" id="muyu-fish">
            <svg viewBox="0 0 200 140" width="180" height="126">
              <defs>
                <radialGradient id="muyu-grad" cx="40%" cy="35%" r="70%">
                  <stop offset="0%" stop-color="#a07b4a"/>
                  <stop offset="55%" stop-color="#7a5429"/>
                  <stop offset="100%" stop-color="#4a3015"/>
                </radialGradient>
              </defs>
              <ellipse cx="100" cy="72" rx="86" ry="46" fill="url(#muyu-grad)" stroke="#3a2410" stroke-width="2"/>
              <ellipse cx="100" cy="70" rx="74" ry="34" fill="none" stroke="#3a2410" stroke-width="1.2" opacity="0.45"/>
              <ellipse cx="100" cy="70" rx="56" ry="22" fill="none" stroke="#3a2410" stroke-width="0.8" opacity="0.3"/>
              <!-- 木槌 -->
              <g id="muyu-stick">
                <rect x="150" y="10" width="8" height="54" rx="4" fill="#5a3a18" stroke="#2a1808" stroke-width="1"/>
                <ellipse cx="154" cy="66" rx="14" ry="9" fill="#6a4220" stroke="#2a1808" stroke-width="1.2"/>
              </g>
            </svg>
            <div class="muyu__hint">点击木鱼 · 功德+1</div>
          </div>
          <div class="muyu__float" id="muyu-float"></div>
        </div>
        <div class="muyu__combo" id="muyu-combo"></div>
        <div class="muyu__heat">
          <div class="muyu__heat-label">近 7 天</div>
          <div class="muyu__heat-bars" id="muyu-heat">${heat}</div>
        </div>
      </div>
    `;
  }

  /* ---------- 交互 ---------- */
  bindEvents(container) {
    const fish = container.querySelector('#muyu-fish');
    const resetBtn = container.querySelector('#muyu-reset');
    if (!fish) return;

    fish.addEventListener('click', (e) => this._hit(container));
    fish.addEventListener('animationend', () => fish.classList.remove('muyu__fish--hit'));

    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定清零所有功德？此操作不可恢复。')) {
          this._save({ date: this._todayKey, today: 0, total: 0, history: {} });
          this._refresh(container);
        }
      });
    }
  }

  _hit(container) {
    // 连击判定：1.2s 内连续敲击算连击
    const now = Date.now();
    const inCombo = this._lastHit && (now - this._lastHit < 1200);
    this._combo = inCombo ? this._combo + 1 : 1;
    this._lastHit = now;
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => { this._combo = 0; this._refreshCombo(container); }, 1300);

    // 功德增量：每 8 连击触发一次 ×2 加成（封顶 +8）
    const bonus = this._combo > 0 && this._combo % 8 === 0 ? 8 : 1;

    // 写入数据
    const d = this._load();
    if (d.date !== this._todayKey) this._rollover(d);
    d.today = (d.today || 0) + bonus;
    d.total = (d.total || 0) + bonus;
    (d.history = d.history || {})[this._todayKey] = d.today;
    this._save(d);

    // 音效
    this._knock();

    // 视觉反馈
    const fish = container.querySelector('#muyu-fish');
    if (fish) {
      fish.classList.remove('muyu__fish--hit');
      void fish.offsetWidth; // 重置动画
      fish.classList.add('muyu__fish--hit');
    }
    this._float(container, bonus);
    this._refreshStats(container, d);
    this._refreshCombo(container);
    this._refreshHeat(container, d.history);
  }

  /* ---------- 局部刷新（避免重建 DOM） ---------- */
  _refresh(container) {
    const d = this._load();
    this._refreshStats(container, d);
    this._refreshHeat(container, d.history || {});
    this._refreshCombo(container);
  }

  _refreshStats(container, d) {
    const t = container.querySelector('#muyu-today');
    const tot = container.querySelector('#muyu-total');
    if (t) t.textContent = d.today || 0;
    if (tot) tot.textContent = d.total || 0;
  }

  _refreshHeat(container, history) {
    const el = container.querySelector('#muyu-heat');
    if (el) el.innerHTML = this._heatHtml(history);
  }

  _refreshCombo(container) {
    const el = container.querySelector('#muyu-combo');
    if (!el) return;
    if (this._combo >= 4) {
      el.textContent = `🔥 ${this._combo} 连击`;
      el.classList.add('muyu__combo--show');
    } else {
      el.classList.remove('muyu__combo--show');
      el.textContent = '';
    }
  }

  _float(container, bonus) {
    const wrap = container.querySelector('#muyu-float');
    if (!wrap) return;
    const span = document.createElement('span');
    span.className = 'muyu__float-num';
    span.textContent = bonus > 1 ? `功德 +${bonus}!!` : '功德 +1';
    // 随机水平偏移，让连续点击的数字不重叠
    span.style.left = (40 + Math.random() * 60) + '%';
    wrap.appendChild(span);
    setTimeout(() => span.remove(), 1100);
  }

  /* ---------- 音效（WebAudio 合成木鱼"咚"声，无外部文件） ---------- */
  _knock() {
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      const t = ctx.currentTime;
      // 低频正弦 + 快速衰减，模拟木鱼短促沉闷声
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch (e) { /* 静默忽略，不影响功能 */ }
  }

  /* ---------- 热力图 ---------- */
  _heatHtml(history) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const key = this._dateKey(Date.now() - i * 86400000);
      const v = history[key] || 0;
      const max = Math.max(1, ...Object.values(history || {}));
      const h = Math.max(6, Math.round(46 * Math.min(1, v / max)));
      const label = ['日','一','二','三','四','五','六'][new Date(key + 'T00:00:00').getDay()];
      days.push(`<div class="muyu__heat-col" title="${key}：${v} 功德">
        <div class="muyu__heat-bar" style="height:${h}px"></div>
        <div class="muyu__heat-day">${label}</div>
      </div>`);
    }
    return days.join('');
  }

  /* ---------- 数据 ---------- */
  _load() {
    return this.sdk.store.get('data') || { date: this._todayKey, today: 0, total: 0, history: {} };
  }
  _save(d) {
    this.sdk.store.set('data', d);
  }
  _rollover(d) {
    // 跨天：把昨日累计入 history，今日重置
    if (d.date && d.date !== this._todayKey) {
      (d.history = d.history || {})[d.date] = d.today || 0;
      d.today = 0;
      d.date = this._todayKey;
    }
  }
  _dateKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}

if (typeof PluginRegistry !== 'undefined') {
  PluginRegistry.register('wooden-fish', WoodenFishPlugin);
}
