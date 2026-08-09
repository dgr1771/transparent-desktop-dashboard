/* ============================================================
   A股 Widget - 新浪财经实时行情 + 卡片内直接管理自选股
   性能优化：增量更新（只改价格 textContent）+ 交易时段智能降频
   ============================================================ */

const StockWidget = {
  _initialized: false,
  _lastStocks: [],

  init() {
    // 先清旧定时器（防止 config-updated 重复 init 导致定时器叠加）
    if (window.__dashboard.timers.stock) clearInterval(window.__dashboard.timers.stock);
    this.update();
    this._scheduleNext();
  },

  /** 根据交易时段决定刷新频率 */
  _getInterval() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const hm = h * 60 + m;
    const day = now.getDay();
    // 周末不交易
    if (day === 0 || day === 6) return 300 * 1000;  // 5 分钟
    // 交易时段：9:30-11:30, 13:00-15:00
    if ((hm >= 570 && hm <= 690) || (hm >= 780 && hm <= 900)) return 10 * 1000;  // 10 秒
    // 非交易时段
    return 120 * 1000;  // 2 分钟
  },

  /** 自适应调度：每次根据当前时段决定下次刷新间隔 */
  _scheduleNext() {
    const interval = this._getInterval();
    window.__dashboard.timers.stock = setTimeout(() => {
      this.update();
      this._scheduleNext();
    }, interval);
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="stock"] .widget__inner');
    if (!el) return;

    try {
      const data = await window.dashboard.fetchStocks();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">${this._escape(data.error)}</div>`;
        return;
      }
      if (!data.stocks || data.stocks.length === 0) {
        // 空状态：只在首次渲染时重建 DOM（避免覆盖用户正在输入的内容）
        if (!this._initialized) {
          el.innerHTML = this._renderEmpty();
          this._bindAddEvents(el);
          this._initialized = true;
        }
        return;
      }

      // 如果尚未初始化或股票列表变化（增删），全量渲染一次
      const codes = data.stocks.map(s => s.code).join(',');
      const lastCodes = this._lastStocks.map(s => s.code).join(',');
      if (!this._initialized || codes !== lastCodes) {
        el.innerHTML = this._render(data.stocks);
        this._bindEvents(el);
        this._initialized = true;
      } else {
        // 增量更新：只改价格/涨跌幅的 textContent，不重建 DOM
        this._updatePrices(data.stocks);
      }
      this._lastStocks = data.stocks;
    } catch (e) {
      if (!this._initialized) {
        el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
      }
    }
  },

  /** 增量更新价格（不重建 DOM，不丢失输入焦点） */
  _updatePrices(stocks) {
    const el = document.querySelector('.widget[data-widget="stock"] .widget__inner');
    if (!el) return;
    const items = el.querySelectorAll('.stock__item');
    stocks.forEach((s, i) => {
      const item = items[i];
      if (!item) return;
      const colorClass = s.isUp ? 'up' : (s.change < 0 ? 'down' : 'flat');
      const arrow = s.isUp ? '▲' : (s.change < 0 ? '▼' : '—');
      const priceEl = item.querySelector('.stock__price');
      const changeEl = item.querySelector('.stock__change');
      if (priceEl) {
        priceEl.textContent = s.price.toFixed(2);
        priceEl.className = 'stock__price ' + colorClass;
      }
      if (changeEl) {
        changeEl.textContent = `${arrow} ${Math.abs(s.changePct).toFixed(2)}%`;
        changeEl.className = 'stock__change ' + colorClass;
      }
    });
  },

  _render(stocks) {
    const rows = stocks.map((s, i) => {
      const arrow = s.isUp ? '▲' : (s.change < 0 ? '▼' : '—');
      const colorClass = s.isUp ? 'up' : (s.change < 0 ? 'down' : 'flat');
      return `
        <div class="stock__item">
          <span class="stock__del no-drag" data-action="del" data-code="${s.code}" title="移除">✕</span>
          <span class="stock__name">${this._escape(s.name)}</span>
          <span class="stock__price-wrap">
            <span class="stock__price ${colorClass}">${s.price.toFixed(2)}</span>
            <span class="stock__change ${colorClass}">${arrow} ${Math.abs(s.changePct).toFixed(2)}%</span>
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="stock">
        <div class="stock__header">
          <span>📈 A股行情</span>
          <span class="stock__refresh">实时</span>
        </div>
        <div class="stock__add-wrap no-drag">
          <input type="text" class="stock__add-input selectable" id="stock-add" placeholder="加自选: sh600519" maxlength="10">
          <button class="stock__add-btn" id="stock-add-btn">+</button>
        </div>
        <div class="stock__list">${rows}</div>
      </div>
    `;
  },

  _renderEmpty() {
    return `
      <div class="stock">
        <div class="stock__header">
          <span>📈 A股行情</span>
        </div>
        <div class="stock__add-wrap no-drag">
          <input type="text" class="stock__add-input selectable" id="stock-add" placeholder="加自选: sh600519" maxlength="10">
          <button class="stock__add-btn" id="stock-add-btn">+</button>
        </div>
        <div class="stock__hint">输入代码添加自选<br><small>沪市 sh 开头，深市 sz 开头</small></div>
      </div>
    `;
  },

  _bindEvents(el) {
    el = el || document.querySelector('.widget[data-widget="stock"] .widget__inner');
    if (!el) return;
    this._bindAddEvents(el);
    // 用事件委托（只绑一个 click，不逐项绑）
    const list = el.querySelector('.stock__list');
    if (list) {
      list.addEventListener('click', (e) => {
        const t = e.target.closest('[data-action="del"]');
        if (!t) return;
        this._removeStock(t.dataset.code);
      });
    }
  },

  _bindAddEvents(el) {
    el = el || document.querySelector('.widget[data-widget="stock"] .widget__inner');
    if (!el) return;
    const input = el.querySelector('#stock-add');
    const btn = el.querySelector('#stock-add-btn');
    if (!input || !btn) return;
    const add = () => {
      let code = input.value.trim().toLowerCase();
      if (!code) return;
      if (/^\d{6}$/.test(code)) {
        code = (code.startsWith('6') || code.startsWith('5') || code.startsWith('9')) ? 'sh' + code : 'sz' + code;
      }
      if (!/^(sh|sz|bj)\d{6}$/.test(code)) {
        input.style.borderColor = '#f87171';
        setTimeout(() => input.style.borderColor = '', 1500);
        return;
      }
      this._addStock(code);
    };
    btn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  },

  _addStock(code) {
    const cfg = Store.get('stock') || { codes: [] };
    if (cfg.codes.includes(code)) return;
    cfg.codes.push(code);
    Store.set('stock', cfg);
    this._initialized = false;  // 强制下次全量渲染
    this.update();
  },

  _removeStock(code) {
    const cfg = Store.get('stock') || { codes: [] };
    cfg.codes = cfg.codes.filter(c => c !== code);
    Store.set('stock', cfg);
    this._initialized = false;
    this.update();
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
