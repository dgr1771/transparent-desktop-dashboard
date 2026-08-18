'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * 主进程侧配置持久化
 * 保存到 userData 目录下的 config.json
 */
class ConfigStore {
  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'config.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        const merged = Object.assign({}, this._defaults(), data);
        // ===== 向后兼容迁移：旧版 layout → 按显示器分桶 =====
        // 旧版 layout 是扁平结构 { widgetKey: {left,top,...} }
        // 新版 displayLayout 是 { [displayId]: { widgetKey: {...} } }
        // 用 'primary' 作为主屏的 key（不依赖具体数字 ID，渲染进程会匹配）
        if (data.layout && Object.keys(data.layout).length > 0 && (!merged.displayLayout || Object.keys(merged.displayLayout).length === 0)) {
          merged.displayLayout = { primary: data.layout };
        }
        return merged;
      }
    } catch (e) {
      console.error('读取配置失败：', e);
    }
    return this._defaults();
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('保存配置失败：', e);
    }
  }

  getAll() {
    return this.data;
  }

  setAll(data) {
    this.data = Object.assign({}, this._defaults(), data);
    this._save();
  }

  _defaults() {
    return {
      layout: {},                    // 旧版布局（向后兼容，已迁移到 displayLayout）
      displayLayout: {},             // 新版：{ [displayKey]: { widgetKey: {left,top,width,height} } }
      layoutProfiles: {},            // 布局方案：{ 方案名: {displayLayout, visibleWidgets} }
      activeProfile: '',             // 当前激活的布局方案名（托盘菜单显示 ✓）
      displayWidgets: {},            // 每屏独立卡片显隐：{ [displayKey]: { clock:true, ... } }
                                    // 不配置的屏默认使用 settings.visibleWidgets
      todos: [],
      countdowns: [],
      settings: {
        globalOpacity: 1,
        theme: 'deepblue',             // 主题颜色：deepblue/midnight/emerald/rose/purple/amber/ocean/slate
        plantEnabled: true,            // 桌面绿植开关
        weatherFx: true,               // 桌面植物关联天气的全屏特效（雨/雪/阳光/风/雷暴/雾）
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
      weather: {
        city: '北京',
        apiKey: ''
      },
      stock: {
        codes: ['sh000001', 'sh600519', 'sz000001']
      },
      news: {
        sources: [
          { name: '量子位', url: 'https://www.qbitai.com/feed' },
          { name: '少数派', url: 'https://sspai.com/feed' },
          { name: '36氪', url: 'https://36kr.com/feed' },
          { name: '机器之心', url: 'https://www.jiqizhixin.com/rss' }
        ]
      }
    };
  }
}

module.exports = ConfigStore;
