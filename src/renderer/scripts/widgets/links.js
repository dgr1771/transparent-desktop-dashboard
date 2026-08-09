/* ============================================================
   常用网址快捷链接 - 自定义书签，点击直达
   ============================================================ */

const LinksWidget = {
  init() {
    this._refresh();
  },

  _refresh() {
    const el = document.querySelector('.widget[data-widget="links"] .widget__inner');
    if (!el) return;
    el.innerHTML = this._render();
    this._bindEvents();
  },

  _render() {
    const links = Store.get('links') || [];
    const items = links.map((l, i) => `
      <a class="links__item no-drag" data-idx="${i}" title="${this._escape(l.url)}">
        <span class="links__icon">${this._getIcon(l.name, l.url)}</span>
        <span class="links__name">${this._escape(l.name)}</span>
        <span class="links__del no-drag" data-del="${i}" title="删除">✕</span>
      </a>
    `).join('');

    const empty = links.length === 0
      ? `<div class="links__empty">添加常用网址，一键直达</div>` : '';

    return `
      <div class="links">
        <div class="links__header">
          <span>🔗 快捷链接</span>
          <span class="links__add-btn no-drag" id="links-add-toggle" title="添加">+</span>
        </div>
        <div class="links__add-form no-drag" id="links-add-form" style="display:none">
          <input type="text" class="links__add-name selectable" id="links-name" placeholder="名称" maxlength="12">
          <input type="text" class="links__add-url selectable" id="links-url" placeholder="https://..." maxlength="200">
          <button class="links__add-confirm" id="links-add-ok">添加</button>
        </div>
        <div class="links__list">${items}${empty}</div>
      </div>
    `;
  },

  _bindEvents() {
    const el = document.querySelector('.widget[data-widget="links"] .widget__inner');

    // 展开/收起添加表单
    el.querySelector('#links-add-toggle').addEventListener('click', () => {
      const form = el.querySelector('#links-add-form');
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });

    // 添加
    const nameInput = el.querySelector('#links-name');
    const urlInput = el.querySelector('#links-url');
    const add = () => {
      const name = nameInput.value.trim();
      let url = urlInput.value.trim();
      if (!name || !url) return;
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const list = Store.get('links') || [];
      list.push({ name, url });
      Store.set('links', list);
      this._refresh();
    };
    el.querySelector('#links-add-ok').addEventListener('click', add);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') urlInput.focus(); });

    // 点击链接 / 删除
    el.querySelector('.links__list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const list = Store.get('links') || [];
        list.splice(parseInt(del.dataset.del, 10), 1);
        Store.set('links', list);
        this._refresh();
        return;
      }
      const item = e.target.closest('[data-idx]');
      if (item) {
        const list = Store.get('links') || [];
        const link = list[parseInt(item.dataset.idx, 10)];
        if (link && window.dashboard && window.dashboard.openExternal) {
          window.dashboard.openExternal(link.url);
        }
      }
    });
  },

  _getIcon(name, url) {
    // 根据 URL 域名返回常用图标 emoji
    const u = (url || '').toLowerCase();
    if (u.includes('github')) return '🐙';
    if (u.includes('google')) return '🔍';
    if (u.includes('baidu')) return '🔍';
    if (u.includes('youtube')) return '📺';
    if (u.includes('bilibili') || u.includes('b站')) return '🎬';
    if (u.includes('taobao') || u.includes('jd.com') || u.includes('购物')) return '🛒';
    if (u.includes('mail') || u.includes('邮箱')) return '📧';
    if (u.includes('chat') || u.includes('weixin') || u.includes('微信')) return '💬';
    if (u.includes('doc') || u.includes('docs') || u.includes('文档')) return '📄';
    if (u.includes('music') || u.includes('音乐')) return '🎵';
    if (u.includes('map') || u.includes('地图')) return '🗺️';
    if (u.includes('ai') || u.includes('gpt') || u.includes('chatgpt')) return '🤖';
    return '🌐';
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
