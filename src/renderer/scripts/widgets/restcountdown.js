/* ============================================================
   总线倒数日 Widget - 数据来自 workspace-hub 任务总线（127.0.0.1:8765）
   ============================================================ */

const RestCountdownWidget = {
  init() {
    if (window.__dashboard.timers.restcountdown) clearInterval(window.__dashboard.timers.restcountdown);
    this.update();
    window.__dashboard.timers.restcountdown = setInterval(() => this.update(), window.__dashboard.refreshMs(10 * 60 * 1000));
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="restcountdown"] .widget__inner');
    if (!el) return;
    try {
      const data = await window.dashboard.fetchRestCountdowns();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">总线未连接：${this._escape(data.error)}</div>`;
        return;
      }
      if (!data.items || data.items.length === 0) {
        el.innerHTML = `<div class="restcountdown"><div class="restcountdown__header"><span>⏳ 总线倒数日</span></div><div class="restcountdown__empty">对光灵说「加个倒数日：…」</div></div>`;
        return;
      }
      el.innerHTML = this._render(data);
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  _render(data) {
    const items = data.items.map(c => {
      const days = c.daysLeft;
      let cls = 'restcountdown__days--far';
      if (days < 0) cls = 'restcountdown__days--past';
      else if (days <= 7) cls = 'restcountdown__days--near';
      const label = days < 0 ? `已过 ${-days} 天` : days === 0 ? '就是今天' : `还剩 ${days} 天`;
      return `
        <div class="restcountdown__item">
          <div class="restcountdown__title">${this._escape(c.title)}</div>
          <div class="restcountdown__meta"><span class="restcountdown__days ${cls}">${label}</span><span class="restcountdown__date">${this._escape(c.date)}</span></div>
        </div>
      `;
    }).join('');
    return `
      <div class="restcountdown">
        <div class="restcountdown__header"><span>⏳ 总线倒数日</span><span class="restcountdown__count">${data.items.length} 个</span></div>
        ${items}
      </div>
    `;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
