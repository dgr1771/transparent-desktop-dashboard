/* ============================================================
   热搜 Widget - 今日头条热榜
   ============================================================ */

const HotSearchWidget = {
  init() {
    this.update();
    // 每 10 分钟刷新
    if (window.__dashboard.timers.hotsearch) clearInterval(window.__dashboard.timers.hotsearch);
    window.__dashboard.timers.hotsearch = setInterval(() => this.update(), window.__dashboard.refreshMs(10 * 60 * 1000));
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="hotsearch"] .widget__inner');
    if (!el) return;

    try {
      const data = await window.dashboard.fetchHotSearch();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">${this._escape(data.error)}</div>`;
        return;
      }
      if (!data.items || data.items.length === 0) {
        el.innerHTML = `<div class="widget__error">暂无热搜</div>`;
        return;
      }
      el.innerHTML = this._render(data);
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  _render(data) {
    const items = data.items.map((it, i) => {
      const rankClass = i < 3 ? `hot__rank hot__rank--top${i + 1}` : 'hot__rank';
      const labelTag = it.label ? `<span class="hot__label">${this._escape(it.label)}</span>` : '';
      const hotStr = it.hot >= 10000 ? (it.hot / 10000).toFixed(1) + '万' : it.hot;
      return `
        <div class="hot__item no-drag">
          <span class="${rankClass}">${i + 1}</span>
          <span class="hot__title">${this._escape(it.title)}</span>
          ${labelTag}
          <span class="hot__num">${hotStr}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="hot">
        <div class="hot__header">
          <span>🔥 热搜榜</span>
          <span class="hot__source">头条</span>
        </div>
        <div class="hot__list">${items}</div>
      </div>
    `;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
