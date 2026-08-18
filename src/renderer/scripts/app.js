/* ============================================================
   渲染进程主逻辑
   ============================================================ */

(function () {
  'use strict';

  // 各 widget 的定时器
  const timers = {};

  // 当前窗口所属显示器的 key（'primary' 或具体 displayId）
  // 用于多显示器下按屏独立布局和卡片显隐
  let _displayKey = 'primary';
  let _isPrimary = true;

  document.addEventListener('DOMContentLoaded', async () => {
    // 加载存储（异步）
    await Store.load();

    // 获取当前窗口的显示器标识
    try {
      const displays = await window.dashboard.getAllDisplays();
      const myId = await window.dashboard.getCurrentDisplayId();
      const primary = displays.find(d => d.isPrimary);
      if (primary && myId === primary.id) {
        _displayKey = 'primary';
        _isPrimary = true;
      } else {
        _displayKey = String(myId);
        _isPrimary = false;
      }
    } catch (e) {
      _displayKey = 'primary';
      _isPrimary = true;
    }
    // 暴露给其他模块（drag-resize.js 保存布局时用）
    window.__dashboard = window.__dashboard || {};
    window.__dashboard.displayKey = _displayKey;

    // 应用模块显隐
    applyWidgetVisibility();

    // 应用布局：有手动拖拽记录用手动的，否则自动排列
    const savedLayout = getDisplayLayout();
    if (Object.keys(savedLayout).length > 0) {
      // 用户拖过，用手动位置
      applyLayout(savedLayout);
    } else {
      // 首次或重置后，自动排列
      autoArrange();
    }

    // 初始化拖拽缩放（轻量，立即）
    DragResize.init();

    // 初始化区域穿透（卡片可点、空白穿透）— 轻量，立即
    ClickThrough.init();

    // 应用主题和透明度 — 立即，首屏配色就位
    applyTheme(Store.get('settings')?.theme);
    applyGlobalOpacity();

    // 初始化交互模式 — 立即
    initInteractionMode();

    // ===== 启动性能优化：widget 分批错峰初始化 =====
    // 避免启动瞬间 16 个 widget + PowerShell 扫描 + 网络请求同时抢占 CPU，
    // 导致整机卡顿。改为：首屏（时钟）秒出，其余按优先级错峰加载。

    // 第一批（立即）：时钟 — 用户第一眼要看的
    if (isWidgetVisible('clock')) ClockWidget.init();

    // 第二批（~120ms 后）：本地计算为主的轻量 widget
    setTimeout(() => {
      if (isWidgetVisible('todo')) TodoWidget.init();
      if (isWidgetVisible('countdown')) CountdownWidget.init();
      if (isWidgetVisible('calendar')) CalendarWidget.init();
      if (isWidgetVisible('pomodoro')) PomodoroWidget.init();
      if (isWidgetVisible('sysmonitor')) SysMonitorWidget.init();
    }, 120);

    // 第三批（~350ms 后）：需要网络请求 / 较重的 widget
    setTimeout(() => {
      if (isWidgetVisible('weather')) WeatherWidget.init();
      if (isWidgetVisible('stock')) StockWidget.init();
      if (isWidgetVisible('news')) NewsWidget.init();
      if (isWidgetVisible('links')) LinksWidget.init();
      if (isWidgetVisible('hotsearch')) HotSearchWidget.init();
      if (isWidgetVisible('schulte')) SchulteWidget.init();
      if (isWidgetVisible('mokugyo')) MokugyoWidget.init();
      if (isWidgetVisible('tarot')) TarotWidget.init();
      // 桌面绿植 + 天气特效（图片/Canvas 资源）
      if (typeof Plants !== "undefined" && Store.get('settings')?.plantEnabled !== false) Plants.init();
      if (typeof WeatherFX !== "undefined" && Store.get('settings')?.weatherFx !== false) WeatherFX.init();
    }, 350);

    // 第四批（~600ms 后）：桌面整理卡片 — 图标提取已改为 Electron 原生
    // getFileIcon（进程内毫秒级，无 PowerShell），延后到首屏渲染后即可
    setTimeout(() => {
      if (isWidgetVisible('apps') || isWidgetVisible('deskfolders') || isWidgetVisible('deskfiles')) {
        DesktopWidget.init();
      }
    }, 600);

    // 自动避让：不再用 MutationObserver 全局监听（太耗 CPU）
    // 改为只在 refreshAllWidgets 后触发一次（数据更新时才检查）
    // 首次加载后做一次
    setTimeout(() => { if (typeof AutoResize !== 'undefined') AutoResize.check(); }, 3000);

    // 监听刷新
    if (window.dashboard && window.dashboard.onRefreshAll) {
      window.dashboard.onRefreshAll(() => refreshAllWidgets());
    }

    // 窗口可见性管理：隐藏时暂停数据定时器，可见时恢复（减少后台 CPU/网络开销）
    let refreshDebounce = null;
    function debouncedRefresh() {
      clearTimeout(refreshDebounce);
      refreshDebounce = setTimeout(() => refreshAllWidgets(), 300);
    }
    // 保存定时器配置以便恢复
    const _savedTimers = {};  // key -> { type:'interval'|'timeout', fn, ms, id }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        debouncedRefresh();
      }
      // document.hidden 在穿透模式下不触发（窗口始终"可见"），
      // 但 Win+D 恢复/最小化会触发，暂停不必要的数据请求
    });

    // 监听托盘"自动排列"指令
    if (window.dashboard && window.dashboard.onAutoArrange) {
      window.dashboard.onAutoArrange(() => compactArrange());
    }

    // 监听配置更新（设置窗口保存后触发）→ 重新加载配置并刷新
    if (window.dashboard && window.dashboard.onConfigUpdated) {
      window.dashboard.onConfigUpdated(async () => {
        // 记录修改前可见的卡片
        const prevVisible = {};
        document.querySelectorAll('.widget[data-widget]').forEach(el => {
          if (el.style.display !== 'none') prevVisible[el.dataset.widget] = true;
        });

        await Store.load();
        console.info('[config-updated] displayLayout 屏数:', Object.keys(Store.get('displayLayout') || {}).length,
          '本屏卡片布局数:', Object.keys((Store.get('displayLayout') || {})[_displayKey] || {}).length);
        applyTheme(Store.get('settings')?.theme);
        applyGlobalOpacity();
        // 布局可能被切换（布局方案应用），重新应用并拉回可视区
        applyLayout(Store.get('displayLayout'));
        if (typeof Plants !== 'undefined') {
          if (Store.get('settings')?.plantEnabled !== false) { Plants.enable(); Plants.setPlant(Store.get('plant') || 'grass'); }
          else Plants.disable();
        }
        // 自定义木鱼图：保存后实时更新（不重建 DOM，只换 img src）
        if (typeof MokugyoWidget !== 'undefined' && MokugyoWidget.update) MokugyoWidget.update();
        // 全屏天气特效开关：保存后实时生效
        if (typeof WeatherFX !== 'undefined') {
          if (Store.get('settings')?.weatherFx !== false) WeatherFX.enable();
          else WeatherFX.disable();
        }

        // 找出新增的卡片（之前不可见，现在可见）
        const newWidgets = [];
        // 布局方案里已指定位置的卡片不做最小化放置（方案含全套位置，切换后原样呈现）
        const profilePositions = (Store.get('displayLayout') || {})[_displayKey] || {};
        document.querySelectorAll('.widget[data-widget]').forEach(el => {
          const name = el.dataset.widget;
          const nowVisible = isWidgetVisible(name);
          if (nowVisible && !prevVisible[name] && !profilePositions[name]) {
            newWidgets.push(name);
          }
        });
        // 方案中指定了位置的新显示卡片：只初始化，不最小化、不打乱位置
        const profileRevealed = [];
        document.querySelectorAll('.widget[data-widget]').forEach(el => {
          const name = el.dataset.widget;
          if (isWidgetVisible(name) && !prevVisible[name] && profilePositions[name]) {
            profileRevealed.push(name);
          }
        });

        applyWidgetVisibility();

        // 清理被隐藏 widget 的定时器
        Object.keys(timers).forEach(key => {
          if (!isWidgetVisible(key)) {
            clearInterval(timers[key]);
            delete timers[key];
          }
        });

        if (newWidgets.length > 0) {
          // 新增卡片：以最小尺寸放到右上角，不打乱已有布局
          placeNewWidgetsMinimized(newWidgets);
          // 只初始化新增的 widget
          newWidgets.forEach(name => initWidget(name));
        } else {
          // 没有新增：只刷新数据
          refreshAllWidgets();
        }
        // 方案揭示的卡片：位置已在 applyLayout 应用，只初始化数据
        profileRevealed.forEach(name => initWidget(name));
        console.log('[Dashboard] 配置已更新，新增卡片:', newWidgets);
      });
    }

    // 监听屏幕尺寸变化（防抖 500ms）→ 自动重排
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // 仅当用户没手动拖过才自动重排（避免覆盖用户布局）
        const savedLayout = getDisplayLayout();
        if (Object.keys(savedLayout).length === 0) {
          autoArrange();
        }
      }, 500);
    });

    console.log('[Dashboard] 初始化完成');
  });

  // ============================================================
  // 交互模式
  // ============================================================

  async function initInteractionMode() {
    if (!window.dashboard) return;
    let currentMode = await window.dashboard.getInteractionMode();
    applyModeUI(currentMode);

    window.dashboard.onInteractionModeChanged((interactive) => {
      applyModeUI(interactive);
    });
  }

  function applyModeUI(interactive) {
    const banner = document.getElementById('mode-banner');
    if (interactive) {
      document.body.classList.add('interactive');
      banner.classList.remove('hidden');
    } else {
      // 退出编辑：本次编辑拖动过卡片 → 提示保存为布局方案（浮层期间保持可交互）
      if (typeof DragResize !== 'undefined' && DragResize._dirty) {
        DragResize._dirty = false;
        showProfileSavePrompt();
        return;
      }
      finishExitEditMode();
    }
  }

  /** 真正退出编辑模式（浮层关闭后执行） */
  function finishExitEditMode() {
    document.body.classList.remove('interactive');
    const banner = document.getElementById('mode-banner');
    banner.classList.add('hidden');
    // 模式切换后重置区域穿透状态
    if (typeof ClickThrough !== 'undefined') ClickThrough.reset();
  }

  /**
   * 退出编辑模式时的"保存布局方案"命名浮层。
   * 方案 = 全套快照（卡片位置/大小 + 模块显隐），保存后托盘「布局方案」直接可切。
   */
  function showProfileSavePrompt() {
    if (document.getElementById('profile-save-prompt')) return;
    const overlay = document.createElement('div');
    overlay.id = 'profile-save-prompt';
    overlay.className = 'no-drag';
    overlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;background:rgba(28,28,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px 24px;color:#fff;display:flex;flex-direction:column;gap:10px;min-width:300px;box-shadow:0 12px 44px rgba(0,0,0,0.5);';
    overlay.innerHTML = `
      <div style="font-weight:600;font-size:15px">🗂️ 保存当前布局为方案？</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.55);line-height:1.5">保存卡片位置、大小和模块显隐。<br>之后可在 托盘右键 → 布局方案 一键切回。</div>
      <input type="text" id="profile-prompt-name" placeholder="方案名，如：工作模式" maxlength="12"
        style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);border-radius:8px;padding:9px 12px;color:#fff;font-size:14px;outline:none;">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        <button data-act="skip" style="padding:8px 16px;border:none;border-radius:8px;background:rgba(255,255,255,0.14);color:#fff;font-size:13px;cursor:pointer">跳过</button>
        <button data-act="save" style="padding:8px 16px;border:none;border-radius:8px;background:#0ABAB5;color:#fff;font-size:13px;font-weight:500;cursor:pointer">📷 存为方案</button>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#profile-prompt-name');
    input.focus();

    overlay.querySelector('[data-act="skip"]').addEventListener('click', () => {
      overlay.remove();
      finishExitEditMode();
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) { input.style.borderColor = '#FF6B8A'; input.focus(); return; }
      try {
        const profiles = Store.get('layoutProfiles') || {};
        profiles[name] = {
          displayLayout: JSON.parse(JSON.stringify(Store.get('displayLayout') || {})),
          visibleWidgets: JSON.parse(JSON.stringify(Store.get('settings')?.visibleWidgets || {}))
        };
        Store.set('layoutProfiles', profiles);  // 持久化（config:set → 托盘菜单自动刷新）
        console.info('[layout-profile] 编辑模式保存方案「' + name + '」: ' + Object.keys(profiles[name].displayLayout).length + ' 屏');
      } catch (e) { console.error('[layout-profile] 保存失败:', e.message); }
      overlay.remove();
      finishExitEditMode();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') overlay.querySelector('[data-act="save"]').click();
      if (e.key === 'Escape') overlay.querySelector('[data-act="skip"]').click();
    });
  }

  // ============================================================
  // 多显示器支持
  // ============================================================

  /** 获取当前屏的手动布局 */
  function getDisplayLayout() {
    const displayLayout = Store.get('displayLayout') || {};
    return displayLayout[_displayKey] || {};
  }

  /** 保存当前屏的手动布局 */
  function setDisplayLayout(layout) {
    const displayLayout = Store.get('displayLayout') || {};
    displayLayout[_displayKey] = layout;
    Store.set('displayLayout', displayLayout);
  }

  /**
   * 获取当前屏的卡片显隐配置
   * 优先用 displayWidgets[displayKey]，没配置则用全局 visibleWidgets
   */
  function getDisplayVisible() {
    const displayWidgets = Store.get('displayWidgets') || {};
    if (displayWidgets[_displayKey]) {
      return displayWidgets[_displayKey];
    }
    // 回退到全局配置
    const settings = Store.get('settings') || {};
    return settings.visibleWidgets || {};
  }

  // ============================================================
  // 模块显隐
  // ============================================================

  function isWidgetVisible(name) {
    const visible = getDisplayVisible();
    return visible[name] !== false;
  }

  function applyWidgetVisibility() {
    document.querySelectorAll('.widget[data-widget]').forEach((el) => {
      const name = el.dataset.widget;
      if (isWidgetVisible(name)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  // ============================================================
  // 布局
  // ============================================================

  function applyLayout(savedLayout) {
    const layout = savedLayout || getDisplayLayout() || {};
    Object.entries(layout).forEach(([name, pos]) => {
      const el = document.querySelector(`.widget[data-widget="${name}"]`);
      if (!el) return;
      if (pos.left) el.style.left = pos.left;
      if (pos.top) el.style.top = pos.top;
      if (pos.right) el.style.right = pos.right;
      if (pos.bottom) el.style.bottom = pos.bottom;
      if (pos.width) el.style.width = pos.width;
      if (pos.height) el.style.height = pos.height;
      // 用了 left/top 就清除 right/bottom（反之亦然）
      if (pos.left || pos.top) {
        if (!pos.right) el.style.right = 'auto';
        if (!pos.bottom) el.style.bottom = 'auto';
      }
    });
    // 加载的布局可能超出屏幕（分辨率变化/卡片过多），拉回可视区保证可拖拽
    clampWidgetsIntoViewport();
    // 暂停自动避让：防止随后的 widget refresh 把刚应用的布局推开
    if (typeof AutoResize !== 'undefined') AutoResize.suspend();
  }

  /**
   * 智能自动排列：根据屏幕尺寸排布可见卡片
   */
  /**
   * 智能整理：保持卡片的位置和大小不变，
   * 只做同行顶部对齐（微调 top，不改变 left/width/height）。
   */
  function autoArrange() {
    // 收集可见卡片及其位置
    const cards = [];
    document.querySelectorAll('.widget[data-widget]').forEach(el => {
      if (el.style.display === 'none') return;
      const left = parseInt(el.style.left) || 0;
      const top = parseInt(el.style.top) || 0;
      const w = parseInt(el.style.width) || 280;
      const h = parseInt(el.style.height) || 200;
      cards.push({ el, left, top, w, h });
    });
    if (cards.length === 0) return;

    // 按位置分组：top 接近（差距 < 最小高度的一半）的卡片视为同行
    cards.sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = [];
    let currentRow = [cards[0]];
    for (let i = 1; i < cards.length; i++) {
      const refTop = currentRow[0].top;
      const minH = Math.min(...currentRow.map(c => c.h));
      if (Math.abs(cards[i].top - refTop) < minH * 0.5) {
        currentRow.push(cards[i]);
      } else {
        rows.push(currentRow);
        currentRow = [cards[i]];
      }
    }
    rows.push(currentRow);

    // 只做一件事：同行卡片顶部对齐（统一到该行最上面的 top 值）
    // 不改 left，不改 width，不改 height
    rows.forEach(row => {
      const minTop = Math.min(...row.map(c => c.top));
      row.forEach(c => { c.top = minTop; });
    });

    // 应用到 DOM 并保存
    const displayKey = (window.__dashboard && window.__dashboard.displayKey) || 'primary';
    const displayLayout = Store.get('displayLayout') || {};
    if (!displayLayout[displayKey]) displayLayout[displayKey] = {};

    cards.forEach(c => {
      c.el.style.top = c.top + 'px';
      displayLayout[displayKey][c.el.dataset.widget] = {
        left: c.left + 'px', top: c.top + 'px',
        width: c.w + 'px', height: c.h + 'px'
      };
    });
    Store.set('displayLayout', displayLayout);
    clampWidgetsIntoViewport();
  }

  /**
   * 把所有可见卡片拉回可视区。
   * 解决：保存的布局在屏幕外（分辨率变化/卡片过多挤出）导致手柄够不到、无法拖回。
   * 垂直方向完全收回（顶部手柄必须可见），水平方向至少露出 80px 保证可拖。
   */
  function clampWidgetsIntoViewport() {
    const sw = window.innerWidth, sh = window.innerHeight;
    const minVisibleW = 80;
    document.querySelectorAll('.widget[data-widget]').forEach(el => {
      if (el.style.display === 'none') return;
      const left = parseInt(el.style.left) || 0;
      const top = parseInt(el.style.top) || 0;
      const w = el.offsetWidth || 280;
      let nx = left, ny = top;
      if (nx > sw - minVisibleW) nx = Math.max(0, sw - minVisibleW);
      if (nx < -w + minVisibleW) nx = -w + minVisibleW;
      if (ny > sh - 40) ny = Math.max(0, sh - 40);
      if (ny < 0) ny = 0;
      if (nx !== left || ny !== top) {
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }
    });
  }

  /**
   * 紧凑网格排列（托盘"自动排列卡片"）：
   * 按当前视觉顺序流式排列到左上角，行满换行，间距 12px。
   * 屏幕放不下时继续向下排（clamp 保证卡片至少能被拖到），
   * 根本解法是布局方案（分套布局，见设置-外观）。
   */
  function compactArrange() {
    const GAP = 12;
    const sw = window.innerWidth;
    const cards = [];
    document.querySelectorAll('.widget[data-widget]').forEach(el => {
      if (el.style.display === 'none') return;
      cards.push({
        el,
        w: el.offsetWidth || 280,
        h: el.offsetHeight || 200,
        left: parseInt(el.style.left) || 0,
        top: parseInt(el.style.top) || 0
      });
    });
    if (cards.length === 0) return;
    // 保持当前视觉顺序（左上到右下）作为排列优先级
    cards.sort((a, b) => a.top - b.top || a.left - b.left);

    let x = GAP, y = GAP, rowMaxH = 0;
    const displayKey = (window.__dashboard && window.__dashboard.displayKey) || 'primary';
    const displayLayout = Store.get('displayLayout') || {};
    if (!displayLayout[displayKey]) displayLayout[displayKey] = {};

    cards.forEach(c => {
      if (x + c.w > sw - GAP && x > GAP) { // 当前行放不下，换行
        x = GAP;
        y += rowMaxH + GAP;
        rowMaxH = 0;
      }
      c.el.style.left = x + 'px';
      c.el.style.top = y + 'px';
      c.el.style.right = 'auto';
      c.el.style.bottom = 'auto';
      displayLayout[displayKey][c.el.dataset.widget] = {
        left: x + 'px', top: y + 'px',
        width: c.w + 'px', height: c.h + 'px'
      };
      x += c.w + GAP;
      rowMaxH = Math.max(rowMaxH, c.h);
    });
    Store.set('displayLayout', displayLayout);
    clampWidgetsIntoViewport();
    if (typeof AutoResize !== 'undefined') AutoResize.schedule();
  }

  /** 主题定义表 */
  const THEMES = {
    deepblue:  { name: '深邃蓝', bg: '20, 25, 40',   accent: '96, 165, 250' },
    midnight:  { name: '午夜黑', bg: '15, 15, 15',   accent: '148, 163, 184' },
    emerald:   { name: '翡翠绿', bg: '10, 40, 30',   accent: '74, 222, 128' },
    rose:      { name: '玫瑰红', bg: '40, 15, 25',   accent: '251, 113, 133' },
    purple:    { name: '皇室紫', bg: '30, 20, 45',   accent: '192, 132, 252' },
    amber:     { name: '琥珀金', bg: '40, 30, 10',   accent: '251, 191, 36' },
    ocean:     { name: '海洋青', bg: '10, 30, 40',   accent: '34, 211, 238' },
    slate:     { name: '雾霾灰', bg: '35, 35, 40',   accent: '148, 163, 184' },
  };

  /** 应用主题（设置 CSS 变量）*/
  function applyTheme(themeName) {
    const theme = THEMES[themeName] || THEMES.deepblue;
    const root = document.documentElement.style;
    root.setProperty('--card-bg', theme.bg);
    root.setProperty('--accent-color', theme.accent);
  }

  /** 应用全局透明度（只调卡片背景 alpha，不影响文字清晰度）*/
  function applyGlobalOpacity() {
    const settings = Store.get('settings') || {};
    const opacity = settings.globalOpacity != null ? settings.globalOpacity : 1;
    // 透明度范围 0.2~1.0，映射到卡片 alpha
    const alpha = 0.3 + opacity * 0.6;  // 最低 0.3（很透明），最高 0.9（接近不透明）
    document.documentElement.style.setProperty('--card-alpha', alpha);
  }

  // 透明度实时预览：设置滑块拖动时即时更新卡片透明度（不持久化，保存时才写）
  if (window.dashboard && window.dashboard.onPreviewOpacity) {
    window.dashboard.onPreviewOpacity((val) => {
      document.documentElement.style.setProperty('--card-alpha', 0.3 + val * 0.6);
    });
  }

  // ============================================================
  // 刷新所有 widget
  // ============================================================

  function refreshAllWidgets() {
    if (ClockWidget.update) ClockWidget.update();
    if (WeatherWidget.update) WeatherWidget.update();
    if (StockWidget.update) StockWidget.update();
    if (NewsWidget.update) NewsWidget.update();
    if (typeof HotSearchWidget !== 'undefined' && HotSearchWidget.update) HotSearchWidget.update();
    if (typeof SysMonitorWidget !== 'undefined' && SysMonitorWidget.update) SysMonitorWidget.update();
    if (typeof CalendarWidget !== 'undefined' && CalendarWidget.update) CalendarWidget.update();
    // 刷新桌面扫描（检测新建/删除的文件）
    if (typeof DesktopWidget !== 'undefined' && DesktopWidget.refreshAll) DesktopWidget.refreshAll();
    // 内容可能变化，触发自动避让检测
    if (typeof AutoResize !== 'undefined') AutoResize.schedule();
  }

  // ============================================================
  // 新增卡片最小化放置 + 单组件初始化
  // ============================================================

  /** 把新增卡片以最小尺寸放到右上角，不打乱已有布局 */
  function placeNewWidgetsMinimized(widgetNames) {
    const MIN_W = 200, MIN_H = 100;
    const gap = 20;
    // 从右上角开始往下排
    let startX = window.innerWidth - MIN_W - 30;
    let startY = 50;
    widgetNames.forEach((name, i) => {
      const el = document.querySelector(`.widget[data-widget="${name}"]`);
      if (!el) return;
      el.style.display = '';
      el.style.left = startX + 'px';
      el.style.top = (startY + i * (MIN_H + gap)) + 'px';
      el.style.width = MIN_W + 'px';
      el.style.height = MIN_H + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
  }

  /** 初始化单个 widget */
  function initWidget(name) {
    const map = {
      clock: () => ClockWidget.init(),
      weather: () => WeatherWidget.init(),
      stock: () => StockWidget.init(),
      news: () => NewsWidget.init(),
      todo: () => TodoWidget.init(),
      countdown: () => CountdownWidget.init(),
      hotsearch: () => HotSearchWidget.init(),
      sysmonitor: () => SysMonitorWidget.init(),
      calendar: () => CalendarWidget.init(),
      pomodoro: () => PomodoroWidget.init(),
      links: () => LinksWidget.init(),
      schulte: () => SchulteWidget.init(),
      mokugyo: () => MokugyoWidget.init(),
      tarot: () => TarotWidget.init(),
    };
    // desktop 特殊处理
    if (name === 'apps' || name === 'deskfolders' || name === 'deskfiles') {
      DesktopWidget.init();
      return;
    }
    if (map[name]) {
      try { map[name](); } catch (e) { console.error('[Dashboard] 初始化失败:', name, e); }
    }
  }

  // 暴露给 widget 用的调度工具
  // ⚠️ 用 Object.assign 合并，不能整体覆盖——否则 displayKey 会丢失
  window.__dashboard = Object.assign(window.__dashboard || {}, {
    Store,
    applyModeUI,
    refreshAllWidgets,
    autoArrange,
    timers,
    displayKey: _displayKey
  });
})();
