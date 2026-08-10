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

    // 初始化拖拽缩放
    DragResize.init();

    // 初始化区域穿透（卡片可点、空白穿透）
    ClickThrough.init();

    // 自动避让：不再用 MutationObserver 全局监听（太耗 CPU）
    // 改为只在 refreshAllWidgets 后触发一次（数据更新时才检查）
    // 首次加载后做一次
    setTimeout(() => { if (typeof AutoResize !== 'undefined') AutoResize.check(); }, 3000);

    // 应用主题和透明度
    applyTheme(Store.get('settings')?.theme);
    applyGlobalOpacity();

    // 初始化交互模式
    initInteractionMode();

    // 懒加载可见 widget 的脚本（减少内存：隐藏的 widget 不加载脚本不初始化）
    await loadVisibleWidgets();
    // 加载 lunar.js（日历组件需要，但只在 calendar 可见时加载）
    if (isWidgetVisible('calendar')) {
      await loadScript('scripts/lib/lunar.js');
    }

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
      window.dashboard.onAutoArrange(() => autoArrange());
    }

    // 监听配置更新（设置窗口保存后触发）→ 重新加载配置并刷新
    if (window.dashboard && window.dashboard.onConfigUpdated) {
      window.dashboard.onConfigUpdated(async () => {
        await Store.load();
        applyTheme(Store.get('settings')?.theme);
        applyGlobalOpacity();
        applyWidgetVisibility();
        // 清理被隐藏 widget 的定时器（避免后台空转浪费 CPU）
        Object.keys(timers).forEach(key => {
          if (!isWidgetVisible(key)) {
            clearInterval(timers[key]);
            delete timers[key];
          }
        });
        // 重新加载并初始化可见 widget（懒加载：新启用的卡片会动态加载脚本）
        await loadVisibleWidgets();
        if (isWidgetVisible('calendar')) {
          await loadScript('scripts/lib/lunar.js');
          if (window.CalendarWidget) CalendarWidget.init();
        }
        console.log('[Dashboard] 配置已更新，已刷新所有模块');
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
      document.body.classList.remove('interactive');
      banner.classList.add('hidden');
    }
    // 模式切换后重置区域穿透状态
    if (typeof ClickThrough !== 'undefined') ClickThrough.reset();
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
  }

  /**
   * 智能自动排列：根据屏幕尺寸排布可见卡片
   */
  function autoArrange() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const visible = getDisplayVisible();
    const layout = AutoLayout.compute(screenW, screenH, visible);
    AutoLayout.apply(layout, true);
    // 自动排列后清空当前屏的手动布局
    setDisplayLayout({});
    console.log('[Dashboard] 已自动排列 [' + _displayKey + ']，屏幕', screenW + 'x' + screenH);
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

  // ============================================================
  // 懒加载：只加载可见 widget 的脚本
  // ============================================================

  /** 动态加载单个脚本 */
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = resolve;  // 出错也继续，不阻塞
      document.head.appendChild(s);
    });
  }

  /** widget 名称 → 脚本路径 + 全局变量名 + init 函数映射 */
  const WIDGET_LOADERS = {
    clock:      { src: 'scripts/widgets/clock.js',      cls: 'ClockWidget' },
    weather:    { src: 'scripts/widgets/weather.js',    cls: 'WeatherWidget' },
    stock:      { src: 'scripts/widgets/stock.js',      cls: 'StockWidget' },
    news:       { src: 'scripts/widgets/news.js',       cls: 'NewsWidget' },
    todo:       { src: 'scripts/widgets/todo.js',       cls: 'TodoWidget' },
    countdown:  { src: 'scripts/widgets/countdown.js',  cls: 'CountdownWidget' },
    hotsearch:  { src: 'scripts/widgets/hotsearch.js',  cls: 'HotSearchWidget' },
    sysmonitor: { src: 'scripts/widgets/sysmonitor.js', cls: 'SysMonitorWidget' },
    calendar:   { src: 'scripts/widgets/calendar.js',   cls: 'CalendarWidget' },
    pomodoro:   { src: 'scripts/widgets/pomodoro.js',   cls: 'PomodoroWidget' },
    links:      { src: 'scripts/widgets/links.js',      cls: 'LinksWidget' },
    schulte:    { src: 'scripts/widgets/schulte.js',    cls: 'SchulteWidget' },
    desktop:    { src: 'scripts/widgets/desktop.js',    cls: 'DesktopWidget', deps: ['apps','deskfolders','deskfiles'] },
  };

  /** 加载并初始化所有可见 widget */
  async function loadVisibleWidgets() {
    const tasks = [];
    for (const [key, loader] of Object.entries(WIDGET_LOADERS)) {
      // desktop 特殊：apps/deskfolders/deskfiles 任一可见就加载
      const visible = loader.deps
        ? loader.deps.some(d => isWidgetVisible(d))
        : isWidgetVisible(key);
      if (!visible) continue;

      tasks.push(loadScript(loader.src).then(() => {
        const cls = window[loader.cls];
        if (cls && cls.init) cls.init();
      }));
    }
    await Promise.all(tasks);
  }

  // ============================================================
  // 刷新所有 widget
  // ============================================================

  function refreshAllWidgets() {
    // 安全刷新：widget 可能因懒加载未定义
    const safe = (name, fn) => { try { const w = window[name]; if (w && w.update) w.update(); } catch(e){} };
    safe('ClockWidget');
    safe('WeatherWidget');
    safe('StockWidget');
    safe('NewsWidget');
    safe('HotSearchWidget');
    safe('SysMonitorWidget');
    safe('CalendarWidget');
    try { const dw = window.DesktopWidget; if (dw && dw.refreshAll) dw.refreshAll(); } catch(e){}
    if (typeof AutoResize !== 'undefined') AutoResize.schedule();
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
