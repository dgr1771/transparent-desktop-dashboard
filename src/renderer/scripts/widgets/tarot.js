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

  getTodayCard() {
    const saved = Store.get('tarotDaily') || {};
    return saved.date === this.today() && Number.isInteger(saved.index) ? this.CARDS[saved.index] : null;
  },

  render() {
    const inner = document.querySelector('.widget[data-widget="tarot"] .widget__inner');
    if (!inner) return;
    const card = this.getTodayCard();
    inner.innerHTML = `
      <div class="tarot no-drag">
        <div class="tarot__title">🔮 每日塔罗</div>
        <div class="tarot__simple-card ${card ? 'is-open' : ''}" id="tarot-simple-card">
          ${card ? `<div class="tarot__simple-emoji">${card[2]}</div><b>${card[0]}</b><p>${card[1]}</p>` : '<div class="tarot__simple-back">✦<small>静心后点击翻牌</small></div>'}
        </div>
        <button class="tarot__simple-btn" id="tarot-simple-draw" ${card ? 'disabled' : ''}>${card ? '今日已抽取 · 明天再来' : '翻开今日牌面'}</button>
      </div>`;
    const button = inner.querySelector('#tarot-simple-draw');
    if (button && !card) button.addEventListener('click', () => this.draw(inner));
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
    }, 280);
  }
};
