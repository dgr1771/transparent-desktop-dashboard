/* ============================================================
   插件 SDK - 第三方开发者用此接口开发看板组件
   ============================================================

   插件开发示例（my-plugin/index.js）：

   // 1. manifest.json 声明插件信息
   // 2. 实现 WidgetPlugin 接口

   class MyPlugin {
     async init(sdk) {
       this.sdk = sdk;
       // sdk.store      → 读写配置（插件专属命名空间）
       // sdk.fetch(url)  → 网络请求
       // sdk.onRefresh(fn) → 注册刷新回调
       // sdk.open(url)   → 用浏览器打开链接
     }
     render(data) {
       return '<div class="my-plugin">...</div>';
     }
     bindEvents(container) {}
     async update() {
       return await this.sdk.fetch('https://api.example.com/data');
     }
   }

   // 注册插件
   if (typeof PluginRegistry !== 'undefined') {
     PluginRegistry.register('my-plugin', MyPlugin);
   }
   ============================================================ */

const PluginRegistry = {
  _plugins: {},
  _loaded: false,

  /** 注册插件 */
  register(name, PluginClass) {
    this._plugins[name] = PluginClass;
    console.log(`[Plugin] 注册: ${name}`);
  },

  /** 获取所有已注册插件 */
  getAll() {
    return this._plugins;
  },

  /** 创建 SDK 实例（每个插件独立） */
  createSDK(pluginName) {
    return {
      // 插件专属存储（不污染全局配置）
      store: {
        get: (key) => {
          const plugins = Store.get('plugins') || {};
          return (plugins[pluginName] || {})[key];
        },
        set: (key, value) => {
          const plugins = Store.get('plugins') || {};
          if (!plugins[pluginName]) plugins[pluginName] = {};
          plugins[pluginName][key] = value;
          Store.set('plugins', plugins);
        }
      },
      // 网络请求
      fetch: async (url, options) => {
        try {
          const resp = await fetch(url, options);
          return await resp.text();
        } catch (e) {
          console.error(`[Plugin:${pluginName}] fetch 失败:`, e);
          return null;
        }
      },
      // 用浏览器打开链接
      open: (url) => {
        if (window.dashboard && window.dashboard.openExternal) {
          window.dashboard.openExternal(url);
        }
      },
      // 注册定时刷新
      onRefresh: (fn, intervalSec) => {
        const interval = (intervalSec || 300) * 1000;
        const timer = setInterval(fn, interval);
        if (window.__dashboard && window.__dashboard.timers) {
          window.__dashboard.timers['plugin_' + pluginName] = timer;
        }
      },
      // 获取当前主题信息
      getTheme: () => {
        const settings = Store.get('settings') || {};
        return {
          name: settings.theme || 'deepblue',
          accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()
        };
      }
    };
  },

  /** 初始化所有已注册插件 */
  async initAll(visiblePlugins) {
    const layout = {};
    for (const [name, PluginClass] of Object.entries(this._plugins)) {
      if (visiblePlugins && !visiblePlugins.includes(name)) continue;
      try {
        const plugin = new PluginClass();
        const sdk = this.createSDK(name);
        await plugin.init(sdk);

        // 创建容器 DOM
        const container = document.createElement('div');
        container.className = 'widget plugin-widget';
        container.dataset.widget = name;
        container.dataset.plugin = 'true';
        container.innerHTML = '<div class="widget__inner"><div class="widget__loading">加载中...</div></div>';
        document.getElementById('dashboard').appendChild(container);

        // 渲染
        const data = plugin.update ? await plugin.update() : null;
        const inner = container.querySelector('.widget__inner');
        inner.innerHTML = plugin.render(data) || '<div class="widget__error">插件无内容</div>';
        if (plugin.bindEvents) plugin.bindEvents(inner);

        // 加入布局
        layout[name] = true;
        console.log(`[Plugin] ${name} 初始化成功`);
      } catch (e) {
        console.error(`[Plugin] ${name} 初始化失败:`, e);
      }
    }
    return layout;
  }
};
