/* ============================================================
   新闻 Widget - RSS 聚合
   ============================================================ */

const NewsWidget = {
  init() {
    if (window.__dashboard.timers.news) clearInterval(window.__dashboard.timers.news);
    this.update();
    // 每 15 分钟更新
    window.__dashboard.timers.news = setInterval(() => this.update(), window.__dashboard.refreshMs(15 * 60 * 1000));
    // 新闻条目点击打开链接（onclick 属性赋值天然幂等——重复 init 不会累积监听器开两个标签）
    const el = document.querySelector('.widget[data-widget="news"] .widget__inner');
    if (el) {
      el.onclick = (e) => {
        // AI 摘要按钮
        if (e.target.id === 'news-ai-btn') { this._aiSummarize(); return; }
        const item = e.target.closest('.news__item');
        if (item && item.dataset.url && window.dashboard && window.dashboard.openExternal) {
          window.dashboard.openExternal(item.dataset.url);
        }
      };
    }
  },

  /** AI 汇总今日头条（取前 12 条标题 → 3-5 条要点） */
  async _aiSummarize() {
    const btn = document.getElementById('news-ai-btn');
    const box = document.getElementById('news-ai-summary');
    if (!btn || !box || this._aiBusy) return;
    // 组装标题列表（用最近一次渲染的数据）
    const titles = [];
    document.querySelectorAll('.widget[data-widget="news"] .news__title').forEach(t => {
      if (titles.length < 12) titles.push(t.textContent.trim());
    });
    if (titles.length === 0) return;
    this._aiBusy = true;
    btn.textContent = '⏳ 生成中...';
    box.style.display = 'block';
    box.textContent = '正在总结 ' + titles.length + ' 条资讯...';
    try {
      const r = await window.dashboard.aiChat([
        { role: 'system', content: '你是新闻编辑，输出精炼中文要点，不加开场白和客套，直接输出条目。' },
        { role: 'user', content: '以下是今日科技新闻标题，总结为 3-5 条要点，每条一句话并以「· 」开头：\n' + titles.map((t, i) => (i + 1) + '. ' + t).join('\n') }
      ], { maxTokens: 500, temperature: 0.3 });
      if (r.ok) {
        box.textContent = r.text.trim();
      } else {
        box.textContent = '⚠️ ' + r.reason;
      }
    } catch (e) {
      box.textContent = '⚠️ AI 请求异常';
    }
    btn.textContent = '✨ AI 摘要';
    this._aiBusy = false;
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

    // AI 摘要按钮：仅在已配置 AI（云端/本地）时显示，未配置零打扰
    const aiBtn = window.dashboard && window.dashboard.aiChat
      ? `<span class="news__ai-btn no-drag" id="news-ai-btn">✨ AI 摘要</span>` : '';

    return `
      <div class="news">
        <div class="news__header">
          <span>📰 AI 资讯</span>
          <span style="display:flex;gap:8px;align-items:center">
            ${aiBtn}
            <span class="news__count">${data.items.length} 条</span>
          </span>
        </div>
        <div class="news__ai-summary" id="news-ai-summary" style="display:none"></div>
        <div class="news__list">${items}${empty}</div>
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
