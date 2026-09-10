/* ============================================================
   总线待办 Widget - 数据来自 workspace-hub 任务总线（127.0.0.1:8765）
   语音对光灵说"加个待办"，这里实时出现。勾选完成回写总线。
   ============================================================ */

const RestTodoWidget = {
  init() {
    if (window.__dashboard.timers.resttodo) clearInterval(window.__dashboard.timers.resttodo);
    this.update();
    window.__dashboard.timers.resttodo = setInterval(() => this.update(), window.__dashboard.refreshMs(60 * 1000));
    // 事件委托：勾选完成 / 撤销完成（onclick 赋值幂等，重复 init 不累积监听器）
    const el = document.querySelector('.widget[data-widget="resttodo"] .widget__inner');
    if (el) {
      el.onclick = (e) => {
        const box = e.target.closest('.resttodo__item');
        if (!box || !box.dataset.id) return;
        if (e.target.classList.contains('resttodo__check')) {
          this._complete(box.dataset.id);
        }
      };
    }
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="resttodo"] .widget__inner');
    if (!el) return;
    try {
      const data = await window.dashboard.fetchRestTodos();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">总线未连接：${this._escape(data.error)}</div>`;
        return;
      }
      if (!data.items || data.items.length === 0) {
        el.innerHTML = `<div class="resttodo"><div class="resttodo__header"><span>✅ 总线待办</span><span class="resttodo__count">0 项</span></div><div class="resttodo__empty">对光灵说「加个待办：…」试试</div></div>`;
        return;
      }
      el.innerHTML = this._render(data);
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  async _complete(id) {
    try {
      await window.dashboard.completeRestTodo(id);
      this.update();
    } catch (e) {
      // 完成失败不打断界面，下轮轮询会恢复真实状态
      console.warn('[resttodo] 完成失败:', e.message);
    }
  },

  _render(data) {
    const items = data.items.map(t => `
      <div class="resttodo__item no-drag ${t.status === 'done' ? 'resttodo__item--done' : ''}" data-id="${this._escape(t.id)}">
        <span class="resttodo__check no-drag" title="${t.status === 'done' ? '已完成' : '点击完成'}">${t.status === 'done' ? '✓' : ''}</span>
        <div class="resttodo__main">
          <span class="resttodo__text">${this._escape(t.text)}</span>
          ${t.due ? `<span class="resttodo__due ${this._isOverdue(t.due, t.status) ? 'resttodo__due--over' : ''}">${this._escape(t.due)}</span>` : ''}
        </div>
      </div>
    `).join('');
    const open = data.items.filter(t => t.status === 'open').length;
    return `
      <div class="resttodo">
        <div class="resttodo__header"><span>✅ 总线待办</span><span class="resttodo__count">${open} 项待完成</span></div>
        <div class="resttodo__list">${items}</div>
      </div>
    `;
  },

  _isOverdue(due, status) {
    if (status === 'done') return false;
    return due < new Date().toISOString().slice(0, 10);
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
