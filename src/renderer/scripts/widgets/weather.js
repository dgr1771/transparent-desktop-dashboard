/* ============================================================
   天气 Widget - 和风天气
   ============================================================ */

const WeatherWidget = {
  WEATHER_ICON: {
    '100': '☀️', '101': '☁️', '102': '☁️', '103': '🌥️', '104': '☁️',
    '150': '🌙', '151': '🌙', '152': '🌙', '153': '🌙',
    '300': '🌧️', '301': '🌧️', '302': '⛈️', '303': '⛈️', '304': '🌧️', '305': '🌧️',
    '306': '🌧️', '307': '🌧️', '308': '🌧️', '309': '🌧️', '310': '🌧️', '311': '🌧️',
    '312': '🌧️', '313': '❄️', '314': '🌧️', '315': '🌧️', '316': '🌧️', '317': '🌧️',
    '318': '🌧️', '399': '🌧️',
    '400': '❄️', '401': '❄️', '402': '❄️', '403': '❄️', '404': '🌨️', '405': '🌨️',
    '406': '🌨️', '407': '❄️', '408': '❄️', '409': '❄️', '410': '❄️', '499': '❄️',
    '500': '🌫️', '501': '🌫️', '502': '🌫️', '503': '沙尘', '504': '沙尘',
    '507': '🌪️', '508': '🌪️', '509': '🌫️', '510': '🌫️', '511': '🌫️',
    '512': '🌫️', '513': '🌫️', '514': '🌫️', '515': '🌫️', '499': '❄️',
    '900': '🔥', '901': '❄️', '999': '未知'
  },

  init() {
    // 首次启动自动定位（如果没有经纬度，说明还没定位过）
    this._autoLocate().then(() => this.update());
    // 每 30 分钟更新一次
    window.__dashboard.timers.weather = setInterval(() => this.update(), 30 * 60 * 1000);
  },

  /**
   * 自动 IP 定位：仅在首次（配置里无经纬度时）执行，结果存入配置
   */
  async _autoLocate() {
    const cfg = Store.get('weather') || {};
    // 已有经纬度或用户手动改过城市 → 不自动覆盖
    if (cfg.lat != null && cfg.lon != null) return;

    try {
      const loc = await window.dashboard.fetchIpLocation();
      if (loc && loc.city) {
        cfg.city = loc.city;
        cfg.lat = loc.lat;
        cfg.lon = loc.lon;
        Store.set('weather', cfg);
        console.log('[Weather] 自动定位：', loc.city, loc.region, loc.ip);
      }
    } catch (e) {
      console.warn('[Weather] 自动定位失败：', e);
    }
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="weather"] .widget__inner');
    if (!el) return;

    const cfg = Store.get('weather') || {};
    if (!cfg.apiKey) {
      el.innerHTML = this._renderNoKey(cfg.city || '北京');
      return;
    }

    el.innerHTML = `<div class="widget__loading">加载天气中...</div>`;

    try {
      const data = await window.dashboard.fetchWeather();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">${this._escape(data.error)}</div>`;
      } else {
        el.innerHTML = this._render(data, cfg);
      }
    } catch (e) {
      el.innerHTML = `<div class="widget__error">获取失败：${this._escape(e.message)}</div>`;
    }
  },

  _render(data, cfg) {
    const now = data.now || {};
    const icon = this.WEATHER_ICON[now.icon] || '🌤️';
    const temp = now.temp || '--';
    const text = now.text || '未知';
    const humidity = now.humidity || '--';
    const windDir = now.windDir || '--';
    const windScale = now.windScale || '--';

    return `
      <div class="weather">
        <div class="weather__header">
          <span class="weather__city">${this._escape(data.city || cfg.city)}</span>
          <span class="weather__icon">${icon}</span>
        </div>
        <div class="weather__main">
          <span class="weather__temp">${temp}°</span>
          <span class="weather__text">${this._escape(text)}</span>
        </div>
        <div class="weather__details">
          <span>💧 ${humidity}%</span>
          <span>${this._escape(windDir)} ${windScale}级</span>
        </div>
        <div class="weather__updated">${data.updated ? '更新于 ' + data.updated.split(' ')[1] || '' : ''}</div>
      </div>
    `;
  },

  _renderNoKey(city) {
    return `
      <div class="weather weather--nokey">
        <div class="weather__header">
          <span class="weather__city">${this._escape(city)}</span>
          <span class="weather__icon">🌤️</span>
        </div>
        <div class="weather__main">
          <span class="weather__temp">--°</span>
        </div>
        <div class="weather__hint">
          需配置和风天气 API Key<br>
          <small>免费申请：dev.qweather.com</small>
        </div>
      </div>
    `;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
