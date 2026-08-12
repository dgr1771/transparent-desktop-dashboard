/* ============================================================
   本地存储封装
   优先使用主进程的文件持久化（config.json），localStorage 作为缓存
   ============================================================ */

const Store = {
  _cache: null,

  defaults() {
    return {
      layout: {},
      todos: [],
      countdowns: [],
      settings: {
        globalOpacity: 1,
        visibleWidgets: {
          clock: true,
          weather: true,
          stock: true,
          news: false,
          todo: true,
          countdown: true,
          hotsearch: false,
          sysmonitor: true,
          calendar: true,
          pomodoro: true,
          links: true,
          schulte: true,
          apps: true,
          deskfolders: true,
          deskfiles: true,
          mokugyo: false,
          tarot: false
        }
      },
      weather: { city: '北京', apiKey: '' },
      stock: { codes: ['sh000001', 'sh600519', 'sz000001'] },
      news: {
        sources: [
          { name: '量子位', url: 'https://www.qbitai.com/feed' },
          { name: '少数派', url: 'https://sspai.com/feed' },
          { name: '36氪', url: 'https://36kr.com/feed' },
          { name: '机器之心', url: 'https://www.jiqizhixin.com/rss' }
        ]
      }
    };
  },

  /**
   * 异步加载（从主进程读取）
   */
  async load() {
    if (window.dashboard && window.dashboard.getConfig) {
      try {
        this._cache = await window.dashboard.getConfig();
      } catch (e) {
        console.warn('从主进程读取配置失败，使用默认值', e);
        this._cache = this.defaults();
      }
    } else {
      this._cache = this.defaults();
    }
    return this._cache;
  },

  get(key) {
    return this._cache ? this._cache[key] : undefined;
  },

  /**
   * 写入并持久化到主进程文件
   */
  set(key, value) {
    if (!this._cache) return;
    this._cache[key] = value;
    this._persist();
  },

  _persist() {
    if (window.dashboard && window.dashboard.setConfig) {
      window.dashboard.setConfig(this._cache);
    }
  }
};
