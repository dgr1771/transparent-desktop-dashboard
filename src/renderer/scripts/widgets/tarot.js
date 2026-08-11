/* ============================================================
   每日塔罗牌 - 支持单牌和三牌阵模式
   ============================================================ */

const TarotWidget = {
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

  _mode: 'single',  // 'single' 或 'three'

  init() {
    this._render();
  },

  _render() {
    const el = document.querySelector('.widget[data-widget="tarot"] .widget__inner');
    if (!el) return;

    const today = new Date().toDateString();
    const lastDraw = Store.get('tarotLastDraw');
    const mode = Store.get('tarotMode') || 'single';

    if (lastDraw === today && Store.get('tarotResult')) {
      // 今天已抽牌，显示结果
      const result = Store.get('tarotResult');
      el.innerHTML = this._renderResult(result);
    } else {
      // 未抽牌
      el.innerHTML = this._renderDraw(mode);
    }
    this._bindEvents();
  },

  _renderDraw(mode) {
    const singleActive = mode !== 'three';
    return `
      <div class="tarot">
        <div class="tarot__header"><span>🔮 每日塔罗</span></div>
        <div class="tarot__mode-switch no-drag">
          <span class="tarot__mode-btn ${singleActive?'tarot__mode--active':''}" id="tarot-mode-single">单张</span>
          <span class="tarot__mode-btn ${!singleActive?'tarot__mode--active':''}" id="tarot-mode-three">三牌阵</span>
        </div>
        <div class="tarot__card-area" id="tarot-card-area">
          ${this._renderCards(mode)}
        </div>
        <div class="tarot__hint">${singleActive ? '静心冥想，抽一张牌' : '过去 · 现在 · 未来，抽三张牌'}</div>
      </div>
    `;
  },

  _renderCards(mode) {
    if (mode === 'three') {
      return `
        <div class="tarot__three">
          <div class="tarot__card-slot">
            <div class="tarot__card-label-small">过去</div>
            <div class="tarot__card-back no-drag tarot__draw-btn" data-pos="0">
              <div class="tarot__card-pattern"><div class="tarot__card-star">✦</div></div>
            </div>
          </div>
          <div class="tarot__card-slot">
            <div class="tarot__card-label-small">现在</div>
            <div class="tarot__card-back no-drag tarot__draw-btn" data-pos="1">
              <div class="tarot__card-pattern"><div class="tarot__card-star">✦</div></div>
            </div>
          </div>
          <div class="tarot__card-slot">
            <div class="tarot__card-label-small">未来</div>
            <div class="tarot__card-back no-drag tarot__draw-btn" data-pos="2">
              <div class="tarot__card-pattern"><div class="tarot__card-star">✦</div></div>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="tarot__card-back no-drag tarot__draw-btn" data-pos="0">
        <div class="tarot__card-pattern">
          <div class="tarot__card-star">✦</div>
          <div class="tarot__card-circle"></div>
          <div class="tarot__card-inner-star">✧</div>
        </div>
        <div class="tarot__card-label">点击抽牌</div>
      </div>
    `;
  },

  _renderResult(result) {
    const mode = result.mode || 'single';
    const drawDate = new Date();
    const dateStr = `${drawDate.getMonth()+1}月${drawDate.getDate()}日`;

    if (mode === 'three') {
      const positions = ['过去', '现在', '未来'];
      const cardsHtml = result.cards.map((c, i) => {
        const card = this.MAJOR_ARCANA[c.idx];
        const meaning = c.reversed ? card.reversed : card.upright;
        const position = c.reversed ? '逆位' : '正位';
        return `
          <div class="tarot__three-card">
            <div class="tarot__three-label">${positions[i]}</div>
            <div class="tarot__card-front ${c.reversed ? 'tarot__reversed' : 'tarot__upright'} tarot__mini-card">
              <div class="tarot__card-emoji ${c.reversed ? 'tarot__card-flipped' : ''}">${card.emoji}</div>
              <div class="tarot__card-name-small">${card.name}</div>
              <div class="tarot__card-position-small">${position}</div>
            </div>
            <div class="tarot__three-meaning">${meaning}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="tarot">
          <div class="tarot__header">
            <span>🔮 每日塔罗</span>
            <span class="tarot__date">${dateStr}</span>
          </div>
          <div class="tarot__three tarot__three-result">${cardsHtml}</div>
          <div class="tarot__hint">明日再来 ✨</div>
        </div>
      `;
    }

    // 单张结果
    const card = this.MAJOR_ARCANA[result.cards[0].idx];
    const isReversed = result.cards[0].reversed;
    const meaning = isReversed ? card.reversed : card.upright;
    const position = isReversed ? '逆位' : '正位';

    return `
      <div class="tarot">
        <div class="tarot__header">
          <span>🔮 每日塔罗</span>
          <span class="tarot__date">${dateStr}</span>
        </div>
        <div class="tarot__card-area">
          <div class="tarot__card-front ${isReversed ? 'tarot__reversed' : 'tarot__upright'}">
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
        <div class="tarot__hint">明日再来 ✨</div>
      </div>
    `;
  },

  _bindEvents() {
    // 模式切换
    const singleBtn = document.getElementById('tarot-mode-single');
    const threeBtn = document.getElementById('tarot-mode-three');
    if (singleBtn) singleBtn.addEventListener('click', () => { Store.set('tarotMode', 'single'); this._render(); });
    if (threeBtn) threeBtn.addEventListener('click', () => { Store.set('tarotMode', 'three'); this._render(); });

    // 抽牌
    document.querySelectorAll('.tarot__draw-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pos = parseInt(btn.dataset.pos) || 0;
        this._drawOne(pos, btn);
      });
    });
  },

  _drawOne(pos, btnEl) {
    const mode = Store.get('tarotMode') || 'single';
    const cardIdx = Math.floor(Math.random() * this.MAJOR_ARCANA.length);
    const isReversed = Math.random() < 0.5;

    // 翻牌动画
    if (btnEl) {
      btnEl.style.transition = 'transform 0.5s, opacity 0.5s';
      btnEl.style.transform = 'rotateY(180deg) scale(0.7)';
      btnEl.style.opacity = '0';
    }

    // 读取已有的抽牌结果（三牌阵可能已经抽了一两张）
    let result = Store.get('tarotDrawProgress') || { mode, cards: [] };

    // 填入对应位置
    if (!result.cards) result.cards = [];
    while (result.cards.length <= pos) result.cards.push(null);
    result.cards[pos] = { idx: cardIdx, reversed: isReversed };
    Store.set('tarotDrawProgress', result);

    // 检查是否抽完
    const totalNeeded = mode === 'three' ? 3 : 1;
    const drawn = result.cards.filter(c => c !== null).length;

    if (drawn >= totalNeeded) {
      // 全部抽完，保存最终结果
      setTimeout(() => {
        const today = new Date().toDateString();
        Store.set('tarotLastDraw', today);
        Store.set('tarotResult', result);
        Store.set('tarotDrawProgress', null);
        this._render();
      }, 500);
    } else {
      // 还有牌要抽，刷新界面
      setTimeout(() => {
        this._renderDrawPartial(result, mode);
      }, 500);
    }
  },

  /** 三牌阵部分抽完时的渲染 */
  _renderDrawPartial(result, mode) {
    const positions = ['过去', '现在', '未来'];
    const html = `
      <div class="tarot__three">
        ${positions.map((label, i) => {
          const c = result.cards[i];
          if (c) {
            // 已抽：显示牌面
            const card = this.MAJOR_ARCANA[c.idx];
            return `
              <div class="tarot__card-slot">
                <div class="tarot__card-label-small">${label}</div>
                <div class="tarot__card-front ${c.reversed?'tarot__reversed':'tarot__upright'} tarot__mini-card">
                  <div class="tarot__card-emoji ${c.reversed?'tarot__card-flipped':''}">${card.emoji}</div>
                  <div class="tarot__card-name-small">${card.name}</div>
                </div>
              </div>
            `;
          }
          // 未抽：显示牌背
          return `
            <div class="tarot__card-slot">
              <div class="tarot__card-label-small">${label}</div>
              <div class="tarot__card-back no-drag tarot__draw-btn" data-pos="${i}">
                <div class="tarot__card-pattern"><div class="tarot__card-star">✦</div></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    const area = document.getElementById('tarot-card-area');
    if (area) {
      area.innerHTML = html;
      document.querySelectorAll('.tarot__draw-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._drawOne(parseInt(btn.dataset.pos), btn);
        });
      });
    }
  }
};
