/* ============================================================
   舒尔特方格 - 5×5 数字方格，按 1-25 顺序点击，训练专注力
   ============================================================ */

const SchulteWidget = {
  _size: 5,
  _nums: [],          // 当前打乱的数字
  _next: 1,           // 下一个该点的数字
  _startTime: 0,
  _timer: null,
  _bestTime: null,    // 最佳记录

  init() {
    this._bestTime = (Store.get('schulte') || {}).bestTime || null;
    this._reset();
  },

  _reset() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // 生成 1-25 打乱
    this._nums = Array.from({length: 25}, (_, i) => i + 1);
    for (let i = this._nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._nums[i], this._nums[j]] = [this._nums[j], this._nums[i]];
    }
    this._next = 1;
    this._startTime = 0;
    this._render();
  },

  _render() {
    const el = document.querySelector('.widget[data-widget="schulte"] .widget__inner');
    if (!el) return;
    const elapsed = this._startTime ? ((Date.now() - this._startTime) / 1000).toFixed(1) : '0.0';
    const cfg = Store.get('schulte') || {};
    const best = cfg.bestTime ? `${cfg.bestTime}s` : '—';
    const avg = cfg.avgTime ? `${cfg.avgTime}s` : '—';
    const history = cfg.history || [];

    const cells = this._nums.map(n => {
      return `<div class="schulte__cell no-drag" data-n="${n}">${n}</div>`;
    }).join('');

    // 历史成绩条形图（最近5次）
    const historyHtml = history.length > 0 ? `
      <div class="schulte__history">
        ${history.slice(0, 5).map((t, i) => {
          const isBest = t <= cfg.bestTime;
          return `<span class="schulte__hist-item ${isBest?'schulte__hist--best':''}">${t}s</span>`;
        }).join('')}
      </div>
    ` : '';

    el.innerHTML = `
      <div class="schulte">
        <div class="schulte__header">
          <span>🎯 舒尔特方格</span>
          <span class="schulte__time" id="schulte-time">${elapsed}s</span>
        </div>
        <div class="schulte__grid">${cells}</div>
        <div class="schulte__footer">
          <span class="schulte__next">下一个：<b id="schulte-next">${this._next > 25 ? '完成！' : this._next}</b></span>
          <span class="schulte__best">最佳 ${best} · 平均 ${avg}</span>
        </div>
        ${historyHtml}
        <button class="schulte__btn" id="schulte-restart">↻ 重新开始（重新打乱）</button>
      </div>
    `;
    this._bindEvents();
  },

  _bindEvents() {
    const el = document.querySelector('.widget[data-widget="schulte"] .widget__inner');
    el.querySelector('.schulte__grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.schulte__cell');
      if (!cell) return;
      const n = parseInt(cell.dataset.n, 10);
      if (n === this._next) {
        // 点对了
        cell.classList.add('schulte__cell--done');
        // 第一次点对时启动计时
        if (this._next === 1) {
          this._startTime = Date.now();
          this._startTimer();
        }
        this._next++;
        const nextEl = el.querySelector('#schulte-next');
        if (nextEl) nextEl.textContent = this._next > 25 ? '完成！' : this._next;
        // 完成
        if (this._next > 25) {
          this._finish();
        }
      } else {
        // 点错了，闪红
        cell.classList.add('schulte__cell--wrong');
        setTimeout(() => cell.classList.remove('schulte__cell--wrong'), 300);
      }
    });
    el.querySelector('#schulte-restart').addEventListener('click', () => this._reset());
  },

  _startTimer() {
    this._timer = setInterval(() => {
      const el = document.querySelector('#schulte-time');
      if (el && this._startTime) {
        el.textContent = ((Date.now() - this._startTime) / 1000).toFixed(1) + 's';
      }
    }, 100);
  },

  _finish() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    const elapsed = +((Date.now() - this._startTime) / 1000).toFixed(1);

    // 记录历史（保留最近 10 次）
    const cfg = Store.get('schulte') || {};
    cfg.history = cfg.history || [];
    cfg.history.unshift(elapsed);
    cfg.history = cfg.history.slice(0, 10);
    // 更新最佳
    if (!cfg.bestTime || elapsed < cfg.bestTime) cfg.bestTime = elapsed;
    // 计算平均
    cfg.avgTime = +(cfg.history.reduce((a, b) => a + b, 0) / cfg.history.length).toFixed(1);
    Store.set('schulte', cfg);
    this._bestTime = cfg.bestTime;

    const isBest = elapsed <= cfg.bestTime;
    try { new Notification(isBest ? '🎉 新纪录！' : '🎉 完成！', { body: `用时 ${elapsed} 秒${isBest ? '（最佳）' : ''}` }); } catch (e) {}
    setTimeout(() => this._render(), 1500);
  }
};
