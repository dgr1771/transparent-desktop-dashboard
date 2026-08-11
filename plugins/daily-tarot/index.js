/* ============================================================
   每日塔罗 · 本地牌义版
   - 今日牌：每日一张，同一天抽同一张（基于日期种子）
   - 三牌阵：过去 / 现在 / 未来，随机抽取
   - 78 张大小阿尔卡那，牌义内嵌，离线可玩
   - 翻牌动画、正逆位、历史记录
   ============================================================ */

/* ---------- 78 张牌义库（精简但完整） ---------- */
const TAROT_DECK = [
  // ===== 大阿尔卡那 0-21 =====
  { id:'00', name:'愚者', arc:'major', upright:'新的开始、天真、自由、冒险精神', reversed:'鲁莽、轻率、无计划、盲目乐观' },
  { id:'01', name:'魔术师', arc:'major', upright:'创造力、意志力、行动、掌控局势', reversed:'操纵、欺骗、能力未发挥、拖延' },
  { id:'02', name:'女祭司', arc:'major', upright:'直觉、神秘、内在智慧、静观', reversed:'秘密、压抑直觉、信息不全、被动' },
  { id:'03', name:'皇后', arc:'major', upright:'丰盛、孕育、创造、自然之美', reversed:'依赖、过度保护、创作停滞、空虚' },
  { id:'04', name:'皇帝', arc:'major', upright:'权威、结构、秩序、坚定领导', reversed:'专横、僵化、控制欲、缺乏灵活' },
  { id:'05', name:'教皇', arc:'major', upright:'传统、信仰、指引、精神导师', reversed:'反传统、挑战权威、自由思考' },
  { id:'06', name:'恋人', arc:'major', upright:'爱、选择、和谐、价值观契合', reversed:'分歧、失衡、错误选择、关系紧张' },
  { id:'07', name:'战车', arc:'major', upright:'意志胜利、克服困难、前进动力', reversed:'方向迷失、内耗、冲动、失败' },
  { id:'08', name:'力量', arc:'major', upright:'内在勇气、耐心、温柔克刚', reversed:'自我怀疑、软弱、失控、缺乏信心' },
  { id:'09', name:'隐士', arc:'major', upright:'内省、独处、寻求真相、智慧', reversed:'孤立、退缩、固执、拒绝建议' },
  { id:'10', name:'命运之轮', arc:'major', upright:'转机、好运、因果、命运流转', reversed:'逆境、失控、错过时机、厄运' },
  { id:'11', name:'正义', arc:'major', upright:'公正、因果、真相、平衡裁决', reversed:'不公、偏颇、逃避责任、失误' },
  { id:'12', name:'倒吊人', arc:'major', upright:'暂停、换角度、牺牲、顿悟', reversed:'无谓牺牲、停滞、固执、抗拒改变' },
  { id:'13', name:'死神', arc:'major', upright:'结束即开始、转变、放下旧物', reversed:'抗拒变化、拖延结束、停滞不前' },
  { id:'14', name:'节制', arc:'major', upright:'平衡、调和、耐心、中庸之道', reversed:'失衡、过度、急躁、不相容' },
  { id:'15', name:'恶魔', arc:'major', upright:'依附、欲望、物质束缚、成瘾', reversed:'挣脱束缚、觉醒、重获自由' },
  { id:'16', name:'高塔', arc:'major', upright:'突变、崩塌、真相揭露、觉醒', reversed:'避免灾难、延缓必然、恐惧变化' },
  { id:'17', name:'星星', arc:'major', upright:'希望、灵感、宁静、信念之光', reversed:'失望、悲观、失去信心、迷茫' },
  { id:'18', name:'月亮', arc:'major', upright:'幻觉、不安、潜意识、未知', reversed:'澄清、释放恐惧、真相浮现' },
  { id:'19', name:'太阳', arc:'major', upright:'快乐、成功、活力、光明正大', reversed:'暂时的阴霾、过度乐观、自负' },
  { id:'20', name:'审判', arc:'major', upright:'觉醒、重生、宽恕、内在召唤', reversed:'自我怀疑、逃避反思、错判' },
  { id:'21', name:'世界', arc:'major', upright:'圆满、完成、成就、新的循环', reversed:'未完成、停滞、缺最后一程' },
  // ===== 权杖（火）===== 杖一 ~ 杖十 + 宫廷
  { id:'w01', name:'权杖一', arc:'minor', upright:'新灵感、激情、创造力萌芽', reversed:'延迟、缺乏方向、热情消退' },
  { id:'w02', name:'权杖二', arc:'minor', upright:'规划、抉择、远见、未来可期', reversed:'犹豫、恐惧未知、计划落空' },
  { id:'w03', name:'权杖三', arc:'minor', upright:'扩展、远景、机遇、出发', reversed:'障碍、延误、视野受限、短视' },
  { id:'w04', name:'权杖四', arc:'minor', upright:'庆典、团聚、安定、归属感', reversed:'过渡、不稳、家庭紧张、暂居' },
  { id:'w05', name:'权杖五', arc:'minor', upright:'竞争、冲突、头脑风暴、磨砺', reversed:'和解、避免冲突、内耗结束' },
  { id:'w06', name:'权杖六', arc:'minor', upright:'胜利、认可、荣誉、自信', reversed:'失落、声望受损、迟到肯定' },
  { id:'w07', name:'权杖七', arc:'minor', upright:'捍卫立场、坚守、挑战来袭', reversed:'压力、妥协、守不住、力不从心' },
  { id:'w08', name:'权杖八', arc:'minor', upright:'迅速、消息、行动力、进展飞快', reversed:'延误、混乱、计划生变、过载' },
  { id:'w09', name:'权杖九', arc:'minor', upright:'坚韧、警惕、最后一程、防御', reversed:'疲惫、偏执、放弃防御、力竭' },
  { id:'w10', name:'权杖十', arc:'minor', upright:'重担、责任、辛勤、接近完成', reversed:'放下负担、委派、过度承担的后果' },
  { id:'wpa', name:'权杖侍从', arc:'minor', upright:'热情探索、新消息、好奇心', reversed:'急躁、半途而废、表面热情' },
  { id:'wkn', name:'权杖骑士', arc:'minor', upright:'冒险、冲劲、行动派、远行', reversed:'鲁莽、三分钟热度、方向感差' },
  { id:'wqu', name:'权杖王后', arc:'minor', upright:'热情、独立、魅力、自信', reversed:'嫉妒、善变、情绪化、不安全感' },
  { id:'wki', name:'权杖国王', arc:'minor', upright:'愿景、领导、魄力、远见', reversed:'专横、苛刻、冲动决策' },
  // ===== 圣杯（水）=====
  { id:'c01', name:'圣杯一', arc:'minor', upright:'新感情、喜悦、情感满溢、爱', reversed:'情感封闭、流失、空虚、阻滞' },
  { id:'c02', name:'圣杯二', arc:'minor', upright:'连接、伙伴、心意相通、契约', reversed:'分歧、分离、误解、失衡' },
  { id:'c03', name:'圣杯三', arc:'minor', upright:'欢庆、友谊、聚会、创意合作', reversed:'过度享乐、三方纠葛、疏远' },
  { id:'c04', name:'圣杯四', arc:'minor', upright:'冷漠、倦怠、忽视机会、内省', reversed:'觉醒、重拾兴趣、抓住机遇' },
  { id:'c05', name:'圣杯五', arc:'minor', upright:'失落、悲伤、关注失去、遗憾', reversed:'接受、释怀、发现仍有' },
  { id:'c06', name:'圣杯六', arc:'minor', upright:'怀旧、童真、回忆、善意', reversed:'停滞过去、不愿长大、 clinging' },
  { id:'c07', name:'圣杯七', arc:'minor', upright:'幻想、选择迷惘、诱惑、白日梦', reversed:'清晰、做决定、看清现实' },
  { id:'c08', name:'圣杯八', arc:'minor', upright:'离开、寻找更深意义、转身', reversed:'害怕改变、原地徘徊、回返' },
  { id:'c09', name:'圣杯九', arc:'minor', upright:'满足、愿望成真、自在、享受', reversed:'不满足、表面风光、自私' },
  { id:'c10', name:'圣杯十', arc:'minor', upright:'幸福、家庭和睦、圆满、归属', reversed:'家庭失和、价值观冲突、表象' },
  { id:'cpa', name:'圣杯侍从', arc:'minor', upright:'感性、新感情、直觉、易感', reversed:'情绪化、不成熟、过度敏感' },
  { id:'ckn', name:'圣杯骑士', arc:'minor', upright:'浪漫、追求、理想主义、温柔', reversed:'不切实际、情绪起伏、虚幻' },
  { id:'cqu', name:'圣杯王后', arc:'minor', upright:'慈悲、温柔、直觉强、包容', reversed:'情绪失控、依赖、委屈' },
  { id:'cki', name:'圣杯国王', arc:'minor', upright:'成熟情感、冷静、外交、顾问', reversed:'阴郁、操控情绪、冷漠、虚伪' },
  // ===== 宝剑（风）=====
  { id:'s01', name:'宝剑一', arc:'minor', upright:'清晰、突破、真相、决断力', reversed:'混乱、错误判断、言语伤人' },
  { id:'s02', name:'宝剑二', arc:'minor', upright:'僵局、两难、回避、平衡', reversed:'决定、信息澄清、犹豫解除' },
  { id:'s03', name:'宝剑三', arc:'minor', upright:'心碎、悲伤、痛苦、清醒', reversed:'原谅、释放痛苦、愈合' },
  { id:'s04', name:'宝剑四', arc:'minor', upright:'休整、静养、暂停、恢复', reversed:'躁动、被迫行动、倦怠结束' },
  { id:'s05', name:'宝剑五', arc:'minor', upright:'冲突、得不偿失、空虚胜利', reversed:'和解、释怀、放下争执' },
  { id:'s06', name:'宝剑六', arc:'minor', upright:'过渡、远离困境、平稳前行', reversed:'拒绝前行、未解问题、停滞' },
  { id:'s07', name:'宝剑七', arc:'minor', upright:'策略、秘密行动、取巧、欺骗', reversed:'坦白、败露、回归正道、内疚' },
  { id:'s08', name:'宝剑八', arc:'minor', upright:'自我设限、困住、恐惧、束缚', reversed:'解放、看清出路、重获自由' },
  { id:'s09', name:'宝剑九', arc:'minor', upright:'焦虑、失眠、噩梦、过度忧虑', reversed:'希望、释怀、担忧消散、真相' },
  { id:'s10', name:'宝剑十', arc:'minor', upright:'终结、谷底、痛苦结束、黎明', reversed:'复苏、最坏已过、重生' },
  { id:'spa', name:'宝剑侍从', arc:'minor', upright:'好奇、新点子、警觉、求知', reversed:'口舌、沟通失误、八卦' },
  { id:'skn', name:'宝剑骑士', arc:'minor', upright:'果断、直率、行动迅猛、正义', reversed:'冲动、鲁莽、不留余地' },
  { id:'squ', name:'宝剑王后', arc:'minor', upright:'清醒、独立、犀利、公正', reversed:'刻薄、冷漠、苛刻、寡情' },
  { id:'ski', name:'宝剑国王', arc:'minor', upright:'权威、理智、公正裁决、原则', reversed:'冷酷、暴政、刚愎、压制' },
  // ===== 星币（土）=====
  { id:'p01', name:'星币一', arc:'minor', upright:'新机会、财运、落地、丰盛萌芽', reversed:'错失、拖延、计划不稳' },
  { id:'p02', name:'星币二', arc:'minor', upright:'兼顾、灵活、权衡、多任务', reversed:'过载、失衡、顾此失彼' },
  { id:'p03', name:'星币三', arc:'minor', upright:'协作、专业、学习、技艺精进', reversed:'不和谐、缺乏配合、敷衍' },
  { id:'p04', name:'星币四', arc:'minor', upright:'稳固、守财、安全、控制', reversed:'过度抠门、患得患失、松动' },
  { id:'p05', name:'星币五', arc:'minor', upright:'困窘、匮乏、被排斥、寒冷', reversed:'复苏、援助到来、回暖' },
  { id:'p06', name:'星币六', arc:'minor', upright:'慷慨、给予、平衡、互助', reversed:'不平等、施舍、债务、失衡' },
  { id:'p07', name:'星币七', arc:'minor', upright:'等待收获、评估、耐心、中期', reversed:'徒劳、短视、放弃太早' },
  { id:'p08', name:'星币八', arc:'minor', upright:'精进、匠人、专注、勤练', reversed:'粗心、追求完美而停滞、不专注' },
  { id:'p09', name:'星币九', arc:'minor', upright:'独立、富足、自给自足、享受', reversed:'自负、依赖、表面光鲜' },
  { id:'p10', name:'星币十', arc:'minor', upright:'传承、家业、长久财富、归宿', reversed:'家族纠纷、财产损失、传承断裂' },
  { id:'ppa', name:'星币侍从', arc:'minor', upright:'勤学、新机会、踏实、好学', reversed:'懒散、拖延、缺乏进展' },
  { id:'pkn', name:'星币骑士', arc:'minor', upright:'勤勉、可靠、稳步前进、耐力', reversed:'停滞、保守、固执、乏味' },
  { id:'pqu', name:'星币王后', arc:'minor', upright:'富足、踏实、滋养、可靠', reversed:'依赖物质、自我贬低、不安全感' },
  { id:'pki', name:'星币国王', arc:'minor', upright:'富裕、稳健、商业头脑、可靠', reversed:'贪婪、固执、物质至上、保守' }
];

/* ---------- 宫廷 / 花色符号 ---------- */
const SUIT_GLYPH = {
  major: '✦', w:'🪄', c:'🏆', s:'⚔️', p:'💰'
};

class DailyTarotPlugin {
  async init(sdk) {
    this.sdk = sdk;
    this._mode = 'single';       // 'single' | 'spread'
    this._flipped = [];          // 已翻开的牌索引
    this._cards = [];            // 本次抽的牌（含 reversed）
  }

  async update() {
    // 首屏直接返回界面骨架
    return { today: this._todayCard() };
  }

  render(data) {
    const today = (data && data.today) || this._todayCard();
    return `
      <div class="tarot">
        <div class="tarot__header">
          <span>🔮 每日塔罗</span>
          <div class="tarot__tabs no-drag">
            <button class="tarot__tab ${this._mode==='single'?'tarot__tab--active':''}" data-mode="single">今日牌</button>
            <button class="tarot__tab ${this._mode==='spread'?'tarot__tab--active':''}" data-mode="spread">三牌阵</button>
          </div>
        </div>
        <div class="tarot__stage" id="tarot-stage">
          ${this._renderStage(today)}
        </div>
        <div class="tarot__footer">
          <span class="tarot__date">${this._dateKey()}</span>
          <span class="tarot__hist-btn no-drag" id="tarot-hist" title="历史牌">📜</span>
        </div>
      </div>
    `;
  }

  /* ---------- 舞台：根据模式渲染 ---------- */
  _renderStage(today) {
    if (this._mode === 'single') return this._renderSingle(today);
    return this._renderSpread();
  }

  _renderSingle(today) {
    const flipped = this._flipped[0];
    return `
      <div class="tarot__single">
        ${flipped ? this._cardHtml(this._cards[0], 0, true) :
          `<div class="tarot__cardback no-drag" id="tarot-flip0">
             <div class="tarot__cardback-inner">
               <div class="tarot__cardback-symbol">✦</div>
               <div class="tarot__cardback-text">点击翻牌</div>
               <div class="tarot__cardback-hint">今日指引</div>
             </div>
           </div>`}
        <div class="tarot__hint">${flipped ? '牌已翻开，明日再来' : '点击牌背揭晓今日指引'}</div>
        ${!flipped ? `<button class="tarot__redraw no-drag" id="tarot-peek">仅看花色</button>` : ''}
      </div>
    `;
  }

  _renderSpread() {
    const positions = ['过去', '现在', '未来'];
    const cardsHtml = positions.map((pos, i) => {
      const flipped = this._flipped[i];
      if (flipped) return `<div class="tarot__spread-cell">${this._cardHtml(this._cards[i], i, true)}<div class="tarot__spread-pos">${pos}</div></div>`;
      return `<div class="tarot__spread-cell">
        <div class="tarot__cardback tarot__cardback--sm no-drag" data-flip="${i}">
          <div class="tarot__cardback-symbol">✦</div>
        </div>
        <div class="tarot__spread-pos">${pos}</div>
      </div>`;
    }).join('');
    const allDrawn = this._flipped.length >= 3;
    return `
      <div class="tarot__spread">
        ${cardsHtml}
        <div class="tarot__hint">${allDrawn ? '三牌阵已全部翻开' : '依次点击三张牌（过去 → 现在 → 未来）'}</div>
        ${allDrawn ? `<button class="tarot__redraw no-drag" id="tarot-again">再抽一组</button>` : ''}
      </div>
    `;
  }

  /* ---------- 单张牌的渲染 ---------- */
  _cardHtml(card, idx, flipped) {
    if (!card) return '';
    const isReversed = !!card.reversed;
    const meaning = isReversed ? card.reversed : card.upright;
    const glyph = card.arc === 'major' ? '✦' : SUIT_GLYPH[card.id[0]];
    return `
      <div class="tarot__card ${isReversed?'tarot__card--rev':''} ${flipped?'tarot__card--flipped':''}">
        <div class="tarot__card-top">
          <span class="tarot__card-arc">${card.arc==='major'?'大阿尔卡那':'小阿尔卡那'}</span>
          <span class="tarot__card-orient">${isReversed?'逆位':'正位'}</span>
        </div>
        <div class="tarot__card-symbol">${glyph}</div>
        <div class="tarot__card-name">${card.name}</div>
        <div class="tarot__card-meaning">${meaning}</div>
      </div>
    `;
  }

  /* ---------- 交互 ---------- */
  bindEvents(container) {
    // 模式切换
    container.querySelectorAll('.tarot__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        this._resetDraw();
        this._reRender(container);
      });
    });
    // 翻牌（事件委托）
    container.addEventListener('click', (e) => {
      const single = e.target.closest('#tarot-flip0');
      const spread = e.target.closest('[data-flip]');
      const again = e.target.closest('#tarot-again');
      const peek = e.target.closest('#tarot-peek');
      const hist = e.target.closest('#tarot-hist');
      if (single) this._flipSingle(container);
      else if (spread) this._flipSpread(container, parseInt(spread.dataset.flip, 10));
      else if (again) { this._resetDraw(); this._reRender(container); }
      else if (peek) this._peek(container);
      else if (hist) this._showHistory(container);
    });
  }

  _flipSingle(container) {
    if (this._flipped[0]) return; // 今日牌一天只翻一次
    this._cards = [this._todayCard()];
    this._flipped = [true];
    this._recordHistory(this._cards[0]);
    this._reRender(container);
  }

  _flipSpread(container, i) {
    if (this._flipped[i]) return;
    if (!this._cards.length) {
      // 首次翻开三牌阵的第 0 张：洗一次三张
      this._cards = this._drawCards(3);
      this._flipped = [];
    }
    this._flipped[i] = true;
    this._recordHistory(this._cards[i]);
    this._reRender(container);
  }

  _peek(container) {
    // "仅看花色"：不锁死，临时显示一张随机牌的大类
    const c = this._drawCards(1)[0];
    const glyph = c.arc === 'major' ? '✦' : SUIT_GLYPH[c.id[0]];
    const stage = container.querySelector('#tarot-stage');
    if (stage) {
      stage.innerHTML = `<div class="tarot__single">
        <div class="tarot__card tarot__card--peek">
          <div class="tarot__card-symbol">${glyph}</div>
          <div class="tarot__card-name">花色已感知</div>
          <div class="tarot__card-meaning">具体牌面留待翻牌揭晓</div>
        </div>
        <div class="tarot__hint">缘分已起，点牌背翻牌</div>
      </div>`;
    }
  }

  _showHistory(container) {
    const hist = (this.sdk.store.get('history') || []).slice(-12).reverse();
    if (!hist.length) { alert('还没有历史记录'); return; }
    const stage = container.querySelector('#tarot-stage');
    if (!stage) return;
    const items = hist.map(h => `<div class="tarot__hist-item">
      <span class="tarot__hist-date">${h.date}</span>
      <span class="tarot__hist-name">${h.name}${h.reversed?'（逆）':''}</span>
    </div>`).join('');
    stage.innerHTML = `<div class="tarot__hist">
      <div class="tarot__hist-title">📜 抽牌历史（最近 12 次）<span class="tarot__hist-back no-drag" id="tarot-back">返回</span></div>
      <div class="tarot__hist-list">${items}</div>
    </div>`;
    const back = container.querySelector('#tarot-back');
    if (back) back.addEventListener('click', () => this._reRender(container));
  }

  _resetDraw() {
    this._cards = [];
    this._flipped = [];
  }

  _reRender(container) {
    const stage = container.querySelector('#tarot-stage');
    if (stage) stage.innerHTML = this._renderStage(this._todayCard());
  }

  /* ---------- 抽牌逻辑 ---------- */
  /** 今日牌：基于日期种子的确定性抽取（同一天同一张） */
  _todayCard() {
    const seed = this._hashDate(this._dateKey());
    const idx = seed % TAROT_DECK.length;
    const card = Object.assign({}, TAROT_DECK[idx]);
    card.reversed = ((seed >> 8) & 1) === 1; // 日期派生的正逆位
    return card;
  }

  /** 抽 n 张不重复的牌（用于三牌阵） */
  _drawCards(n) {
    const pool = TAROT_DECK.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      const card = Object.assign({}, pool.splice(j, 1)[0]);
      card.reversed = Math.random() < 0.5;
      out.push(card);
    }
    return out;
  }

  _recordHistory(card) {
    const hist = this.sdk.store.get('history') || [];
    hist.push({ date: this._dateKey(), name: card.name, reversed: card.reversed, ts: Date.now() });
    // 限制 200 条
    this.sdk.store.set('history', hist.slice(-200));
  }

  /* ---------- 工具 ---------- */
  _hashDate(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
  }
  _dateKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}

if (typeof PluginRegistry !== 'undefined') {
  PluginRegistry.register('daily-tarot', DailyTarotPlugin);
}
