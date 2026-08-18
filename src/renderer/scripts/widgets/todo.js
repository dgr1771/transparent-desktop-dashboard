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
          <span class="todo__text ${textClass}">${t.remindAt ? `<i class="todo__time">🕐${this._fmtRemind(t.remindAt)}</i>` : ''}${this._escape(t.text)}</span>
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
          <input type="text" class="todo__input selectable" id="todo-input" placeholder="添加待办，如「明早9点交报告」（支持自然语言时间）" maxlength="60" />
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
          input.value = '';
          this._smartAdd(text, input);
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

  _add(text, remindAt) {
    const todos = Store.get('todos') || [];
    todos.push({ text, done: false, createdAt: Date.now(), remindAt: remindAt ? remindAt.toISOString() : undefined });
    Store.set('todos', todos);
    this._refresh();
  },

  /**
   * 智能添加：本地规则解析时间（覆盖 80% 常见说法，零成本零延迟），
   * 命中可疑时间词但本地解不出时才调 AI 兜底（需已配置 AI）。
   */
  async _smartAdd(text, input) {
    const p = this._parseLocalDateTime(text);
    if (p.remindAt) return this._add(p.cleanText, p.remindAt);
    const timeish = /明|后天|下周|周[一二三四五六日天]|上午|下午|晚上|中午|凌晨|\d+\s*[:：]\s*\d|\d+\s*点|\d+月|\d+号/.test(text);
    if (!timeish) return this._add(text);
    if (!window.dashboard || !window.dashboard.aiChat) return this._add(text);
    if ((Store.get('settings') || {}).ai?.mode === 'off') return this._add(text);
    // AI 解析（异步，输入框显示提示）
    if (input) { input.placeholder = '🧠 AI 解析时间中...'; input.disabled = true; }
    try {
      const now = new Date();
      const r = await window.dashboard.aiChat([
        { role: 'system', content: '从待办文本提取提醒时间。当前时间 ' + now.toLocaleString('zh-CN') + '。只输出 JSON：{"text":"去掉时间词后的待办内容","remindAt":"YYYY-MM-DD HH:mm 或 null"}，不要输出其它内容。' },
        { role: 'user', content: text }
      ], { maxTokens: 200, temperature: 0.1 });
      if (r.ok) {
        const j = JSON.parse(r.text.trim().replace(/^```(json)?|```$/g, ''));
        if (j.remindAt) {
          const d = new Date(j.remindAt.replace(/-/g, '/'));
          if (!isNaN(d)) return this._add(j.text || text, d);
        }
        return this._add(j.text || text);
      }
    } catch (e) { /* AI 解析失败按纯文本 */ }
    finally {
      if (input) { input.disabled = false; input.placeholder = '添加待办，如「明早9点交报告」（支持自然语言时间）'; input.focus(); }
    }
    this._add(text);
  },

  /** 本地时间解析：今天/明天/后天/周X/下周X/X月X日 + 点/半/: 分/上午下午晚上 */
  _parseLocalDateTime(text) {
    let clean = text;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let dayMatched = false;

    const days = [['大后天', 3], ['后天', 2], ['明早', 1], ['明晚', 1], ['明天', 1], ['明日', 1], ['今晚', 0], ['今天', 0], ['今日', 0]];
    for (const [w, off] of days) {
      if (clean.includes(w)) { d.setDate(d.getDate() + off); clean = clean.split(w).join(''); dayMatched = true; break; }
    }
    const wm = clean.match(/(下下周|下周|周|星期)([一二三四五六日天])/);
    if (wm) {
      const idx = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }[wm[2]];
      let diff = (idx - d.getDay() + 7) % 7 || 7;
      if (wm[1] === '下周') diff += 7;
      if (wm[1] === '下下周') diff += 14;
      d.setDate(d.getDate() + diff);
      clean = clean.replace(wm[0], '');
      dayMatched = true;
    }
    const mdm = clean.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (mdm) {
      d.setMonth(parseInt(mdm[1], 10) - 1, parseInt(mdm[2], 10));
      if (d < now) d.setFullYear(d.getFullYear() + 1);   // 今年已过 → 明年
      clean = clean.replace(mdm[0], '');
      dayMatched = true;
    }

    let hh = null, mm = 0;
    const colon = clean.match(/(\d{1,2})[:：](\d{2})/);
    const zh = clean.match(/(凌晨|早上|早晨|上午|中午|午后|下午|傍晚|晚上|夜里|晚间)?\s*(\d{1,2})\s*点\s*(半|\d{1,2})?\s*分?/);
    if (colon) {
      hh = parseInt(colon[1], 10); mm = parseInt(colon[2], 10);
      clean = clean.replace(colon[0], '');
    } else if (zh && zh[2]) {
      hh = parseInt(zh[2], 10);
      mm = zh[3] === '半' ? 30 : (zh[3] ? parseInt(zh[3], 10) : 0);
      const period = zh[1] || '';
      if (/下午|午后|傍晚|晚上|夜里|晚间/.test(period) && hh < 12) hh += 12;
      if (/中午/.test(period) && hh < 11) hh += 12;
      if (/凌晨/.test(period) && hh === 12) hh = 0;
      clean = clean.replace(zh[0], '');
    }
    clean = clean.replace(/\s{2,}/g, ' ').replace(/^[，,、的到在\s]+|[，,、\s]+$/g, '').trim();
    if (hh == null && !dayMatched) return { remindAt: null, cleanText: text };
    if (hh == null) hh = 9;   // 只写日期没写时间 → 默认 9 点
    if (hh > 23) hh = 23;
    if (mm > 59) mm = 59;
    d.setHours(hh, mm, 0, 0);
    return { remindAt: d, cleanText: clean || text };
  },

  /** 提醒时间徽章：今天 09:00 / 明天 / 周五 / 3天后 */
  _fmtRemind(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (days === 0) return '今天' + hm;
    if (days === 1) return '明天' + hm;
    if (days === 2) return '后天' + hm;
    if (days > 0 && days < 7) return '周' + '日一二三四五六'[d.getDay()] + ' ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
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
