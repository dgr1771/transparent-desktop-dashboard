/* 每日塔罗：稳定的单牌翻牌小游戏，每天固定一张牌 */
const TarotWidget = {
  CARDS: [
    ['愚人', '新的旅程正在展开，保持好奇，勇敢迈出第一步。', '🌱'],
    ['魔术师', '今天适合把想法变成行动，你拥有足够的资源。', '✨'],
    ['女祭司', '相信直觉，安静观察会让答案自己浮现。', '🌙'],
    ['皇后', '适合照顾自己，也适合让美好和创造力生长。', '🌷'],
    ['皇帝', '建立秩序、明确边界，稳稳推进重要的事情。', '🛡️'],
    ['恋人', '真诚沟通会带来连接，也提醒你做出内心认可的选择。', '💞'],
    ['战车', '目标感很强的一天，集中力量就能突破阻力。', '🏇'],
    ['力量', '温柔不是退让，耐心和勇气会帮你化解难题。', '🦁'],
    ['星星', '保持希望，今天适合疗愈、规划和相信未来。', '⭐'],
    ['太阳', '明亮顺利的一天，大方表达自己会收获好消息。', '☀️'],
    ['世界', '一个阶段正在圆满收尾，准备迎接新的完整循环。', '🌍'],
    ['节制', '放慢一点，把不同的事情调和到舒服的节奏。', '🪽']
  ],

  init() { this.render(); },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },

  getSaved() {
    return Store.get('tarotDaily') || {};
  },

  getTodayCard() {
    const saved = this.getSaved();
    return saved.date === this.today() && Number.isInteger(saved.index) ? this.CARDS[saved.index] : null;
  },

  _aiAvailable() {
    return (Store.get('settings') || {}).ai?.mode !== 'off' && window.dashboard && window.dashboard.aiChat;
  },

  render() {
    const inner = document.querySelector('.widget[data-widget="tarot"] .widget__inner');
    if (!inner) return;
    const saved = this.getSaved();
    const card = saved.date === this.today() && Number.isInteger(saved.index) ? this.CARDS[saved.index] : null;
    const aiBlock = card && saved.aiText ? `<div class="tarot__ai">✨ ${saved.aiText}</div>` : '';
    const aiBtn = card && !saved.aiText && this._aiAvailable()
      ? `<button class="tarot__ai-btn no-drag" id="tarot-ai-btn">✨ AI 为你解读</button>` : '';
    inner.innerHTML = `
      <div class="tarot no-drag">
        <div class="tarot__title">🔮 每日塔罗</div>
        <div class="tarot__simple-card ${card ? 'is-open' : ''}" id="tarot-simple-card">
          ${card ? `<div class="tarot__simple-emoji">${card[2]}</div><b>${card[0]}</b><p>${card[1]}</p>` : '<div class="tarot__simple-back">✦<small>静心后点击翻牌</small></div>'}
        </div>
        ${aiBlock}
        ${aiBtn}
        <button class="tarot__simple-btn" id="tarot-simple-draw" ${card ? 'disabled' : ''}>${card ? '今日已抽取 · 明天再来' : '翻开今日牌面'}</button>
      </div>`;
    const button = inner.querySelector('#tarot-simple-draw');
    if (button && !card) button.addEventListener('click', () => this.draw(inner));
    const aiBtnEl = inner.querySelector('#tarot-ai-btn');
    if (aiBtnEl) aiBtnEl.addEventListener('click', () => this.aiRead(inner));
  },

  draw(inner) {
    const day = this.today();
    let seed = 0;
    for (const char of day) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    const index = seed % this.CARDS.length;
    Store.set('tarotDaily', { date: day, index });
    const card = this.CARDS[index];
    const panel = inner.querySelector('#tarot-simple-card');
    if (!panel) return;
    panel.classList.add('tarot__simple-flip');
    setTimeout(() => {
      panel.className = 'tarot__simple-card is-open';
      panel.innerHTML = `<div class="tarot__simple-emoji">${card[2]}</div><b>${card[0]}</b><p>${card[1]}</p>`;
      const button = inner.querySelector('#tarot-simple-draw');
      if (button) { button.disabled = true; button.textContent = '今日已抽取 · 明天再来'; }
      // 已配置 AI → 翻牌后自动生成今日解读（结果缓存全天，不重复请求）
      if (this._aiAvailable()) this.aiRead(inner);
    }, 280);
  },

  /** AI 生成今日塔罗解读（缓存到 tarotDaily.aiText，一天只生成一次） */
  async aiRead(inner) {
    const saved = this.getSaved();
    const card = Number.isInteger(saved.index) ? this.CARDS[saved.index] : null;
    if (!card) return;
    // 幂等防重入
    if (this._aiBusy) return;
    this._aiBusy = true;
    const btn = inner.querySelector('#tarot-ai-btn');
    if (btn) btn.textContent = '🧠 解读生成中...';
    try {
      const r = await window.dashboard.aiChat([
        { role: 'system', content: '你是温柔的塔罗解读师。用 2-3 句中文给出今日行动指引，语气治愈、贴近生活、不玄乎、不说教，直接输出内容不要开场白。' },
        { role: 'user', content: `今日牌面：「${card[0]}」（牌意：${card[1]}）。请给我今天的专属解读。` }
      ], { maxTokens: 300, temperature: 0.8 });
      if (r.ok && r.text) {
        const text = r.text.trim();
        Store.set('tarotDaily', Object.assign({}, saved, { aiText: text }));
        this.render();
      } else if (btn) {
        btn.textContent = '⚠️ ' + (r.reason || '生成失败，点击重试');
      }
    } catch (e) {
      if (btn) btn.textContent = '⚠️ 生成失败，点击重试';
    }
    this._aiBusy = false;
  }
};
