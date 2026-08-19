/* ============================================================
   卡片开启交互（三套方案并存，供对比后取舍）
   B. 组件库  — Ctrl+Shift+A / 托盘唤出，Launchpad 网格 + FLIP 飞入
   C. 扑克抽取 — 桌面底部卡堆，点击扇形展开，翻牌飞入桌面
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

  let _open = null;            // 'library' | 'fan' | null
  let _dockOpen = false;
  let _dockArmAt = 0;          // 鼠标贴右缘的起始时刻
  let _dockCloseTimer = null;

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
  // B. 组件库（Launchpad 网格）
  // ============================================================

  function openLibrary() {
    if (_open === 'library') return closeLibrary();
    if (_open) closeFan(true);
    _open = 'library';
    grabMouse();

    const cards = META.map(m => `
      <div class="wp-card ${isOn(m.id) ? 'wp-card--on' : ''}" data-id="${m.id}">
        <div class="wp-card__icon">${m.icon}</div>
        <div class="wp-card__name">${m.name}</div>
        <div class="wp-card__desc">${m.desc}</div>
        ${isOn(m.id) ? '<div class="wp-card__badge">已开启</div>' : ''}
      </div>`).join('');

    const ov = document.createElement('div');
    ov.id = 'wp-library';
    ov.className = 'no-drag wp-overlay';
    ov.innerHTML = `
      <div class="wp-panel">
        <div class="wp-head">
          <div class="wp-title">✦ 组件库</div>
          <div class="wp-count" id="wp-count"></div>
          <input class="wp-search" id="wp-search" placeholder="搜索组件…" autocomplete="off">
        </div>
        <div class="wp-grid" id="wp-grid">${cards}</div>
        <div class="wp-hint">点击卡片开启（飞入桌面）/ 再点关闭 · Esc 或点空白处退出</div>
      </div>`;
    document.body.appendChild(ov);
    updateCount();

    // 入场：网格卡片交错浮现
    ov.querySelectorAll('.wp-card').forEach((c, i) => {
      c.style.transitionDelay = Math.min(i * 26, 400) + 'ms';
    });
    requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('wp-open')));
    setTimeout(() => ov.querySelectorAll('.wp-card').forEach(c => { c.style.transitionDelay = '0ms'; }), 800);

    const search = ov.querySelector('#wp-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      ov.querySelectorAll('.wp-card').forEach(c => {
        const m = metaOf(c.dataset.id);
        const hit = !q || m.name.toLowerCase().includes(q) || m.id.includes(q) || m.desc.toLowerCase().includes(q);
        c.style.display = hit ? '' : 'none';
      });
    });
    search.focus();

    ov.querySelector('#wp-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.wp-card');
      if (!card) return;
      const id = card.dataset.id;
      if (isOn(id)) {
        // 已开启 → 关闭（浮层保持打开，可连续管理）
        setEnabled(id, false);
        card.classList.remove('wp-card--on');
        const badge = card.querySelector('.wp-card__badge');
        if (badge) badge.remove();
        updateCount();
      } else {
        // 未开启 → 记录格位矩形，关浮层，飞入桌面
        const rect = card.getBoundingClientRect();
        closeLibrary();
        setEnabled(id, true, rect);
      }
    });

    // 点空白（面板外）关闭
    ov.addEventListener('click', (e) => { if (e.target === ov) closeLibrary(); });

    function updateCount() {
      const n = META.filter(m => isOn(m.id)).length;
      const el = ov.querySelector('#wp-count');
      if (el) el.textContent = `已开启 ${n} / ${META.length}`;
    }
  }

  function closeLibrary() {
    const ov = document.getElementById('wp-library');
    if (!ov) { _open = null; return; }
    ov.classList.remove('wp-open');
    setTimeout(() => ov.remove(), 200);
    _open = null;
    releaseMouse();
  }

  // ============================================================
  // C. 扑克抽取（卡堆 + 扇形展开 + 翻牌）
  // ============================================================

  function openFan() {
    if (_open === 'fan') return closeFan();
    if (_open) closeLibrary();
    _open = 'fan';
    grabMouse();

    const n = META.length;
    const spread = Math.min(9, 168 / n);                      // 每张牌的角度
    const R = Math.max(240, Math.min(window.innerHeight * 0.34, 430));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.52;
    const deckY = window.innerHeight - 60;                    // 发牌起点（卡堆位置）

    const ov = document.createElement('div');
    ov.id = 'wp-fan';
    ov.className = 'no-drag wp-fan-overlay';
    ov.innerHTML = META.map((m, i) => `
      <div class="wp-fcard ${isOn(m.id) ? 'wp-fcard--on' : ''}" data-id="${m.id}">
        <div class="wp-fcard__lift">
          <div class="wp-fcard__inner">
            <div class="wp-fcard__face wp-fcard__face--back"></div>
            <div class="wp-fcard__face wp-fcard__face--front">
              <div class="wp-fcard__icon">${m.icon}</div>
              <div class="wp-fcard__name">${m.name}</div>
              <div class="wp-fcard__state">${isOn(m.id) ? '已开启 · 点击关闭' : '点击抽取'}</div>
            </div>
          </div>
        </div>
      </div>`).join('') + `<div class="wp-fan-hint">🃏 从牌堆抽一张组件上桌 · Esc / 点空白处收牌</div>`;
    document.body.appendChild(ov);

    // 发牌动画：先全部叠在卡堆处，再交错飞到扇形位
    ov.querySelectorAll('.wp-fcard').forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = `translate(${cx}px, ${deckY}px) translate(-50%, -50%) scale(0.5)`;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ov.classList.add('wp-open');
      ov.querySelectorAll('.wp-fcard').forEach((card, i) => {
        const a = (i - (n - 1) / 2) * spread;
        card.style.transitionDelay = (i * 26) + 'ms';
        card.style.opacity = '1';
        // rotate → 半径位移 → 反向 rotate：牌沿弧排列且保持直立
        card.style.transform =
          `translate(${cx}px, ${cy}px) translate(-50%, -50%) rotate(${a}deg) translateY(${-R}px) rotate(${-a}deg)`;
      });
      setTimeout(() => ov.querySelectorAll('.wp-fcard').forEach(c => { c.style.transitionDelay = '0ms'; }), n * 26 + 650);
    }));

    ov.addEventListener('click', (e) => {
      const card = e.target.closest('.wp-fcard');
      if (!card) { closeFan(); return; }   // 点空白收牌
      const id = card.dataset.id;
      const inner = card.querySelector('.wp-fcard__inner');
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
      inner.classList.add('is-flipped');
      setTimeout(() => {
        closeFan();
        setEnabled(id, true, rect);
      }, 260);
    });
  }

  function closeFan(silent) {
    const ov = document.getElementById('wp-fan');
    if (ov) {
      ov.classList.remove('wp-open');
      setTimeout(() => ov.remove(), 200);
    }
    _open = null;
    if (!silent) releaseMouse();
  }

  // ============================================================
  // A. 边缘坞（右缘热区 + 滑出图标栏）
  // ============================================================

  function buildEdgeDock() {
    document.body.insertAdjacentHTML('beforeend', '<div id="wp-hotzone"></div>');

    const dock = document.createElement('div');
    dock.id = 'wp-dock';
    dock.className = 'no-drag';
    dock.innerHTML = META.map(m => `
      <div class="wp-dock__item ${isOn(m.id) ? 'wp-dock__item--on' : ''}" data-id="${m.id}">
        ${m.icon}<span class="wp-dock__label">${m.name} · ${isOn(m.id) ? '关闭' : '开启'}</span>
      </div>`).join('') + '<div class="wp-dock__tip">贴右缘唤出</div>';
    document.body.appendChild(dock);

    dock.addEventListener('click', (e) => {
      const item = e.target.closest('.wp-dock__item');
      if (!item) return;
      const id = item.dataset.id;
      if (isOn(id)) {
        setEnabled(id, false);
        item.classList.remove('wp-dock__item--on');
        const label = item.querySelector('.wp-dock__label');
        if (label) label.textContent = `${metaOf(id).name} · 开启`;
      } else {
        const rect = item.getBoundingClientRect();
        closeDock();
        setEnabled(id, true, rect);
      }
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
    const dock = document.getElementById('wp-dock');
    if (dock) dock.classList.remove('wp-dock--open');
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
    deck.title = '抽取组件（扑克牌模式）';
    deck.innerHTML = `
      <div class="wp-deck__card"></div>
      <div class="wp-deck__card"></div>
      <div class="wp-deck__card"></div>
      <div class="wp-deck__tip">抽卡</div>`;
    deck.addEventListener('click', () => (_open === 'fan' ? closeFan() : openFan()));
    document.body.appendChild(deck);
  }

  // ===== Esc 统一关闭 =====
  function initKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (_open === 'library') { e.stopPropagation(); closeLibrary(); }
      else if (_open === 'fan') { e.stopPropagation(); closeFan(); }
      else if (_dockOpen) closeDock();
    });
  }

  function init() {
    buildDeck();
    buildEdgeDock();
    initKeys();
    // 主进程快捷键/托盘 → 只发给鼠标所在屏的窗口
    if (window.dashboard && window.dashboard.onLibraryToggle) {
      window.dashboard.onLibraryToggle(() => openLibrary());
    }
    console.info('[picker] 组件库(Ctrl+Shift+A) / 抽卡(桌面卡堆) / 边缘坞(贴右缘) 就绪');
  }

  return { init, isOn, setEnabled, flyIn, openLibrary, closeLibrary, openFan, closeFan };
})();
