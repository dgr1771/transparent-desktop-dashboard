/* ============================================================
   今日三件事 Widget - 数据来自 workspace-hub 任务总线（127.0.0.1:8765）
   光灵晚间复盘产出的"明日三件事"，第二天在这里看到。
   ============================================================ */

const Today3Widget = {
  init() {
    if (window.__dashboard.timers.today3) clearInterval(window.__dashboard.timers.today3);
    this.update();
    window.__dashboard.timers.today3 = setInterval(() => this.update(), window.__dashboard.refreshMs(5 * 60 * 1000));
    // 事件委托：点击条目切换完成态
    const el = document.querySelector('.widget[data-widget="today3"] .widget__inner');
    if (el) {
      el.onclick = (e) => {
        const box = e.target.closest('.today3__item');
        if (!box) return;
        const idx = Number(box.dataset.index);
        const item = this._last && this._last.items && this._last.items[idx];
        if (!item) return;
        const next = this._last.items.map((it, i) => i === idx ? { ...it, done: !it.done } : it);
        this._save(next);
      };
    }
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="today3"] .widget__inner');
    if (!el) return;
    try {
      const data = await window.dashboard.fetchToday3();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">总线未连接：${this._escape(data.error)}</div>`;
        return;
      }
      this._last = data;
      el.innerHTML = this._render(data);
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  async _save(items) {
    try {
      const r = await window.dashboard.setToday3(items);
      if (!r.error) {
        this._last = r;
        const el = document.querySelector('.widget[data-widget="today3"] .widget__inner');
        if (el) el.innerHTML = this._render(r);
      }
    } catch (e) {
      console.warn('[today3] 保存失败:', e.message);
    }
  },

  _render(data) {
    const items = data.items && data.items.length
      ? data.items.map((it, i) => `
          <div class="today3__item no-drag ${it.done ? 'today3__item--done' : ''}" data-index="${i}">
            <span class="today3__num">${i + 1}</span>
            <span class="today3__text">${this._escape(it.text)}</span>
            <span class="today3__check">${it.done ? '✓' : ''}</span>
          </div>
        `).join('')
      : '<div class="today3__empty">今晚光灵复盘会为你定出明天的三件事</div>';
    const done = (data.items || []).filter(i => i.done).length;
    return `
      <div class="today3">
        <div class="today3__header"><span>🎯 今日三件事</span><span class="today3__count">${done}/${(data.items || []).length} 完成</span></div>
        ${items}
      </div>
    `;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
