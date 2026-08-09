/* ============================================================
   待办事项 Widget
   ============================================================ */

const TodoWidget = {
  init() {
    const el = document.querySelector('.widget[data-widget="todo"] .widget__inner');
    if (!el) return;
    el.innerHTML = this._render();
    this._bindEvents();
  },

  _render() {
    const todos = Store.get('todos') || [];
    const items = todos.map((t, i) => {
      // 三态：todo（待办）/ doing（进行中）/ done（已完成）
      const status = t.status || (t.done ? 'done' : 'todo');
      const statusIcon = { todo: '○', doing: '◐', done: '●' }[status];
      const statusClass = `todo__check--${status}`;
      const textClass = status === 'done' ? 'todo__text--done' : (status === 'doing' ? 'todo__text--doing' : '');
      return `
        <li class="todo__item ${status==='done'?'todo__item--done':''}" data-idx="${i}">
          <span class="todo__check ${statusClass} no-drag" data-action="cycle" data-idx="${i}">${statusIcon}</span>
          <span class="todo__text ${textClass}">${this._escape(t.text)}</span>
          <span class="todo__del no-drag" data-action="delete" data-idx="${i}" title="删除">✕</span>
        </li>
      `;
    }).join('');

    const doing = todos.filter(t => (t.status||'todo') === 'doing').length;
    const done = todos.filter(t => (t.status||'todo') === 'done').length;
    const emptyHint = todos.length === 0
      ? `<div class="todo__empty">暂无待办，享受美好的一天 ✨</div>`
      : '';

    return `
      <div class="todo">
        <div class="todo__header">
          <span>✅ 待办事项</span>
          <span class="todo__count">进行${doing} · 完成${done} · 共${todos.length}</span>
        </div>
        <div class="todo__input-wrap no-drag">
          <input type="text" class="todo__input selectable" id="todo-input" placeholder="添加待办，回车确认..." maxlength="60" />
        </div>
        <ul class="todo__list">${items}</ul>
        ${emptyHint}
      </div>
    `;
  },

  _bindEvents() {
    const widget = document.querySelector('.widget[data-widget="todo"] .widget__inner');

    // 回车添加
    const input = widget.querySelector('#todo-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) {
          this._add(text);
          input.value = '';
        }
      }
    });

    // 列表项点击（循环状态/删除）
    widget.querySelector('.todo__list').addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const idx = parseInt(target.dataset.idx, 10);
      if (action === 'cycle') this._cycle(idx);
      if (action === 'delete') this._delete(idx);
    });
  },

  // 三态循环：todo → doing → done → todo
  _cycle(idx) {
    const todos = Store.get('todos') || [];
    const t = todos[idx];
    if (!t) return;
    const cur = t.status || (t.done ? 'done' : 'todo');
    const next = { todo: 'doing', doing: 'done', done: 'todo' }[cur];
    t.status = next;
    t.done = (next === 'done');
    Store.set('todos', todos);
    this._refresh();
  },

  _add(text) {
    const todos = Store.get('todos') || [];
    todos.push({ text, done: false, createdAt: Date.now() });
    Store.set('todos', todos);
    this._refresh();
  },

  _delete(idx) {
    const todos = Store.get('todos') || [];
    todos.splice(idx, 1);
    Store.set('todos', todos);
    this._refresh();
  },

  _refresh() {
    const el = document.querySelector('.widget[data-widget="todo"] .widget__inner');
    el.innerHTML = this._render();
    this._bindEvents();
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
