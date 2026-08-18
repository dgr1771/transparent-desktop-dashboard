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

  // ===== 绿植选择器 =====
  let _selectedPlant = 'fern';
  let _customPlantImage = false;   // 是否有自定义植物图（图片数据单独存文件，不塞 config）
  let _customMokugyoImage = false;
  const PLANT_LIST = [
    { key: 'monstera', name: '龟背竹', emoji: '🌿', desc: '热带、清新自然' },
    { key: 'fern',     name: '波士顿蕨', emoji: '🌱', desc: '轻盈、舒展有生气' },
    { key: 'lavender', name: '薰衣草', emoji: '💜', desc: '安静、柔和治愈' },
    { key: 'pothos',   name: '绿萝', emoji: '🍃', desc: '明亮、耐看常青' },
    { key: 'rose',     name: '粉色玫瑰', emoji: '🌹', desc: '浪漫、热烈而温柔' },
    { key: 'hydrangea', name: '蓝白绣球', emoji: '💠', desc: '清爽、丰盛有层次' },
    { key: 'orchid',   name: '蝴蝶兰', emoji: '🪻', desc: '优雅、安静高级' },
    { key: 'sunflower', name: '向日葵', emoji: '🌻', desc: '明亮、积极有能量' },
    { key: 'custom',   name: '我的图片', emoji: '🖼️', desc: '上传自己的植物或花朵' },
  ];

  function initPlantPicker() {
    const container = document.getElementById('plant-picker');
    if (!container) return;
    container.innerHTML = '';
    PLANT_LIST.forEach(p => {
      const btn = document.createElement('div');
      btn.style.cssText = `width:62px;height:72px;border-radius:10px;cursor:pointer;
        background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.1);
        display:flex;align-items:center;justify-content:center;overflow:hidden;
        transition:border-color 0.15s,transform 0.1s;`;
      const src = p.key === 'custom' ? 'assets/plants-v2/fern.png' : `assets/plants-v2/${p.key}.png`;
      btn.innerHTML = `<img src="${src}" alt="${p.name}" style="width:58px;height:68px;object-fit:contain;pointer-events:none;">`;
      btn.title = p.name;
      btn.dataset.plantKey = p.key;
      btn.addEventListener('click', () => {
        _selectedPlant = p.key;
        container.querySelectorAll('[data-plant-key]').forEach(el => {
          el.style.borderColor = 'rgba(255,255,255,0.1)';
          el.style.transform = 'scale(1)';
        });
        btn.style.borderColor = '#4ade80';
        btn.style.transform = 'scale(1.1)';
        const desc = document.getElementById('plant-desc');
        if (desc) desc.textContent = p.name + ' — ' + p.desc;
      });
      container.appendChild(btn);
    });
  }

  function selectPlantInPicker(plantKey) {
    _selectedPlant = plantKey || 'fern';
    const legacyMap = { grass: 'fern', clover: 'pothos', cherry: 'lavender', bamboo: 'monstera', cactus: 'monstera', lotus: 'lavender', sapling: 'pothos', maple: 'monstera' };
    _selectedPlant = legacyMap[_selectedPlant] || _selectedPlant;
    const container = document.getElementById('plant-picker');
    if (!container) return;
    const plant = PLANT_LIST.find(p => p.key === _selectedPlant);
    container.querySelectorAll('[data-plant-key]').forEach(el => {
      if (el.dataset.plantKey === _selectedPlant) {
        el.style.borderColor = '#4ade80';
        el.style.transform = 'scale(1.1)';
      } else {
        el.style.borderColor = 'rgba(255,255,255,0.1)';
        el.style.transform = 'scale(1)';
      }
    });
    const desc = document.getElementById('plant-desc');
    if (desc && plant) desc.textContent = plant.name + ' — ' + plant.desc;
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
    { key: 'hotsearch',  name: '🔥 热搜',    desc: '头条热榜' },
    { key: 'mokugyo',    name: '🪵 敲木鱼', desc: '点击积累功德' },
    { key: 'tarot',      name: '🔮 每日塔罗', desc: '每日运势小游戏' }
  ];

  document.addEventListener('DOMContentLoaded', async () => {
    config = await window.dashboard.getConfig();

    // 先初始化主题选择器（生成色块），再 renderForm（回填选中状态）
    initThemePicker();
    initPlantPicker();
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

    document.getElementById('plant-upload').addEventListener('change', handlePlantUpload);
    document.getElementById('btn-clear-custom-plant').addEventListener('click', () => {
      if (window.dashboard && window.dashboard.customImageClear) window.dashboard.customImageClear('plant');
      _customPlantImage = false;
      if (_selectedPlant === 'custom') _selectedPlant = 'fern';
      document.getElementById('plant-upload').value = '';
      renderCustomPlantUpload();
      selectPlantInPicker(_selectedPlant);
    });

    document.getElementById('mokugyo-upload').addEventListener('change', handleMokugyoUpload);
    document.getElementById('btn-clear-custom-mokugyo').addEventListener('click', () => {
      if (window.dashboard && window.dashboard.customImageClear) window.dashboard.customImageClear('mokugyo');
      _customMokugyoImage = false;
      document.getElementById('mokugyo-upload').value = '';
      renderCustomMokugyoUpload();
    });

    document.getElementById('global-opacity').addEventListener('input', (e) => {
      document.getElementById('opacity-value').textContent = e.target.value + '%';
      // 实时预览透明度到主看板（拖动时即时看到卡片变化，不持久化）
      if (window.dashboard && window.dashboard.previewOpacity) {
        window.dashboard.previewOpacity(parseInt(e.target.value, 10) / 100);
      }
    });

    // ===== 布局方案（多套布局一键切换，Rainmeter Layout Profiles 实践）=====
    document.getElementById('btn-profile-save').addEventListener('click', () => {
      const name = document.getElementById('profile-name').value.trim();
      if (!name) { showToast('请先输入方案名'); return; }
      if (!config.displayLayout || Object.keys(config.displayLayout).length === 0) {
        showToast('当前没有布局可保存，请先摆放卡片'); return;
      }
      config.layoutProfiles = config.layoutProfiles || {};
      config.layoutProfiles[name] = JSON.parse(JSON.stringify(config.displayLayout));
      persistConfig();
      renderProfileOptions(name);
      showToast(`方案「${name}」已保存`);
    });

    document.getElementById('btn-profile-apply').addEventListener('click', async () => {
      const sel = document.getElementById('profile-select');
      const name = sel.value;
      if (!name || !config.layoutProfiles || !config.layoutProfiles[name]) {
        showToast('请先选择要应用的方案'); return;
      }
      config.displayLayout = JSON.parse(JSON.stringify(config.layoutProfiles[name]));
      await persistConfig();
      // 通知主窗口应用新布局并刷新
      window.dashboard.refreshMain?.();
      showToast(`已切换到「${name}」，主界面即将刷新`);
    });

    document.getElementById('btn-profile-delete').addEventListener('click', () => {
      const sel = document.getElementById('profile-select');
      const name = sel.value;
      if (!name || !config.layoutProfiles || !config.layoutProfiles[name]) {
        showToast('请先选择要删除的方案'); return;
      }
      delete config.layoutProfiles[name];
      persistConfig();
      renderProfileOptions();
      showToast(`方案「${name}」已删除`);
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
    container.querySelectorAll('.toggle[data-display-widget]').forEach((t) => {
      widgets[t.dataset.displayWidget] = t.classList.contains('on');
    });
    if (!config.displayWidgets) config.displayWidgets = {};
    config.displayWidgets[_selectedDisplayKey] = widgets;
  }

  function renderDisplayWidgets() {
    const container = document.getElementById('display-widgets-checklist');
    if (!container) return;
    container.innerHTML = '';
    const displayWidgets = config.displayWidgets || {};
    const visible = displayWidgets[_selectedDisplayKey] || config.settings?.visibleWidgets || {};
    WIDGETS.forEach((w) => {
      const checked = visible[w.key] !== false;
      const item = document.createElement('div');
      item.className = 'module-item';
      item.innerHTML = `
        <span class="module-icon">${w.name.split(' ')[0]}</span>
        <div class="module-text"><div class="module-name">${w.name.replace(/^[^\s]+ /, '')}</div></div>
        <div class="toggle module-toggle ${checked ? 'on' : ''}" data-display-widget="${w.key}"></div>
      `;
      const toggle = item.querySelector('.toggle');
      toggle.addEventListener('click', () => toggle.classList.toggle('on'));
      container.appendChild(item);
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
    selectPlantInPicker(cfg.plant || 'grass');
    // 全屏天气特效开关
    const wfxToggle = document.getElementById('toggle-weatherFx');
    if (wfxToggle) {
      wfxToggle.classList.toggle('on', cfg.settings?.weatherFx !== false);
      wfxToggle.onclick = () => wfxToggle.classList.toggle('on');
    }
    // 桌面绿植开关
    const plantToggle = document.getElementById('toggle-plant');
    if (plantToggle) {
      plantToggle.classList.toggle('on', cfg.settings?.plantEnabled !== false);
      plantToggle.onclick = () => plantToggle.classList.toggle('on');
    }
    _customPlantImage = !!cfg.customPlantImage;
    renderCustomPlantUpload();
    _customMokugyoImage = !!cfg.customMokugyoImage;
    renderCustomMokugyoUpload();
    // 布局方案下拉
    renderProfileOptions();

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

  function renderCustomPlantUpload() {
    const preview = document.getElementById('custom-plant-preview');
    const hint = document.getElementById('custom-plant-hint');
    const pickerImage = document.querySelector('[data-plant-key="custom"] img');
    if (_customPlantImage) {
      // 异步从独立文件加载预览（图片数据不塞 config.json，避免配置膨胀）
      if (window.dashboard && window.dashboard.customImageLoad) {
        window.dashboard.customImageLoad('plant').then(dataUrl => {
          if (dataUrl) {
            if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
            if (pickerImage) pickerImage.src = dataUrl;
          }
        });
      }
      if (hint) hint.textContent = '已上传自定义图片，保存后生效';
    } else {
      if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
      if (hint) hint.textContent = '支持 JPG/PNG/WEBP/GIF（含动画），保持原比例缩放';
    }
  }

  function handlePlantUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('图片不能超过 8MB'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      // 存到独立文件（不塞 config.json），config 只存 true 标志
      if (window.dashboard && window.dashboard.customImageSave) {
        await window.dashboard.customImageSave('plant', reader.result);
      }
      _customPlantImage = true;
      _selectedPlant = 'custom';
      renderCustomPlantUpload();
      selectPlantInPicker('custom');
      showToast('已加载自定义图片，保存后生效');
    };
    reader.readAsDataURL(file);
  }

  function handleMokugyoUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('图片不能超过 8MB'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      if (window.dashboard && window.dashboard.customImageSave) {
        await window.dashboard.customImageSave('mokugyo', reader.result);
      }
      _customMokugyoImage = true;
      renderCustomMokugyoUpload();
      showToast('已加载自定义木鱼，保存后生效');
    };
    reader.readAsDataURL(file);
  }

  function renderCustomMokugyoUpload() {
    const preview = document.getElementById('custom-mokugyo-preview');
    const hint = document.getElementById('custom-mokugyo-hint');
    if (_customMokugyoImage) {
      if (window.dashboard && window.dashboard.customImageLoad) {
        window.dashboard.customImageLoad('mokugyo').then(dataUrl => {
          if (dataUrl && preview) { preview.src = dataUrl; preview.style.display = 'block'; }
        });
      }
      if (hint) hint.textContent = '已上传自定义木鱼，保存后生效';
    } else {
      if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
      if (hint) hint.textContent = '支持 JPG/PNG/WEBP/GIF，留空使用默认木鱼';
    }
  }

  function renderWidgetsChecklist(visible) {
    const container = document.getElementById('widgets-checklist');
    container.innerHTML = '';
    WIDGETS.forEach((w) => {
      const checked = visible[w.key] !== false;
      const item = document.createElement('div');
      item.className = 'module-item';
      item.innerHTML = `
        <span class="module-icon">${w.name.split(' ')[0]}</span>
        <div class="module-text">
          <div class="module-name">${w.name.replace(/^[^\s]+ /, '')}</div>
          <div class="module-desc">${w.desc}</div>
        </div>
        <div class="toggle module-toggle ${checked ? 'on' : ''}" data-widget-key="${w.key}"></div>
      `;
      const toggle = item.querySelector('.toggle');
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('on');
      });
      container.appendChild(item);
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
    document.querySelectorAll('#widgets-checklist .toggle[data-widget-key]').forEach((t) => {
      visibleWidgets[t.dataset.widgetKey] = t.classList.contains('on');
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
      plant: _selectedPlant,
      customPlantImage: _customPlantImage,
      customMokugyoImage: _customMokugyoImage,
      displayWidgets,
      settings: {
        globalOpacity: parseInt(document.getElementById('global-opacity').value, 10) / 100,
        theme: _selectedTheme,
        weatherFx: document.getElementById('toggle-weatherFx').classList.contains('on'),
        plantEnabled: document.getElementById('toggle-plant').classList.contains('on'),
        visibleWidgets
      }
    };
  }

  /** 布局方案：立即持久化当前 config（不走"保存"按钮，布局操作即时生效） */
  async function persistConfig() {
    await window.dashboard.setConfig(config);
  }

  /** 布局方案：填充方案下拉框 */
  function renderProfileOptions(selected) {
    const sel = document.getElementById('profile-select');
    if (!sel) return;
    const profiles = (config && config.layoutProfiles) || {};
    const names = Object.keys(profiles);
    sel.innerHTML = names.length
      ? names.map(n => `<option value="${n}"${n === selected ? ' selected' : ''}>${n}</option>`).join('')
      : '<option value="" disabled>暂无方案，请先保存</option>';
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
