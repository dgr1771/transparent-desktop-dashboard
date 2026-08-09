/* ============================================================
   设置界面逻辑
   ============================================================ */

(function () {
  'use strict';

  let config = null;
  let _selectedTheme = 'deepblue';

  // 主题定义（必须在使用前定义，避免 TDZ 问题）
  const THEMES = {
    deepblue:  { name: '深邃蓝', bg: '#141928', accent: '#60a5fa' },
    midnight:  { name: '午夜黑', bg: '#0f0f0f', accent: '#94a3b8' },
    emerald:   { name: '翡翠绿', bg: '#0a281e', accent: '#4ade80' },
    rose:      { name: '玫瑰红', bg: '#281019', accent: '#fb7185' },
    purple:    { name: '皇室紫', bg: '#1e142d', accent: '#c084fc' },
    amber:     { name: '琥珀金', bg: '#281e0a', accent: '#fbbf24' },
    ocean:     { name: '海洋青', bg: '#0a1e28', accent: '#22d3ee' },
    slate:     { name: '雾霾灰', bg: '#232328', accent: '#94a3b8' },
  };

  // ===== 主题选择器 =====
  function initThemePicker() {
    const container = document.getElementById('theme-picker');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(THEMES).forEach(([key, theme]) => {
      const btn = document.createElement('div');
      btn.style.cssText = `
        width:40px;height:40px;border-radius:8px;cursor:pointer;
        background:${theme.bg};border:2px solid rgba(255,255,255,0.1);
        transition:border-color 0.15s,transform 0.1s;
        display:flex;align-items:center;justify-content:center;
      `;
      btn.title = theme.name;
      btn.dataset.themeKey = key;
      btn.innerHTML = `<div style="width:12px;height:12px;border-radius:50%;background:${theme.accent}"></div>`;
      btn.addEventListener('click', () => {
        _selectedTheme = key;
        container.querySelectorAll('[data-theme-key]').forEach(el => {
          el.style.borderColor = 'rgba(255,255,255,0.1)';
          el.style.transform = 'scale(1)';
        });
        btn.style.borderColor = theme.accent;
        btn.style.transform = 'scale(1.1)';
      });
      container.appendChild(btn);
    });
  }

  function selectThemeInPicker(themeKey) {
    _selectedTheme = themeKey || 'deepblue';
    const container = document.getElementById('theme-picker');
    if (!container) return;
    container.querySelectorAll('[data-theme-key]').forEach(el => {
      if (el.dataset.themeKey === _selectedTheme) {
        el.style.borderColor = THEMES[_selectedTheme].accent;
        el.style.transform = 'scale(1.1)';
      } else {
        el.style.borderColor = 'rgba(255,255,255,0.1)';
        el.style.transform = 'scale(1)';
      }
    });
  }

  // 桌面模块清单（key 必须与 HTML 里 data-widget 一致）
  const WIDGETS = [
    { key: 'clock',      name: '🕐 时钟',    desc: '时间日期' },
    { key: 'weather',    name: '🌤️ 天气',    desc: '实时天气' },
    { key: 'calendar',   name: '📆 日历',    desc: '本月日历' },
    { key: 'todo',       name: '✅ 待办',    desc: '任务清单' },
    { key: 'countdown',  name: '📅 倒数日',  desc: '纪念日倒计时' },
    { key: 'sysmonitor', name: '📊 系统监控', desc: 'CPU/内存/电池' },
    { key: 'stock',      name: '📈 A股',     desc: '自选行情' },
    { key: 'pomodoro',   name: '🍅 番茄时钟', desc: '专注计时' },
    { key: 'links',      name: '🔗 快捷链接', desc: '网址书签' },
    { key: 'schulte',    name: '🎯 舒尔特方格', desc: '专注训练' },
    { key: 'apps',       name: '📁 桌面应用', desc: '快捷方式' },
    { key: 'deskfolders',name: '📂 桌面文件夹', desc: '目录' },
    { key: 'deskfiles',  name: '📄 桌面文件', desc: '文档等' },
    { key: 'news',       name: '📰 新闻',    desc: 'AI 资讯' },
    { key: 'hotsearch',  name: '🔥 热搜',    desc: '头条热榜' }
  ];

  document.addEventListener('DOMContentLoaded', async () => {
    config = await window.dashboard.getConfig();

    // 先初始化主题选择器（生成色块），再 renderForm（回填选中状态）
    initThemePicker();
    renderForm(config);

    // 多显示器检测
    await initDisplaySection();

    // 链接用外部浏览器打开
    document.getElementById('link-qweather').addEventListener('click', (e) => {
      e.preventDefault();
      window.dashboard.openExternal('https://dev.qweather.com/');
    });

    document.getElementById('btn-add-source').addEventListener('click', addSourceRow);
    document.getElementById('btn-save').addEventListener('click', save);
    document.getElementById('btn-cancel').addEventListener('click', () => window.close());

    document.getElementById('global-opacity').addEventListener('input', (e) => {
      document.getElementById('opacity-value').textContent = e.target.value + '%';
    });

    // 自动定位按钮
    document.getElementById('btn-locate').addEventListener('click', autoLocate);

    // 用户手动改城市时，清除经纬度（让手动输入生效）
    document.getElementById('weather-city').addEventListener('input', () => {
      document.getElementById('locate-hint').textContent = '已改为手动城市，将以输入的城市为准';
      document.getElementById('locate-hint').className = 'hint';
    });
  });

  // ===== 多显示器配置 =====
  let _displays = [];
  let _selectedDisplayKey = 'primary';

  async function initDisplaySection() {
    try {
      _displays = await window.dashboard.getAllDisplays();
    } catch (e) { _displays = []; }

    // 只有多于 1 个显示器时才显示配置区域
    if (_displays.length <= 1) return;

    const section = document.getElementById('display-section');
    const select = document.getElementById('display-select');
    section.style.display = '';

    // 填充显示器下拉
    _displays.forEach((d, i) => {
      const key = d.isPrimary ? 'primary' : String(d.id);
      const label = d.isPrimary
        ? `主显示器 (${d.bounds.width}×${d.bounds.height})`
        : `显示器 ${i + 1} (${d.bounds.width}×${d.bounds.height})`;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    });

    // 切换显示器时：先保存当前屏的勾选草稿，再渲染新屏
    select.addEventListener('change', () => {
      saveCurrentDisplayDraft();
      _selectedDisplayKey = select.value;
      renderDisplayWidgets();
    });

    // 默认选中主屏
    _selectedDisplayKey = 'primary';
    renderDisplayWidgets();
  }

  /** 保存当前选中屏的勾选草稿到 config.displayWidgets */
  function saveCurrentDisplayDraft() {
    if (_displays.length <= 1) return;
    const container = document.getElementById('display-widgets-checklist');
    if (!container || !container.children.length) return;
    const widgets = {};
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      widgets[cb.dataset.displayWidget] = cb.checked;
    });
    if (!config.displayWidgets) config.displayWidgets = {};
    config.displayWidgets[_selectedDisplayKey] = widgets;
  }

  function renderDisplayWidgets() {
    const container = document.getElementById('display-widgets-checklist');
    container.innerHTML = '';
    const displayWidgets = config.displayWidgets || {};
    // 当前屏的配置，没有则用全局默认
    const visible = displayWidgets[_selectedDisplayKey] || config.settings?.visibleWidgets || {};
    WIDGETS.forEach((w) => {
      const checked = visible[w.key] !== false;
      const label = document.createElement('label');
      label.className = checked ? 'checked' : '';
      label.innerHTML = `
        <input type="checkbox" data-display-widget="${w.key}" ${checked ? 'checked' : ''}>
        <span>${w.name} <small style="color:#6b7280">— ${w.desc}</small></span>
      `;
      const cb = label.querySelector('input');
      cb.addEventListener('change', () => {
        label.classList.toggle('checked', cb.checked);
      });
      container.appendChild(label);
    });
  }

  // 自动定位
  async function autoLocate() {
    const btn = document.getElementById('btn-locate');
    const hint = document.getElementById('locate-hint');
    const cityInput = document.getElementById('weather-city');
    btn.disabled = true;
    btn.textContent = '📍 定位中...';
    hint.className = 'hint';
    hint.textContent = '正在获取位置...';
    try {
      const loc = await window.dashboard.fetchIpLocation();
      if (loc && loc.city) {
        cityInput.value = loc.city;
        // 记录经纬度到当前配置（保存时一起写入）
        config._autoLat = loc.lat;
        config._autoLon = loc.lon;
        hint.className = 'hint success';
        hint.textContent = `✓ 已定位：${loc.city}（${loc.region || ''}）IP: ${loc.ip}`;
      } else {
        hint.className = 'hint error';
        hint.textContent = '✗ 定位失败，请手动输入城市';
      }
    } catch (e) {
      hint.className = 'hint error';
      hint.textContent = '✗ 定位失败：' + e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '📍 自动定位';
    }
  }

  function renderForm(cfg) {
    // 天气
    document.getElementById('weather-city').value = cfg.weather?.city || '北京';
    document.getElementById('weather-apikey').value = cfg.weather?.apiKey || '';
    document.getElementById('weather-apihost').value = cfg.weather?.apiHost || '';

    // 股票
    document.getElementById('stock-codes').value = (cfg.stock?.codes || []).join(',');

    // 新闻源
    const list = document.getElementById('news-sources');
    list.innerHTML = '';
    (cfg.news?.sources || []).forEach((src) => addSourceRow(src.name, src.url));

    // 透明度
    const op = Math.round((cfg.settings?.globalOpacity ?? 1) * 100);
    document.getElementById('global-opacity').value = op;
    document.getElementById('opacity-value').textContent = op + '%';

    // 主题
    selectThemeInPicker(cfg.settings?.theme);

    // 关于：版本号
    const versionEl = document.getElementById('about-version');
    if (versionEl && window.dashboard && window.dashboard.getAppInfo) {
      window.dashboard.getAppInfo().then(info => {
        versionEl.textContent = 'v' + info.version;
      }).catch(() => { versionEl.textContent = 'v—'; });
    }

    // 模块显隐
    renderWidgetsChecklist(cfg.settings?.visibleWidgets || {});
  }

  function renderWidgetsChecklist(visible) {
    const container = document.getElementById('widgets-checklist');
    container.innerHTML = '';
    WIDGETS.forEach((w) => {
      const checked = visible[w.key] !== false; // 默认显示
      const label = document.createElement('label');
      label.className = checked ? 'checked' : '';
      label.innerHTML = `
        <input type="checkbox" data-widget-key="${w.key}" ${checked ? 'checked' : ''}>
        <span>${w.name} <small style="color:#6b7280">— ${w.desc}</small></span>
      `;
      const cb = label.querySelector('input');
      cb.addEventListener('change', () => {
        label.classList.toggle('checked', cb.checked);
      });
      container.appendChild(label);
    });
  }

  function addSourceRow(name = '', url = '') {
    const list = document.getElementById('news-sources');
    const row = document.createElement('div');
    row.className = 'source-row';
    row.innerHTML = `
      <input type="text" class="name" placeholder="名称" value="${escapeAttr(name)}">
      <input type="text" class="url" placeholder="RSS 地址" value="${escapeAttr(url)}">
      <button class="btn-remove">✕</button>
    `;
    row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }

  function collectForm() {
    // 新闻源
    const sources = [];
    document.querySelectorAll('#news-sources .source-row').forEach((row) => {
      const name = row.querySelector('.name').value.trim();
      const url = row.querySelector('.url').value.trim();
      if (name && url) sources.push({ name, url });
    });

    // 股票代码
    const codes = document.getElementById('stock-codes').value
      .split(',').map(s => s.trim()).filter(Boolean);

    // 天气：城市 + Key + 经纬度
    const city = document.getElementById('weather-city').value.trim() || '北京';
    const weather = {
      city,
      apiKey: document.getElementById('weather-apikey').value.trim(),
      apiHost: document.getElementById('weather-apihost').value.trim()
    };
    // 自动定位得到的经纬度（点过自动定位按钮才有）
    if (config._autoLat != null && config._autoLon != null) {
      weather.lat = config._autoLat;
      weather.lon = config._autoLon;
    }

    // 模块显隐（主屏/全局默认）
    const visibleWidgets = {};
    document.querySelectorAll('#widgets-checklist input[type="checkbox"]').forEach((cb) => {
      visibleWidgets[cb.dataset.widgetKey] = cb.checked;
    });

    // 多显示器：各屏独立模块配置（保存前先写入当前屏草稿）
    const displayWidgets = {};
    if (_displays.length > 1) {
      saveCurrentDisplayDraft();
      // 从 config.displayWidgets 复制所有已配置的屏
      Object.assign(displayWidgets, config.displayWidgets || {});
    }

    return {
      weather,
      stock: { codes },
      news: { sources },
      displayWidgets,
      settings: {
        globalOpacity: parseInt(document.getElementById('global-opacity').value, 10) / 100,
        theme: _selectedTheme,
        visibleWidgets
      }
    };
  }

  async function save() {
    const collected = collectForm();
    // 合并到现有配置（保留 layout、todos 等不在此界面编辑的字段）
    config = Object.assign({}, config, collected, {
      settings: Object.assign({}, config.settings, collected.settings)
    });
    // 清除临时字段，避免污染持久化配置
    delete config._autoLat;
    delete config._autoLon;
    await window.dashboard.setConfig(config);

    showToast('已保存，主界面即将刷新');

    // 通知主窗口刷新
    setTimeout(() => {
      // 通过 IPC 让主窗口重新加载配置和数据
      window.dashboard.refreshMain?.();
      window.close();
    }, 800);
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1500);
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
})();
