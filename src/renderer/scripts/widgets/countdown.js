/* ============================================================
   倒数日 Widget - 本地存储，支持增删
   ============================================================ */

const CountdownWidget = {
  init() {
    this._refresh();
    // 每分钟刷新（更新倒计时数字）
    if (window.__dashboard.timers.countdown) clearInterval(window.__dashboard.timers.countdown);
    window.__dashboard.timers.countdown = setInterval(() => this._refresh(), window.__dashboard.refreshMs(60 * 1000));
  },

  _refresh() {
    const el = document.querySelector('.widget[data-widget="countdown"] .widget__inner');
    if (!el) return;
    el.innerHTML = this._render();
    this._bindEvents();
  },

  _render() {
    const items = (Store.get('countdowns') || []).map((c, i) => {
      const target = new Date(c.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.round((target - today) / 86400000);
      const isPast = diffDays < 0;
      const isToday = diffDays === 0;
      const dayText = isToday ? '就是今天' : (isPast ? `已过 ${Math.abs(diffDays)} 天` : `还有 ${diffDays} 天`);
      const dayClass = isPast ? 'countdown__days--past' : (isToday ? 'countdown__days--today' : '');

      return `
        <div class="countdown__item">
          <div class="countdown__info">
            <span class="countdown__name">${this._escape(c.name)}</span>
            <span class="countdown__date">${c.date}</span>
          </div>
          <span class="countdown__days ${dayClass}">${dayText}</span>
          <span class="countdown__del no-drag" data-action="del" data-idx="${i}" title="删除">✕</span>
        </div>
      `;
    }).join('');

    const empty = items ? '' : `<div class="countdown__empty">添加你的第一个倒数日<br>（考试、生日、纪念日...）</div>`;

    return `
      <div class="countdown">
        <div class="countdown__header">
          <span>📅 倒数日</span>
          <span class="countdown__count">${(Store.get('countdowns') || []).length} 个</span>
        </div>
        <div class="countdown__input-wrap no-drag">
          <input type="text" class="countdown__name-input selectable" id="cd-name" placeholder="名称（如：生日）" maxlength="12">
          <input type="date" class="countdown__date-input" id="cd-date">
          <button class="countdown__add-btn" id="cd-add">+</button>
        </div>
        <div class="countdown__list">${items}${empty}</div>
      </div>
    `;
  },

  _bindEvents() {
    const widget = document.querySelector('.widget[data-widget="countdown"] .widget__inner');

    // 添加
    const addBtn = widget.querySelector('#cd-add');
    const nameInput = widget.querySelector('#cd-name');
    const dateInput = widget.querySelector('#cd-date');
    const add = () => {
      const name = nameInput.value.trim();
      const date = dateInput.value;
      if (!name || !date) return;
      const list = Store.get('countdowns') || [];
      list.push({ name, date });
      Store.set('countdowns', list);
      this._refresh();
    };
    addBtn.addEventListener('click', add);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

    // 删除
    widget.querySelector('.countdown__list').addEventListener('click', (e) => {
      const t = e.target.closest('[data-action="del"]');
      if (!t) return;
      const list = Store.get('countdowns') || [];
      list.splice(parseInt(t.dataset.idx, 10), 1);
      Store.set('countdowns', list);
      this._refresh();
    });
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
