/* ============================================================
   新闻 Widget - RSS 聚合
   ============================================================ */

const NewsWidget = {
  init() {
    if (window.__dashboard.timers.news) clearInterval(window.__dashboard.timers.news);
    this.update();
    // 每 15 分钟更新
    window.__dashboard.timers.news = setInterval(() => this.update(), 15 * 60 * 1000);
    // 新闻条目点击打开链接（onclick 属性赋值天然幂等——重复 init 不会累积监听器开两个标签）
    const el = document.querySelector('.widget[data-widget="news"] .widget__inner');
    if (el) {
      el.onclick = (e) => {
        const item = e.target.closest('.news__item');
        if (item && item.dataset.url && window.dashboard && window.dashboard.openExternal) {
          window.dashboard.openExternal(item.dataset.url);
        }
      };
    }
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="news"] .widget__inner');
    if (!el) return;

    try {
      const data = await window.dashboard.fetchNews();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">${this._escape(data.error)}</div>`;
        return;
      }
      if (!data.items || data.items.length === 0) {
        el.innerHTML = `<div class="widget__error">暂无新闻</div>`;
        return;
      }
      el.innerHTML = this._render(data);
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  _render(data) {
    const items = data.items.map((item, i) => {
      const time = this._formatTime(item.pubDate);
      return `
        <a class="news__item no-drag" data-url="${this._escape(item.link)}">
          <div class="news__item-main">
            <span class="news__title">${this._escape(item.title)}</span>
            <span class="news__meta">
              <span class="news__source">${this._escape(item.source || '')}</span>
              <span class="news__time">${time}</span>
            </span>
          </div>
        </a>
      `;
    }).join('');

    const errMsg = data.errors && data.errors.length > 0
      ? `<div class="news__errors">${this._escape(data.errors.join('; '))}</div>`
      : '';

    return `
      <div class="news">
        <div class="news__header">
          <span>📰 AI 资讯</span>
          <span class="news__count">${data.items.length} 条</span>
        </div>
        <div class="news__list">${items}</div>
        ${errMsg}
      </div>
    `;
  },

  _formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '天前';
    return `${d.getMonth() + 1}-${d.getDate()}`;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
