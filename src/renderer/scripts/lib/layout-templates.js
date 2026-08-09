/* ============================================================
   布局模板系统
   - 预设经典布局（一键应用）
   - 保存/加载自定义模板
   - 集成进设置面板
   ============================================================ */

const LayoutTemplates = {
  /**
   * 预设模板定义
   * 每个模板定义各卡片的相对位置（百分比），应用时按屏幕尺寸转换
   * visible: 该模板默认显示哪些卡片
   */
  PRESETS: {
    'golden-main-right': {
      name: '黄金右主',
      desc: '主区在右(62%)，侧栏在左(38%)',
      icon: '▤',
      visible: { clock:1, weather:1, calendar:1, sysmonitor:1, todo:1, countdown:1, stock:1, news:0, hotsearch:0 },
      layout: {
        clock:      { left:'2%',  top:'3%',  width:'34%', height:'14%' },
        weather:    { left:'2%',  top:'19%', width:'34%', height:'16%' },
        sysmonitor: { left:'2%',  top:'37%', width:'34%', height:'22%' },
        countdown:  { left:'2%',  top:'61%', width:'34%', height:'36%' },
        todo:       { left:'40%', top:'3%',  width:'58%', height:'46%' },
        stock:      { left:'40%', top:'51%', width:'28%', height:'46%' },
        calendar:   { left:'70%', top:'51%', width:'28%', height:'46%' }
      }
    },
    'golden-main-left': {
      name: '黄金左主',
      desc: '主区在左(62%)，侧栏在右(38%)',
      icon: '▥',
      visible: { clock:1, weather:1, calendar:1, sysmonitor:1, todo:1, countdown:1, stock:1, news:0, hotsearch:0 },
      layout: {
        todo:       { left:'2%',  top:'3%',  width:'58%', height:'46%' },
        stock:      { left:'2%',  top:'51%', width:'28%', height:'46%' },
        calendar:   { left:'32%', top:'51%', width:'28%', height:'46%' },
        clock:      { left:'64%', top:'3%',  width:'34%', height:'14%' },
        weather:    { left:'64%', top:'19%', width:'34%', height:'16%' },
        sysmonitor: { left:'64%', top:'37%', width:'34%', height:'22%' },
        countdown:  { left:'64%', top:'61%', width:'34%', height:'36%' }
      }
    },
    'dashboard-center': {
      name: '中心看板',
      desc: '主卡片居中，环绕辅助卡',
      icon: '⊞',
      visible: { clock:1, weather:1, calendar:1, sysmonitor:1, todo:1, countdown:1, stock:1, news:0, hotsearch:0 },
      layout: {
        todo:       { left:'24%', top:'8%',  width:'52%', height:'52%' },
        clock:      { left:'2%',  top:'3%',  width:'20%', height:'14%' },
        weather:    { left:'2%',  top:'19%', width:'20%', height:'16%' },
        stock:      { left:'2%',  top:'37%', width:'20%', height:'30%' },
        calendar:   { left:'2%',  top:'69%', width:'20%', height:'28%' },
        sysmonitor: { left:'78%', top:'3%',  width:'20%', height:'22%' },
        countdown:  { left:'78%', top:'27%', width:'20%', height:'34%' }
      }
    },
    'compact-strip': {
      name: '底部信息条',
      desc: '卡片横排底部，不挡主视野',
      icon: '▭',
      visible: { clock:1, weather:1, calendar:1, sysmonitor:1, todo:1, countdown:1, stock:1, news:0, hotsearch:0 },
      layout: {
        clock:      { left:'2%',  top:'68%', width:'14%', height:'28%' },
        weather:    { left:'18%', top:'68%', width:'14%', height:'28%' },
        sysmonitor: { left:'34%', top:'68%', width:'14%', height:'28%' },
        stock:      { left:'50%', top:'68%', width:'14%', height:'28%' },
        calendar:   { left:'66%', top:'68%', width:'14%', height:'28%' },
        todo:       { left:'82%', top:'68%', width:'16%', height:'28%' },
        countdown:  { left:'2%',  top:'40%', width:'14%', height:'24%' }
      }
    }
  },

  /**
   * 应用预设模板
   */
  applyPreset(presetId, screenW, screenH) {
    const preset = this.PRESETS[presetId];
    if (!preset) return null;

    // 百分比转像素
    const toPx = (val, total) => {
      if (typeof val === 'string' && val.endsWith('%')) {
        return Math.round((parseFloat(val) / 100) * total) + 'px';
      }
      return val;
    };

    const layout = {};
    for (const [key, pos] of Object.entries(preset.layout)) {
      if (!pos) continue;
      layout[key] = {
        left: toPx(pos.left, screenW),
        top: toPx(pos.top, screenH),
        width: toPx(pos.width, screenW),
        height: toPx(pos.height, screenH)
      };
    }
    return { layout, visible: preset.visible };
  },

  /**
   * 保存当前布局为自定义模板
   */
  saveCustom(name) {
    const custom = Store.get('customTemplates') || {};
    // 保存当前屏的布局
    const displayKey = (window.__dashboard && window.__dashboard.displayKey) || 'primary';
    const displayLayout = Store.get('displayLayout') || {};
    custom[name] = {
      layout: displayLayout[displayKey] || {},
      visible: Store.get('settings')?.visibleWidgets || {},
      savedAt: Date.now()
    };
    Store.set('customTemplates', custom);
    return true;
  },

  /**
   * 获取所有模板（预设 + 自定义）
   */
  getAll() {
    const custom = Store.get('customTemplates') || {};
    return { presets: this.PRESETS, custom };
  },

  /**
   * 删除自定义模板
   */
  deleteCustom(name) {
    const custom = Store.get('customTemplates') || {};
    delete custom[name];
    Store.set('customTemplates', custom);
  }
};
