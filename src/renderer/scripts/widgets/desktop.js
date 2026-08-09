/* ============================================================
   桌面整理 - 三个卡片共用：应用/文件夹/文件
   扫描桌面，分类展示，双击打开，不移动原文件
   ============================================================ */

const DesktopWidget = {
  _data: null,

  /** 刷新所有三个桌面卡片 */
  async refreshAll() {
    try {
      this._data = await window.dashboard.scanDesktop();
    } catch (e) {
      this._data = { apps: [], folders: [], files: [] };
    }
    this._renderCard('apps', '应用');
    this._renderCard('deskfolders', '文件夹');
    this._renderCard('deskfiles', '文件');
  },

  init() {
    if (window.__dashboard.timers.desktop) clearInterval(window.__dashboard.timers.desktop);
    this.refreshAll();
    // 每 5 分钟刷新（桌面文件不常变，降低频率减少 PowerShell 启动开销）
    window.__dashboard.timers.desktop = setInterval(() => this.refreshAll(), 5 * 60 * 1000);
  },

  _renderCard(widgetKey, label) {
    const el = document.querySelector(`.widget[data-widget="${widgetKey}"] .widget__inner`);
    if (!el || !this._data) return;

    const typeMap = { 'apps': 'apps', 'deskfolders': 'folders', 'deskfiles': 'files' };
    const items = this._data[typeMap[widgetKey]] || [];

    if (items.length === 0) {
      el.innerHTML = `
        <div class="deskapp">
          <div class="deskapp__header"><span>📁 桌面${label}</span><span class="deskapp__count">0</span></div>
          <div class="deskapp__empty">桌面无${label}</div>
        </div>
      `;
      return;
    }

    const itemHtml = items.map(item => {
      // icon 可能是 data URL（真实图标）或 emoji（备用）
      const isDataUrl = item.icon && item.icon.startsWith('data:');
      const extFallback = (item.name.match(/\.([^.]+)$/) || [,'📄'])[1];
      const emojiFallback = { lnk:'🚀', exe:'⚙️', txt:'📝', doc:'📄', docx:'📄', pdf:'📕', xls:'📊', xlsx:'📊', ppt:'📽️', pptx:'📽️', zip:'📦', rar:'📦', '7z':'📦', mp4:'🎬', mkv:'🎬', avi:'🎬', mp3:'🎵', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', bmp:'🖼️' }[extFallback.toLowerCase()] || '📄';
      const iconHtml = isDataUrl
        ? `<img class="deskapp__icon" src="${item.icon}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="deskapp__icon-fallback" style="display:none">${emojiFallback}</span>`
        : `<span class="deskapp__icon-fallback">${item.icon || emojiFallback}</span>`;
      return `
        <div class="deskapp__item no-drag" data-path="${this._escape(item.path)}" title="${this._escape(item.name)}">
          ${iconHtml}
          <span class="deskapp__name">${this._escape(item.name.replace(/\.[^.]+$/, ''))}</span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="deskapp">
        <div class="deskapp__header">
          <span>📁 桌面${label}</span>
          <span class="deskapp__count">${items.length}</span>
        </div>
        <div class="deskapp__list">${itemHtml}</div>
      </div>
    `;

    // 事件委托：只绑一个 click（替代逐项绑定，大幅减少监听器数量）
    const list = el.querySelector('.deskapp__list');
    if (list) {
      list.addEventListener('click', (e) => {
        const item = e.target.closest('.deskapp__item');
        if (!item) return;
        const p = item.dataset.path;
        if (p && window.dashboard && window.dashboard.openDesktopItem) {
          window.dashboard.openDesktopItem(p);
        }
      });
    }
  },

  _escape(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
