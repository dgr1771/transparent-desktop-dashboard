/* ============================================================
   卡片开启交互（扑克抽取 + 边缘坞）
   C. 扑克抽取 — 桌面底部卡堆 / Ctrl+Shift+A / 托盘唤出，
      扇形展开（牌背带全称），翻牌飞入桌面
   A. 边缘坞  — 鼠标贴右缘 300ms 滑出图标栏

   共用：setEnabled（含空位计算 + 位置预写）、flyIn（FLIP ghost 飞行动画）
   依赖：Store（store.js）、ClickThrough 的 .no-drag 交互约定
   ============================================================ */

const WidgetPicker = (() => {
  'use strict';

  // 组件清单（与 index.html 卡片一一对应）
  const META = [
    { id: 'clock',       icon: '🕐', name: '时钟',     desc: '时间与日期' },
    { id: 'weather',     icon: '🌤️', name: '天气',     desc: '实时天气与预报' },
    { id: 'stock',       icon: '📈', name: 'A股',      desc: '自选行情' },
    { id: 'news',        icon: '📰', name: '新闻',     desc: 'RSS 资讯 + AI 摘要' },
    { id: 'todo',        icon: '✅', name: '待办',     desc: '清单 + 自然语言提醒' },
    { id: 'countdown',   icon: '⏳', name: '倒数日',   desc: '重要日子倒计时' },
    { id: 'hotsearch',   icon: '🔥', name: '热搜',     desc: '全网热榜' },
    { id: 'sysmonitor',  icon: '📊', name: '监控',     desc: 'CPU / 内存' },
    { id: 'calendar',    icon: '📅', name: '日历',     desc: '月历 + 农历' },
    { id: 'pomodoro',    icon: '🍅', name: '番茄',     desc: '专注计时' },
    { id: 'links',       icon: '🔗', name: '链接',     desc: '常用网站快捷入口' },
    { id: 'schulte',     icon: '🔠', name: '方格',     desc: '舒尔特注意力训练' },
    { id: 'apps',        icon: '🚀', name: '应用',     desc: '桌面程序快捷方式' },
    { id: 'deskfolders', icon: '📁', name: '文件夹',   desc: '桌面文件夹' },
    { id: 'deskfiles',   icon: '📄', name: '文件',     desc: '桌面文件' },
    { id: 'mokugyo',     icon: '🐟', name: '木鱼',     desc: '敲一敲，攒功德' },
    { id: 'tarot',       icon: '🔮', name: '每日塔罗', desc: '每日一抽' },
  ];

  let _open = null;            // 'fan' | null
  let _dockOpen = false;
  let _dockArmAt = 0;          // 鼠标贴右缘的起始时刻
  let _dockCloseTimer = null;
  let _dockTip = null;         // 边缘坞的浮动信息提示（挂 body，避免被坞容器裁剪）

  // ============================================================
  // 仪式感：合成音效（WebAudio，零素材依赖；音量克制）
  // ============================================================
  const Sound = (() => {
    let ctx = null;
    let _lastChime = 0;   // 风铃限流（快速滑动防连响）
    let enabled = (() => { try { return localStorage.getItem('wp_sound') !== '0'; } catch (e) { return true; } })();
    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function tone(freq, dur, opts) {
      if (!enabled) return;
      const { type = 'sine', gain = 0.06, delay = 0 } = opts || {};
      try {
        const c = ac(); if (!c) return;
        const t = c.currentTime + delay;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) {}
    }
    function sweep(f1, f2, dur, gain, type) {
      if (!enabled) return;
      try {
        const c = ac(); if (!c) return;
        const t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f1, t);
        o.frequency.exponentialRampToValueAtTime(f2, t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain || 0.03, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) {}
    }
    return {
      deal()   { tone(1500 + Math.random() * 600, 0.05, { type: 'triangle', gain: 0.035 }); },
      flip()   { tone(880, 0.07, { type: 'square', gain: 0.025 }); tone(1320, 0.05, { type: 'square', gain: 0.02, delay: 0.045 }); },
      land()   { tone(523.25, 0.12); tone(659.25, 0.14, { delay: 0.09 }); tone(783.99, 0.22, { delay: 0.18 }); },
      close()  { tone(640, 0.06, { type: 'triangle', gain: 0.03 }); tone(420, 0.09, { type: 'triangle', gain: 0.025, delay: 0.05 }); },
      fortune(){ [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.28, { gain: 0.055, delay: i * 0.09 })); },
      // 边缘坞仪式
      dockOpen()  { sweep(320, 980, 0.18, 0.03); },
      dockClose() { sweep(880, 300, 0.16, 0.028); },
      tick()      { tone(1250, 0.05, { type: 'triangle', gain: 0.04 }); },
      off()       { tone(520, 0.07, { type: 'triangle', gain: 0.035 }); tone(340, 0.1, { type: 'triangle', gain: 0.03, delay: 0.06 }); },
      /** 滑过坞图标的风铃：大调五声音阶（任意顺序都和谐），音乐盒泛音质感 */
      chime(i) {
        const now = Date.now();
        if (now - _lastChime < 35) return;   // 快速滑动时限流，防边缘抖动连响
        _lastChime = now;
        const PENTA = [0, 2, 4, 7, 9];       // 宫 商 角 徵 羽（半音偏移）
        const step = PENTA[i % 5] + 12 * Math.floor((i % 10) / 5);   // 两个八度内循环
        const f = 523.25 * Math.pow(2, step / 12);                    // C5 起
        tone(f, 0.5, { gain: 0.045 });
        tone(f * 2, 0.35, { gain: 0.012, delay: 0.005 });            // 高八度泛音
        tone(f * 3, 0.2, { gain: 0.006, delay: 0.01 });              // 十二度泛音
      },
      toggle() {
        enabled = !enabled;
        try { localStorage.setItem('wp_sound', enabled ? '1' : '0'); } catch (e) {}
        return enabled;
      },
      get enabled() { return enabled; },
    };
  })();

  /** 落点粒子迸发（DOM 粒子，WAAPI 一次性动画，自动清理） */
  function burstParticles(x, y, count) {
    if (_skipAnim()) return;
    const n = count || 12;
    const colors = ['#ffd782', '#ffffff', `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--accent-color') || '96,165,250'})`];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'wp-particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.background = colors[i % colors.length];
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 36 + Math.random() * 66;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - 26;   // 整体向上偏的弧线
      try {
        p.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy + 46}px) scale(0.15)`, opacity: 0 },
        ], { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' })
          .finished.then(() => p.remove()).catch(() => p.remove());
      } catch (e) { p.remove(); }
    }
  }

  // ============================================================
  // 仪式感：今日运势（每日一抽，本地文案零依赖；日期哈希保证全天稳定）
  // ============================================================
  const FORTUNES = [
    { t: '宜专注',   d: '番茄钟护体，两轮专注之后，事事都会顺起来。',       w: 'pomodoro' },
    { t: '宜知天下', d: '开工前刷三条新闻，今天的谈资就是你的运气。',       w: 'news' },
    { t: '宜守财',   d: '不冲动消费，行情绿了也别慌——稳住就是赢。',        w: 'stock' },
    { t: '宜清零',   d: '待办清单里躺最久的那件事，今天做掉它。',           w: 'todo' },
    { t: '宜远行',   d: '出门前看眼天气，今天风都会顺着你吹。',             w: 'weather' },
    { t: '宜倒数',   d: '离好事又近了一天，倒数日替你记着呢。',             w: 'countdown' },
    { t: '宜静心',   d: '敲三下木鱼，功德 +1，烦恼 -1。',                   w: 'mokugyo' },
    { t: '宜问牌',   d: '今日一抽塔罗，答案其实早就在你心里。',             w: 'tarot' },
    { t: '宜整理',   d: '桌面清一清，文件夹里可能藏着惊喜。',               w: 'deskfolders' },
    { t: '宜冲浪',   d: '热梗今天格外多，热搜榜都替你挑好了。',             w: 'hotsearch' },
    { t: '宜记录',   d: '在日历上圈一个重点，月末回头会感谢自己。',         w: 'calendar' },
    { t: '宜练眼',   d: '舒尔特方格来一轮，眼神都变得锋利。',               w: 'schulte' },
    { t: '宜通达',   d: '常用链接一键直达，今天效率翻倍。',                 w: 'links' },
    { t: '宜观察',   d: '瞄一眼系统监控，让 CPU 也歇口气。',                w: 'sysmonitor' },
    { t: '宜启动',   d: '常用应用点开即启，好运随开机一起上线。',           w: 'apps' },
    { t: '宜陪伴',   d: '时钟滴答，专注的你在发光。',                       w: 'clock' },
  ];

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 今天的运势（日期哈希选条，全天稳定；跨天自动换） */
  function fortuneOf() {
    const s = todayStr();
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { ...FORTUNES[h % FORTUNES.length], date: s };
  }

  function fortuneDrawnToday() {
    try {
      const st = JSON.parse(localStorage.getItem('wp_fortune') || 'null');
      return !!(st && st.date === todayStr());
    } catch (e) { return false; }
  }

  const metaOf = (id) => META.find(m => m.id === id);
  const displayKey = () => (window.__dashboard && window.__dashboard.displayKey) || 'primary';

  /** 组件当前是否开启（沿用 app.js 的每屏显隐优先逻辑） */
  function isOn(id) {
    if (window.__dashboard && window.__dashboard.isWidgetVisible) {
      return window.__dashboard.isWidgetVisible(id);
    }
    return ((Store.get('settings') || {}).visibleWidgets || {})[id] !== false;
  }

  /**
   * 开启/关闭一个组件。
   * 开启时若本屏没有保存过位置 → 先找空位写入 displayLayout，
   * 这样 onConfigUpdated 走 applyLayout + initWidget 路径（不会被最小化到右上角），
   * 且落点可控，FLIP 飞行有明确目标。
   */
  function setEnabled(id, on, sourceRect) {
    const settings = JSON.parse(JSON.stringify(Store.get('settings') || {}));
    settings.visibleWidgets = settings.visibleWidgets || {};
    settings.visibleWidgets[id] = on;

    // 每屏独立显隐配置存在时同步更新（它优先生效，不同步会导致开关"看起来无效"）
    const dw = Store.get('displayWidgets');
    if (dw && dw[displayKey()]) {
      dw[displayKey()][id] = on;
      Store.set('displayWidgets', dw);
    }

    if (on) {
      const dl = Store.get('displayLayout') || {};
      const mine = dl[displayKey()] || {};
      if (!mine[id]) {
        const size = defaultSize(id);
        mine[id] = findFreeSpot(size.w, size.h);
        dl[displayKey()] = mine;
        Store.set('displayLayout', dl);
      }
    }

    Store.set('settings', settings);
    // 飞入动画的来源矩形，onConfigUpdated 消费后清除
    if (on && sourceRect && window.__dashboard) {
      window.__dashboard._pendingReveal = { name: id, rect: sourceRect, t: Date.now() };
    }
    // 广播到所有看板窗口（含本窗口，触发 onConfigUpdated → 布局 + 初始化 + 飞入）
    if (window.dashboard && window.dashboard.refreshMain) window.dashboard.refreshMain();
  }

  /** 组件默认尺寸：取 index.html 内联 style 的 width/height（display:none 也能读） */
  function defaultSize(id) {
    const el = document.querySelector(`.widget[data-widget="${id}"]`);
    const w = el && parseInt(el.style.width) || 300;
    const h = el && parseInt(el.style.height) || 260;
    return {
      w: Math.min(w, window.innerWidth - 100),
      h: Math.min(h, window.innerHeight - 100),
    };
  }

  /** 在屏幕上找一个不与现有卡片重叠的空位（从左上向右下扫描） */
  function findFreeSpot(w, h) {
    const sw = window.innerWidth, sh = window.innerHeight;
    const occupied = [...document.querySelectorAll('.widget[data-widget]')]
      .filter(el => el.style.display !== 'none')
      .map(el => el.getBoundingClientRect());
    for (let y = 48; y <= sh - h - 40; y += 48) {
      for (let x = 48; x <= sw - w - 40; x += 48) {
        const overlap = occupied.some(o =>
          !(x + w < o.left + 10 || x > o.right - 10 || y + h < o.top + 10 || y > o.bottom - 10));
        if (!overlap) return { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' };
      }
    }
    // 没有空位：右上角兜底（与 placeNewWidgetsMinimized 一致）
    return { left: (sw - w - 30) + 'px', top: '50px', width: w + 'px', height: h + 'px' };
  }

  /** 是否应跳过动画（省电档 / 系统减少动态偏好） */
  function _skipAnim() {
    return (Store.get('settings') || {}).refreshRate === 'eco' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * FLIP 飞入：ghost 卡片从来源矩形（组件库格位/扇形牌位/坞图标）
   * 飞到组件落点，落地后组件以弹跳呈现。
   */
  function flyIn(el, sourceRect) {
    if (!el) return Promise.resolve();
    if (!sourceRect || _skipAnim()) {
      Sound.land();
      try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }); } catch (e) {}
      return Promise.resolve();
    }
    const target = el.getBoundingClientRect();
    const meta = metaOf(el.dataset.widget) || { icon: '🧩', name: '' };
    const ghost = document.createElement('div');
    ghost.className = 'wp-ghost';
    ghost.innerHTML = `<div class="wp-ghost__icon">${meta.icon}</div><div class="wp-ghost__name">${meta.name}</div>`;
    ghost.style.left = target.left + 'px';
    ghost.style.top = target.top + 'px';
    ghost.style.width = target.width + 'px';
    ghost.style.height = target.height + 'px';

    const dx = (sourceRect.left + sourceRect.width / 2) - (target.left + target.width / 2);
    const dy = (sourceRect.top + sourceRect.height / 2) - (target.top + target.height / 2);
    const sx = Math.max(0.3, sourceRect.width / target.width);
    const sy = Math.max(0.3, sourceRect.height / target.height);

    el.style.opacity = '0';
    document.body.appendChild(ghost);
    let anim;
    try {
      anim = ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(3deg)`, opacity: 0.95 },
        { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)', opacity: 1 },
      ], { duration: 520, easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)' });
    } catch (e) {
      ghost.remove(); el.style.opacity = '';
      return Promise.resolve();
    }
    return anim.finished.then(() => {
      ghost.remove();
      el.style.opacity = '';
      // 落地仪式：琶音 + 金色粒子迸发
      Sound.land();
      burstParticles(target.left + target.width / 2, target.top + target.height / 2);
      try {
        el.animate([{ transform: 'scale(0.94)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 200, easing: 'ease-out' });
      } catch (e) {}
    }).catch(() => { ghost.remove(); el.style.opacity = ''; });
  }

  // ===== 鼠标接管（沿用 profile-save-prompt 的成熟模式）=====

  function grabMouse() {
    // 打开瞬间立即关闭穿透（否则点击落到桌面、输入框无法聚焦）
    if (window.dashboard && window.dashboard.setMouseIgnore) window.dashboard.setMouseIgnore(false);
  }

  function releaseMouse() {
    if (document.body.classList.contains('interactive')) return;  // 编辑模式由模式切换管穿透
    if (window.dashboard && window.dashboard.setMouseIgnore) window.dashboard.setMouseIgnore(true);
    if (typeof ClickThrough !== 'undefined') ClickThrough.reset();
  }

  // ============================================================
  // C. 扑克抽取（卡堆 + 扇形展开 + 翻牌）
  // ============================================================

  function openFan() {
    if (_open === 'fan') return closeFan();
    _open = 'fan';
    grabMouse();

    // 牌堆：17 组件 + 正中插入「今日运势」金卡
    const fanCards = META.slice();
    fanCards.splice(Math.floor(META.length / 2), 0, {
      id: 'fortune', icon: '🎴', name: '今日运势',
      desc: fortuneDrawnToday() ? '已抽 · 点击再看' : '每日一抽 · 点击开运',
    });
    const n = fanCards.length;
    const spread = Math.min(8.5, 172 / n);                    // 每张牌的角度
    const R = Math.max(240, Math.min(window.innerHeight * 0.34, 430));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.52;
    const deckY = window.innerHeight - 60;                    // 发牌起点（卡堆位置）

    const ov = document.createElement('div');
    ov.id = 'wp-fan';
    ov.className = 'no-drag wp-fan-overlay';
    ov.innerHTML = fanCards.map((m) => `
      <div class="wp-fcard ${m.id === 'fortune' ? 'wp-fcard--fortune' : ''} ${m.id !== 'fortune' && isOn(m.id) ? 'wp-fcard--on' : ''}" data-id="${m.id}" title="${m.name}：${m.desc}">
        <div class="wp-fcard__lift">
          <div class="wp-fcard__inner">
            <div class="wp-fcard__face wp-fcard__face--back">
              <span class="wp-fcard__bigicon">${m.icon}</span>
              <span class="wp-fcard__backname">${m.name}</span>
            </div>
            <div class="wp-fcard__face wp-fcard__face--front">
              <div class="wp-fcard__icon">${m.icon}</div>
              <div class="wp-fcard__name">${m.name}</div>
              <div class="wp-fcard__state">${m.id === 'fortune' ? m.desc : (isOn(m.id) ? '已开启 · 点击关闭' : '点击抽取')}</div>
            </div>
          </div>
        </div>
      </div>`).join('') +
      `<div class="wp-fan-hint">🃏 悬停看牌面 · 点击抽上桌 · Esc / 点空白处收牌 <span class="wp-sndbtn" title="音效开关">${Sound.enabled ? '🔊' : '🔇'}</span></div>`;
    document.body.appendChild(ov);

    // 音效开关（提示行内，独立于浮层关闭逻辑）
    ov.querySelector('.wp-sndbtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const on = Sound.toggle();
      e.target.textContent = on ? '🔊' : '🔇';
      if (on) Sound.flip();
    });

    // 发牌动画：先全部叠在卡堆处，再交错飞到扇形位（伴随洗牌声）
    const cards = [...ov.querySelectorAll('.wp-fcard')];
    cards.forEach((card) => {
      card.style.opacity = '0';
      card.style.transform = `translate(${cx}px, ${deckY}px) translate(-50%, -50%) scale(0.5)`;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ov.classList.add('wp-open');
      cards.forEach((card, i) => {
        const a = (i - (n - 1) / 2) * spread;
        card.style.transitionDelay = (i * 26) + 'ms';
        card.style.opacity = '1';
        // rotate → 半径位移 → 反向 rotate：牌沿弧排列且保持直立
        card.style.transform =
          `translate(${cx}px, ${cy}px) translate(-50%, -50%) rotate(${a}deg) translateY(${-R}px) rotate(${-a}deg)`;
        setTimeout(() => Sound.deal(), i * 26);
      });
      setTimeout(() => cards.forEach(c => { c.style.transitionDelay = '0ms'; }), n * 26 + 650);
    }));

    // 悬停看牌：悬停翻面看完整信息（图标/名称/状态），移开翻回花背；
    // 正在抽取（drawing）的牌不受影响
    cards.forEach(card => {
      const inner = card.querySelector('.wp-fcard__inner');
      card.addEventListener('mouseenter', () => {
        if (!card.dataset.drawing) inner.classList.add('is-flipped');
      });
      card.addEventListener('mouseleave', () => {
        if (!card.dataset.drawing) inner.classList.remove('is-flipped');
      });
    });

    ov.addEventListener('click', (e) => {
      if (e.target.closest('.wp-sndbtn')) return;
      const card = e.target.closest('.wp-fcard');
      if (!card) { closeFan(); return; }   // 点空白收牌
      const id = card.dataset.id;
      const inner = card.querySelector('.wp-fcard__inner');
      if (id === 'fortune') { showFortune(); return; }
      if (isOn(id)) {
        setEnabled(id, false);
        card.classList.remove('wp-fcard--on');
        const st = card.querySelector('.wp-fcard__state');
        if (st) st.textContent = '点击抽取';
        inner.classList.remove('is-flipped');
        return;
      }
      // 抽牌：翻面 → 飞入桌面 → 收牌
      const rect = card.getBoundingClientRect();
      card.dataset.drawing = '1';
      inner.classList.add('is-flipped');
      Sound.flip();
      setTimeout(() => {
        closeFan();
        setEnabled(id, true, rect);
      }, 260);
    });
  }

  /** 今日运势：抽卡结果弹层（金卡仪式：琶音 + 粒子） */
  function showFortune() {
    document.getElementById('wp-fortune')?.remove();
    const f = fortuneOf();
    const isNew = !fortuneDrawnToday();
    if (isNew) {
      try { localStorage.setItem('wp_fortune', JSON.stringify({ date: f.date, t: f.t })); } catch (e) {}
    }
    const m = metaOf(f.w);
    const suggestBtn = m && !isOn(f.w)
      ? `<button data-act="open">开启「${m.name}」沾好运</button>` : '';

    const pop = document.createElement('div');
    pop.id = 'wp-fortune';
    pop.className = 'no-drag wp-fortune';
    pop.innerHTML = `
      <div class="wp-fortune__card">
        <div class="wp-fortune__icon">🎴</div>
        <div class="wp-fortune__title">${f.t}</div>
        <div class="wp-fortune__text">${f.d}</div>
        <div class="wp-fortune__meta">— ${f.date} · 每日运势 —</div>
        <div class="wp-fortune__btns">${suggestBtn}<button data-act="ok">知道了</button></div>
      </div>`;
    document.body.appendChild(pop);
    requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('wp-open')));
    if (isNew) {
      Sound.fortune();
      burstParticles(window.innerWidth / 2, window.innerHeight / 2 - 80, 16);
    } else {
      Sound.flip();
    }

    pop.addEventListener('click', (e) => {
      if (e.target === pop) { pop.remove(); return; }
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'open') {
        const rect = btn.getBoundingClientRect();
        pop.remove();
        closeFan();
        setEnabled(f.w, true, rect);
      } else {
        pop.remove();
      }
    });
  }

  function closeFan() {
    const ov = document.getElementById('wp-fan');
    if (ov) {
      // 收牌仪式：牌交错飞回卡堆再淡出
      const cx = window.innerWidth / 2;
      const deckY = window.innerHeight - 60;
      ov.querySelectorAll('.wp-fcard').forEach((c, i) => {
        c.style.transitionDelay = Math.min(i * 14, 220) + 'ms';
        c.style.transform = `translate(${cx}px, ${deckY}px) translate(-50%, -50%) scale(0.5)`;
        c.style.opacity = '0';
      });
      ov.classList.remove('wp-open');
      setTimeout(() => ov.remove(), 520);
      Sound.close();
    }
    _open = null;
    releaseMouse();
  }

  // ============================================================
  // A. 边缘坞（右缘热区 + 滑出图标栏）
  // ============================================================

  function buildEdgeDock() {
    document.body.insertAdjacentHTML('beforeend', '<div id="wp-hotzone"></div>');

    const dock = document.createElement('div');
    dock.id = 'wp-dock';
    dock.className = 'no-drag';
    dock.innerHTML =
      `<div class="wp-dock__head" title="看板组件坞：点击图标开启/关闭对应卡片">${'🧩'}</div>` +
      META.map(m => `
      <div class="wp-dock__item ${isOn(m.id) ? 'wp-dock__item--on' : ''}" data-id="${m.id}">
        ${m.icon}
      </div>`).join('') + '<div class="wp-dock__tip">贴右缘唤出</div>';
    document.body.appendChild(dock);

    // 信息提示：挂在 body 的浮动层（坞容器 overflow 会裁剪内部定位的标签，
    // 且固定在图标左侧不会被鼠标挡住）
    const showTip = (item) => {
      hideTip();
      const m = metaOf(item.dataset.id);
      if (!m) return;
      _dockTip = document.createElement('div');
      _dockTip.className = 'wp-docktip';
      _dockTip.textContent = `${m.name} · ${m.desc} · 点击${isOn(m.id) ? '关闭' : '开启'}`;
      document.body.appendChild(_dockTip);
      const r = item.getBoundingClientRect();
      _dockTip.style.left = (r.left - _dockTip.offsetWidth - 12) + 'px';  // 图标左侧 12px
      _dockTip.style.top = (r.top + r.height / 2) + 'px';                 // 与图标垂直居中
    };
    const hideTip = () => { if (_dockTip) { _dockTip.remove(); _dockTip = null; } };

    dock.querySelectorAll('.wp-dock__item').forEach((item, idx) => {
      item.addEventListener('mouseenter', () => { showTip(item); Sound.chime(idx); });
      item.addEventListener('mouseleave', hideTip);
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (isOn(id)) {
          // 关闭小仪式：图标抖一下再熄灭 + 下行双音
          Sound.off();
          try {
            item.animate([
              { transform: 'rotate(0deg)' },
              { transform: 'rotate(-12deg) scale(0.88)' },
              { transform: 'rotate(9deg) scale(0.92)' },
              { transform: 'rotate(0deg) scale(1)' },
            ], { duration: 280, easing: 'ease-out' });
          } catch (e) {}
          setEnabled(id, false);
          item.classList.remove('wp-dock__item--on');
        } else {
          // 开启小仪式：轻嗒 + 图标处小粒子（落地还有琶音+大粒子）
          Sound.tick();
          const rect = item.getBoundingClientRect();
          burstParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
          hideTip();
          closeDock();
          setEnabled(id, true, rect);
          return;
        }
        showTip(item);   // 关闭后状态变了，刷新提示文字
      });
    });

    // 热区判定用 mousemove 坐标（穿透态下 Windows 仍能收到转发的 mousemove）
    document.addEventListener('mousemove', (e) => {
      if (_open || document.querySelector('.widget.dragging')) { _dockArmAt = 0; return; }
      const nearEdge = e.clientX >= window.innerWidth - 8;
      if (nearEdge) {
        if (!_dockArmAt) _dockArmAt = Date.now();
        if (!_dockOpen && Date.now() - _dockArmAt >= 300) openDock();
        cancelDockClose();
      } else if (_dockOpen) {
        // 鼠标离开坞区域（64px 宽 + 缓冲）→ 延时收起
        if (e.clientX < window.innerWidth - 96) scheduleDockClose();
        else cancelDockClose();
      } else {
        _dockArmAt = 0;
      }
    }, { passive: true });
  }

  function openDock() {
    const dock = document.getElementById('wp-dock');
    if (!dock) return;
    _dockOpen = true;
    dock.classList.add('wp-dock--open');
    // 滑出仪式：上扬滑音 + 图标逐个弹出（迷你发牌）
    Sound.dockOpen();
    dock.querySelectorAll('.wp-dock__item').forEach((it, i) => {
      try {
        it.animate([
          { transform: 'translateX(22px) scale(0.4)', opacity: 0 },
          { transform: 'translateX(0) scale(1)', opacity: 1 },
        ], { duration: 260, delay: Math.min(i * 18, 260), easing: 'cubic-bezier(0.3, 1.35, 0.45, 1)', fill: 'backwards' });
      } catch (e) {}
    });
  }

  function scheduleDockClose() {
    cancelDockClose();
    _dockCloseTimer = setTimeout(closeDock, 700);
  }

  function cancelDockClose() {
    if (_dockCloseTimer) { clearTimeout(_dockCloseTimer); _dockCloseTimer = null; }
  }

  function closeDock() {
    cancelDockClose();
    if (_dockTip) { _dockTip.remove(); _dockTip = null; }
    const dock = document.getElementById('wp-dock');
    if (dock) {
      if (_dockOpen) Sound.dockClose();   // 收起仪式：下行滑音
      dock.classList.remove('wp-dock--open');
    }
    _dockOpen = false;
    _dockArmAt = 0;
  }

  // ============================================================
  // 桌面卡堆（扑克抽取入口，常驻）
  // ============================================================

  function buildDeck() {
    const deck = document.createElement('div');
    deck.id = 'wp-deck';
    deck.className = 'no-drag';
    deck.title = '抽取组件（扑克牌模式）：点击展开牌堆，悬停看牌面';
    deck.innerHTML = `
      <div class="wp-deck__card"></div>
      <div class="wp-deck__card"></div>
      <div class="wp-deck__card"></div>
      <div class="wp-deck__tip">抽卡 · 开组件</div>`;
    deck.addEventListener('click', () => (_open === 'fan' ? closeFan() : openFan()));
    document.body.appendChild(deck);
  }

  // ===== Esc 统一关闭 =====
  function initKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const pop = document.getElementById('wp-fortune');
      if (pop) { e.stopPropagation(); pop.remove(); return; }   // 先关运势弹层，扇形保留
      if (_open === 'fan') { e.stopPropagation(); closeFan(); }
      else if (_dockOpen) closeDock();
    });
  }

  function init() {
    buildDeck();
    buildEdgeDock();
    initKeys();
    // 主进程快捷键/托盘 → 只发给鼠标所在屏的窗口
    if (window.dashboard && window.dashboard.onFanToggle) {
      window.dashboard.onFanToggle(() => openFan());
    }
    console.info('[picker] 抽卡(桌面卡堆/Ctrl+Shift+A) / 边缘坞(贴右缘) 就绪');
  }

  return { init, isOn, setEnabled, flyIn, openFan, closeFan };
})();
