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

    // 初始化各 widget（只初始化可见的）
    if (isWidgetVisible('clock')) ClockWidget.init();
    if (isWidgetVisible('weather')) WeatherWidget.init();
    if (isWidgetVisible('stock')) StockWidget.init();
    if (isWidgetVisible('news')) NewsWidget.init();
    if (isWidgetVisible('todo')) TodoWidget.init();
    if (isWidgetVisible('countdown')) CountdownWidget.init();
    if (isWidgetVisible('hotsearch')) HotSearchWidget.init();
    if (isWidgetVisible('sysmonitor')) SysMonitorWidget.init();
    if (isWidgetVisible('calendar')) CalendarWidget.init();
    if (isWidgetVisible('pomodoro')) PomodoroWidget.init();
    if (isWidgetVisible('links')) LinksWidget.init();
    if (isWidgetVisible('schulte')) SchulteWidget.init();
    if (isWidgetVisible('apps') || isWidgetVisible('deskfolders') || isWidgetVisible('deskfiles')) DesktopWidget.init();

    // ===== 加载第三方插件（plugins/ 目录）=====
    // 注入各插件的 <script>/<style>，待其 PluginRegistry.register 完成后统一 initAll
    initPlugins();

    async function initPlugins() {
      if (!window.dashboard || !window.dashboard.readPlugins) return;
      let plugins = [];
      try { plugins = await window.dashboard.readPlugins(); }
      catch (e) { console.error('[plugins] 读取失败', e); return; }
      if (!plugins.length) return;

      // 注入样式 + 脚本
      for (const p of plugins) {
        if (p.css) {
          const style = document.createElement('style');
          style.dataset.plugin = p.name;
          style.textContent = p.css;
          document.head.appendChild(style);
        }
        const script = document.createElement('script');
        script.dataset.plugin = p.name;
        script.textContent = p.code;
        document.body.appendChild(script);
      }

      // 所有插件注册完后，统一初始化（layout 由 auto-layout 后续接管）
      if (typeof PluginRegistry !== 'undefined' && PluginRegistry.initAll) {
        try {
          await PluginRegistry.initAll(plugins.map(p => p.name));
          // 给新加载的插件一个初始位置（避免堆叠在 0,0）
          positionPlugins(plugins);
        } catch (e) { console.error('[plugins] 初始化失败', e); }
      }

      /** 给插件卡片排个初始位置：右下角纵向堆叠 */
      function positionPlugins(plugins) {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        let y = 80;
        plugins.forEach(p => {
          const el = document.querySelector(`.widget[data-widget="${p.name}"]`);
          if (!el) return;
          const w = (p.manifest && p.manifest.defaultSize && p.manifest.defaultSize.w) || 260;
          const h = (p.manifest && p.manifest.defaultSize && p.manifest.defaultSize.h) || 300;
          el.style.width = w + 'px';
          el.style.height = h + 'px';
          el.style.left = Math.max(20, screenW - w - 30) + 'px';
          el.style.top = Math.min(y, screenH - h - 30) + 'px';
          y += h + 16;
        });
      }
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
        // 记录修改前可见的卡片
        const prevVisible = {};
        document.querySelectorAll('.widget[data-widget]').forEach(el => {
          if (el.style.display !== 'none') prevVisible[el.dataset.widget] = true;
        });

        await Store.load();
        applyTheme(Store.get('settings')?.theme);
        applyGlobalOpacity();

        // 找出新增的卡片（之前不可见，现在可见）
        const newWidgets = [];
        document.querySelectorAll('.widget[data-widget]').forEach(el => {
          const name = el.dataset.widget;
          const nowVisible = isWidgetVisible(name);
          if (nowVisible && !prevVisible[name]) {
            newWidgets.push(name);
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
