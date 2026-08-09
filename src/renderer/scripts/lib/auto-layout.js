/* ============================================================
   智能自动布局 v2
   核心算法：黄金比例分区 + Masonry 瀑布流
   - 按 1:1.618 黄金比例把屏幕分为主区（大卡片）和侧区（小卡片）
   - 每个区内用 Masonry 瀑布流紧凑排列，无大块空白
   - 卡片高度贴近内容实际需求，不强行拉伸
   - 适配任意分辨率，卡片分类（主/侧）决定放哪个区
   ============================================================ */

const AutoLayout = {
  // 黄金比例
  GOLDEN: 1.618,

  // 卡片规格：区域(main=主区/side=侧区) + 理想尺寸 + 优先级
  WIDGET_SPEC: {
    // 主区（62%宽）：放需要交互/内容多的卡片
    todo:       { area: 'main',  w: 360, h: 360, priority: 1 },
    news:       { area: 'main',  w: 360, h: 480, priority: 3 },
    stock:      { area: 'main',  w: 360, h: 280, priority: 2 },
    hotsearch:  { area: 'main',  w: 360, h: 400, priority: 3 },
    calendar:   { area: 'main',  w: 360, h: 300, priority: 2 },
    // 侧区（38%宽）：放只读/紧凑的卡片
    clock:      { area: 'side',  w: 280, h: 150, priority: 1 },
    weather:    { area: 'side',  w: 280, h: 170, priority: 1 },
    sysmonitor: { area: 'side',  w: 280, h: 240, priority: 2 },
    countdown:  { area: 'side',  w: 280, h: 240, priority: 3 },
    pomodoro:   { area: 'side',  w: 280, h: 340, priority: 2 },
    links:      { area: 'side',  w: 280, h: 280, priority: 3 },
    schulte:    { area: 'side',  w: 280, h: 380, priority: 4 },
    apps:       { area: 'side',  w: 240, h: 300, priority: 3 },
    deskfolders:{ area: 'side',  w: 240, h: 240, priority: 3 },
    deskfiles:  { area: 'side',  w: 240, h: 280, priority: 3 },
  },

  compute(screenW, screenH, visible) {
    const margin = 24;
    const gap = 20;

    // 收集可见卡片
    const all = Object.keys(this.WIDGET_SPEC)
      .filter(k => visible[k] !== false)
      .map(k => ({ key: k, ...this.WIDGET_SPEC[k] }));

    if (all.length === 0) return {};

    // 按区域分组
    const mainWidgets = all.filter(w => w.area === 'main').sort((a, b) => a.priority - b.priority);
    const sideWidgets = all.filter(w => w.area === 'side').sort((a, b) => a.priority - b.priority);

    // ===== 按黄金比例划分屏幕宽度 =====
    // 主区 : 侧区 = 1.618 : 1 （约 62% : 38%）
    const availW = screenW - margin * 2 - gap;
    let mainW = Math.round(availW / this.GOLDEN);
    let sideW = availW - mainW;

    // 窄屏特殊处理：侧区最小 260，主区最小 320
    const MIN_SIDE = 260, MIN_MAIN = 320;
    if (sideW < MIN_SIDE) {
      sideW = MIN_SIDE;
      mainW = availW - sideW;
    }
    if (mainW < MIN_MAIN) {
      // 屏幕太窄，主侧合并为单列瀑布流
      return this._singleColumnMasonry(all, screenW, screenH, margin, gap);
    }

    const layout = {};

    // ===== 主区 Masonry 瀑布流 =====
    const mainCols = mainW >= 760 ? 2 : 1;
    this._masonryFill(mainWidgets, mainW, mainCols, margin, screenH - margin, gap, layout);

    // ===== 侧区 Masonry 瀑布流 =====
    // 侧区宽度足够（>520）时分2列，避免小卡片堆太高
    const sideX = margin + mainW + gap;
    const sideCols = sideW >= 520 ? 2 : 1;
    this._masonryFill(sideWidgets, sideW, sideCols, sideX, screenH - margin, gap, layout);

    return layout;
  },

  /**
   * Masonry 瀑布流填充算法
   * 把卡片放入多列，每次放最矮的列（first-fit）
   * 卡片高度按内容需求，不拉伸；如溢出则等比压缩
   */
  _masonryFill(widgets, areaW, cols, startX, maxH, gap, layout) {
    if (widgets.length === 0) return;

    const colW = Math.floor((areaW - gap * (cols - 1)) / cols);
    const colHeights = new Array(cols).fill(startX === 0 ? 24 : 24);  // 起始 Y
    // 实际起始 Y 都用统一的 margin
    const startY = 24;
    for (let i = 0; i < cols; i++) colHeights[i] = startY;

    for (const w of widgets) {
      // 找最矮的列
      let bestCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[bestCol]) bestCol = c;
      }
      const left = startX + bestCol * (colW + gap);
      const top = colHeights[bestCol];

      layout[w.key] = {
        left: left + 'px',
        top: top + 'px',
        width: colW + 'px',
        height: w.h + 'px'
      };
      colHeights[bestCol] = top + w.h + gap;
    }

    // 溢出检测：如果最高列超出屏幕，等比压缩
    const maxBottom = Math.max(...colHeights) - gap;
    const screenBottom = maxH + 24;  // maxH 已是 screenH - margin
    if (maxBottom > screenBottom) {
      const scale = (screenBottom - startY) / (maxBottom - startY);
      for (const w of widgets) {
        if (!layout[w.key]) continue;
        const topNum = parseInt(layout[w.key].top);
        const hNum = parseInt(layout[w.key].height);
        layout[w.key].top = Math.round((topNum - startY) * scale + startY) + 'px';
        layout[w.key].height = Math.max(110, Math.round(hNum * scale)) + 'px';
      }
    }
  },

  /**
   * 单列瀑布流（超窄屏 fallback）
   */
  _singleColumnMasonry(widgets, screenW, screenH, margin, gap) {
    const colW = screenW - margin * 2;
    const startY = margin;
    const layout = {};
    let y = startY;
    for (const w of widgets) {
      layout[w.key] = {
        left: margin + 'px',
        top: y + 'px',
        width: colW + 'px',
        height: w.h + 'px'
      };
      y += w.h + gap;
    }
    // 溢出压缩
    const maxBottom = y - gap;
    if (maxBottom > screenH - margin) {
      const scale = (screenH - margin * 2) / (maxBottom - margin);
      for (const w of widgets) {
        const topNum = parseInt(layout[w.key].top);
        const hNum = parseInt(layout[w.key].height);
        layout[w.key].top = Math.round((topNum - margin) * scale + margin) + 'px';
        layout[w.key].height = Math.max(100, Math.round(hNum * scale)) + 'px';
      }
    }
    return layout;
  },

  apply(layout, clearOldPosition = true) {
    Object.entries(layout).forEach(([name, pos]) => {
      const el = document.querySelector(`.widget[data-widget="${name}"]`);
      if (!el) return;
      el.style.left = pos.left || '';
      el.style.top = pos.top || '';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = pos.width || '';
      el.style.height = pos.height || '';
    });
    if (clearOldPosition) {
      // 清空当前屏的手动布局（多显示器：按 displayKey 分桶）
      const displayKey = (window.__dashboard && window.__dashboard.displayKey) || 'primary';
      const displayLayout = Store.get('displayLayout') || {};
      displayLayout[displayKey] = {};
      Store.set('displayLayout', displayLayout);
    }
  }
};
