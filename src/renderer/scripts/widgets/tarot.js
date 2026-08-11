/* ============================================================
   每日塔罗牌 - 每日一抽，22张大阿尔卡纳，正逆位解读
   ============================================================ */

const TarotWidget = {
  // 22 张大阿尔卡纳牌数据
  MAJOR_ARCANA: [
    { num: 0,  name: '愚者', emoji: '🤡', upright: '新的开始、冒险、无限可能', reversed: '鲁莽、冲动、缺乏计划' },
    { num: 1,  name: '魔术师', emoji: '🎩', upright: '创造力、意志力、行动力', reversed: '欺骗、缺乏自信、能力不足' },
    { num: 2,  name: '女祭司', emoji: '🌙', upright: '直觉、智慧、内在力量', reversed: '缺乏直觉、信息被隐藏' },
    { num: 3,  name: '皇后', emoji: '👑', upright: '丰收、母性、创造', reversed: '过度依赖、创造力受阻' },
    { num: 4,  name: '皇帝', emoji: '🏛️', upright: '权威、稳定、领导力', reversed: '专制、固执、权力滥用' },
    { num: 5,  name: '教皇', emoji: '⛩️', upright: '信仰、传统、精神引导', reversed: '反叛、打破常规、非传统' },
    { num: 6,  name: '恋人', emoji: '💕', upright: '爱情、选择、和谐', reversed: '分歧、错误选择、失衡' },
    { num: 7,  name: '战车', emoji: '⚔️', upright: '胜利、意志、克服困难', reversed: '失控、方向不明、挫折' },
    { num: 8,  name: '力量', emoji: '🦁', upright: '勇气、内在力量、耐心', reversed: '自我怀疑、懦弱、失控' },
    { num: 9,  name: '隐士', emoji: '🏮', upright: '内省、独处、寻求答案', reversed: '孤立、封闭、拒绝建议' },
    { num: 10, name: '命运之轮', emoji: '🎡', upright: '转机、好运、命运改变', reversed: '逆境、失控、坏运气' },
    { num: 11, name: '正义', emoji: '⚖️', upright: '公平、真相、因果', reversed: '不公、偏见、逃避责任' },
    { num: 12, name: '倒吊人', emoji: '🙃', upright: '牺牲、换角度思考、等待', reversed: '无谓牺牲、停滞、固执' },
    { num: 13, name: '死神', emoji: '💀', upright: '转变、结束、重生', reversed: '抗拒改变、无法放手' },
    { num: 14, name: '节制', emoji: '🍷', upright: '平衡、调和、耐心', reversed: '失衡、过度、不协调' },
    { num: 15, name: '恶魔', emoji: '😈', upright: '束缚、欲望、物质主义', reversed: '解脱、觉醒、挣脱束缚' },
    { num: 16, name: '高塔', emoji: '🗼', upright: '突变、颠覆、觉醒', reversed: '避免灾难、抗拒变化' },
    { num: 17, name: '星星', emoji: '⭐', upright: '希望、灵感、宁静', reversed: '失望、悲观、失去信心' },
    { num: 18, name: '月亮', emoji: '🌕', upright: '幻觉、潜意识、直觉', reversed: '释怀、真相浮现、消除恐惧' },
    { num: 19, name: '太阳', emoji: '☀️', upright: '快乐、成功、活力', reversed: '暂时的挫折、过度乐观' },
    { num: 20, name: '审判', emoji: '📯', upright: '重生、觉醒、救赎', reversed: '自我怀疑、错失机会' },
    { num: 21, name: '世界', emoji: '🌍', upright: '圆满、完成、成就', reversed: '未完成、停滞、差一步' },
  ],

  init() {
    this._render();
  },

  _render() {
    const el = document.querySelector('.widget[data-widget="tarot"] .widget__inner');
    if (!el) return;

    // 检查今天是否已抽牌
    const today = new Date().toDateString();
    const lastDraw = Store.get('tarotLastDraw');
    const lastCard = Store.get('tarotLastCard');
    const lastReversed = Store.get('tarotLastReversed');

    if (lastDraw === today && lastCard != null) {
      // 今天已抽牌，显示结果
      el.innerHTML = this._renderResult(lastCard, lastReversed);
    } else {
      // 未抽牌，显示抽牌界面
      el.innerHTML = this._renderDraw();
    }

    this._bindEvents();
  },

  _renderDraw() {
    return `
      <div class="tarot">
        <div class="tarot__header"><span>🔮 每日塔罗</span></div>
        <div class="tarot__card-area">
          <div class="tarot__card-back no-drag" id="tarot-draw">
            <div class="tarot__card-pattern">
              <div class="tarot__card-star">✦</div>
              <div class="tarot__card-circle"></div>
              <div class="tarot__card-inner-star">✧</div>
            </div>
            <div class="tarot__card-label">点击抽牌</div>
          </div>
        </div>
        <div class="tarot__hint">静心冥想今日问题，然后抽一张牌</div>
      </div>
    `;
  },

  _renderResult(cardIdx, isReversed) {
    const card = this.MAJOR_ARCANA[cardIdx];
    const meaning = isReversed ? card.reversed : card.upright;
    const position = isReversed ? '逆位' : '正位';
    const positionClass = isReversed ? 'tarot__reversed' : 'tarot__upright';

    return `
      <div class="tarot">
        <div class="tarot__header">
          <span>🔮 每日塔罗</span>
          <span class="tarot__date">${new Date().getMonth()+1}月${new Date().getDate()}日</span>
        </div>
        <div class="tarot__card-area">
          <div class="tarot__card-front ${positionClass}">
            <div class="tarot__card-emoji ${isReversed ? 'tarot__card-flipped' : ''}">${card.emoji}</div>
            <div class="tarot__card-num">${card.num}</div>
            <div class="tarot__card-name">${card.name}</div>
            <div class="tarot__card-position">${position}</div>
          </div>
        </div>
        <div class="tarot__meaning">
          <div class="tarot__meaning-label">${card.name} · ${position}</div>
          <div class="tarot__meaning-text">${meaning}</div>
        </div>
        <div class="tarot__hint">明日再来抽取新牌 ✨</div>
      </div>
    `;
  },

  _bindEvents() {
    const drawBtn = document.getElementById('tarot-draw');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => this._drawCard());
    }
  },

  _drawCard() {
    const cardIdx = Math.floor(Math.random() * this.MAJOR_ARCANA.length);
    const isReversed = Math.random() < 0.5;

    // 保存结果（今天有效）
    const today = new Date().toDateString();
    Store.set('tarotLastDraw', today);
    Store.set('tarotLastCard', cardIdx);
    Store.set('tarotLastReversed', isReversed);

    // 翻牌动画后显示结果
    const drawEl = document.getElementById('tarot-draw');
    if (drawEl) {
      drawEl.style.transition = 'transform 0.6s';
      drawEl.style.transform = 'rotateY(180deg) scale(0.8)';
      drawEl.style.opacity = '0';
    }

    setTimeout(() => {
      this._render();
      // 新卡片入场动画
      const el = document.querySelector('.widget[data-widget="tarot"] .widget__inner');
      const front = el?.querySelector('.tarot__card-front');
      if (front) {
        front.style.transform = 'rotateY(180deg) scale(0.5)';
        front.style.opacity = '0';
        setTimeout(() => {
          front.style.transition = 'transform 0.6s ease-out, opacity 0.4s';
          front.style.transform = 'rotateY(0deg) scale(1)';
          front.style.opacity = '1';
        }, 50);
      }
    }, 600);
  }
};
