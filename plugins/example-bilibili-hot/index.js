/* ============================================================
   示例插件：B站热门视频
   演示如何开发第三方看板组件
   ============================================================ */

class BilibiliHotPlugin {
  async init(sdk) {
    this.sdk = sdk;
    this.data = [];
    // 注册定时刷新（10 分钟）
    sdk.onRefresh(() => this.update(), 600);
  }

  async update() {
    // 用 RSSHub 获取 B站热门
    const xml = await this.sdk.fetch('https://rsshub.app/bilibili/ranking');
    if (!xml) { this.data = []; return null; }
    // 解析 RSS XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const items = [...doc.querySelectorAll('item')].slice(0, 8).map(item => ({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || ''
    }));
    this.data = items;
    return items;
  }

  render(data) {
    const items = (data || this.data);
    if (!items || items.length === 0) {
      return '<div class="bilibili-hot"><div class="bilibili-hot__empty">暂无数据</div></div>';
    }
    const list = items.map(v => `
      <a class="bilibili-hot__item no-drag" data-url="${this._escape(v.link)}">
        <span class="bilibili-hot__title">${this._escape(v.title.substring(0, 24))}</span>
      </a>
    `).join('');
    return `
      <div class="bilibili-hot">
        <div class="bilibili-hot__header">📺 B站热门</div>
        <div class="bilibili-hot__list">${list}</div>
      </div>
    `;
  }

  bindEvents(container) {
    container.addEventListener('click', (e) => {
      const item = e.target.closest('[data-url]');
      if (item) this.sdk.open(item.dataset.url);
    });
  }

  _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
}

// 注册插件
if (typeof PluginRegistry !== 'undefined') {
  PluginRegistry.register('example-bilibili-hot', BilibiliHotPlugin);
}
