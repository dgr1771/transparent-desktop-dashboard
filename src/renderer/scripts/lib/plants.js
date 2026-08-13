/* ============================================================
   桌面绿植系统 - 高质量透明素材 + 风摆动画 + 点击回应
   ============================================================ */

const Plants = {
  // 新素材是透明 PNG，避免设置页只显示难以辨认的 emoji。
  DEFS: {
    monstera: { name: '龟背竹', emoji: '🌿', desc: '热带、清新自然', swaySpeed: '7s' },
    fern: { name: '波士顿蕨', emoji: '🌱', desc: '轻盈、舒展有生气', swaySpeed: '5.5s' },
    lavender: { name: '薰衣草', emoji: '💜', desc: '安静、柔和治愈', swaySpeed: '6.5s' },
    pothos: { name: '绿萝', emoji: '🍃', desc: '明亮、耐看常青', swaySpeed: '8s' },
    rose: { name: '粉色玫瑰', emoji: '🌹', desc: '浪漫、热烈而温柔', swaySpeed: '6s' },
    hydrangea: { name: '蓝白绣球', emoji: '💠', desc: '清爽、丰盛有层次', swaySpeed: '7.5s' },
    orchid: { name: '蝴蝶兰', emoji: '🪻', desc: '优雅、安静高级', swaySpeed: '8.5s' },
    sunflower: { name: '向日葵', emoji: '🌻', desc: '明亮、积极有能量', swaySpeed: '6.5s' },
    custom: { name: '我的图片', emoji: '🖼️', desc: '自定义上传的植物或花朵', swaySpeed: '7s' },
  },

  LEGACY_MAP: { grass: 'fern', clover: 'pothos', cherry: 'lavender', bamboo: 'monstera', cactus: 'monstera', lotus: 'lavender', sapling: 'pothos', maple: 'monstera' },

  _container: null,
  _current: 'grass',
  _clickEnabled: true,

  init() {
    this._container = document.getElementById('grass-deco');
    if (!this._container) {
      // 容器不存在，创建
      this._container = document.createElement('div');
      this._container.id = 'grass-deco';
      this._container.style.cssText = 'position:fixed;bottom:0;right:20px;width:80px;height:160px;pointer-events:none;z-index:0;opacity:0.88;';
      document.body.appendChild(this._container);
    }
    // 读取配置
    this._current = this.LEGACY_MAP[Store.get('plant')] || Store.get('plant') || 'fern';
    this._clickEnabled = (Store.get('plantInteraction') !== false);
    this.render();

    // 设置容器可点击（如果有交互）
    if (this._clickEnabled) {
      this._container.style.pointerEvents = 'auto';
      this._container.style.cursor = 'pointer';
      this._container.classList.add('no-drag');  // 让穿透轮询识别为可交互元素
      this._container.addEventListener('click', () => this._onClick());
    }
  },

  render() {
    if (!this._container) return;
    const def = this.DEFS[this._current] || this.DEFS.fern;
    const animName = `plantWind_${this._current}`;
    const duration = def.swaySpeed || '4s';

    this._container.innerHTML = `
      <style>
        @keyframes ${animName} {
          0%, 100% { transform: rotate(-1.1deg) translateX(-1px); }
          35% { transform: rotate(1.5deg) translateX(1px); }
          65% { transform: rotate(-0.6deg) translateX(-0.5px); }
        }
      </style>
      <div id="plant-sway" style="height:100%;display:flex;align-items:flex-end;justify-content:center;transform-origin:50% 100%;animation:${animName} ${duration} ease-in-out infinite;">
        <img id="plant-img" src="${this._current === 'custom' ? 'assets/plants-v2/fern.png' : `assets/plants-v2/${this._current}.png`}"
             style="width:120px;height:auto;user-select:none;-webkit-user-drag:none;display:block;"
             draggable="false">
      </div>
      <div id="plant-response" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></div>
    `;
    // custom 模式：异步从独立文件加载图片（数据不塞 config，避免配置膨胀）
    if (this._current === 'custom' && Store.get('customPlantImage') && window.dashboard && window.dashboard.customImageLoad) {
      window.dashboard.customImageLoad('plant').then(dataUrl => {
        const img = document.getElementById('plant-img');
        if (img && dataUrl) img.src = dataUrl;
      });
    }
  },

  setPlant(key) {
    const normalized = this.LEGACY_MAP[key] || key;
    if (!this.DEFS[normalized]) return;
    this._current = normalized;
    Store.set('plant', normalized);
    this.render();
  },

  /** 点击回应动画 */
  _onClick() {
    const inner = document.getElementById('plant-img');
    const response = document.getElementById('plant-response');
    if (!inner) return;

    // 植物弹跳回应（更夸张更明显）
    const sway = document.getElementById('plant-sway');
    if (sway) sway.classList.add('plant-click-response');
    inner.style.transition = 'transform 0.08s';
    inner.style.transform = 'scale(1.08)';
    setTimeout(() => {
      inner.style.transition = 'transform 0.15s';
      inner.style.transform = 'scale(0.96)';
    }, 80);
    setTimeout(() => {
      inner.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
      inner.style.transform = 'scale(1)';
      if (sway) sway.classList.remove('plant-click-response');
    }, 230);
    // 闪光效果
    this._container.style.filter = 'drop-shadow(0 0 20px rgba(100,255,100,0.8)) drop-shadow(0 0 10px rgba(255,255,255,0.5))';
    setTimeout(() => {
      this._container.style.filter = 'drop-shadow(0 0 8px rgba(100,255,100,0.3)) drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
    }, 500);

    // 回应粒子效果（根据植物类型不同）
    if (response) {
      const def = this.DEFS[this._current];
      const effects = {
        clover: { char: '✨', count: 3, color: '#fbbf24' },
        cherry: { char: '🌸', count: 3, color: '#f9a8d4' },
        sunflower: { char: '☀️', count: 2, color: '#fbbf24' },
        rose: { char: '💕', count: 3, color: '#f43f5e' },
        lavender: { char: '💜', count: 3, color: '#a855f7' },
        rose: { char: '🌹', count: 3, color: '#fb7185' },
        hydrangea: { char: '💠', count: 3, color: '#93c5fd' },
        orchid: { char: '🪻', count: 3, color: '#c084fc' },
        sunflower: { char: '🌻', count: 2, color: '#facc15' },
        custom: { char: '✨', count: 2, color: '#fbbf24' },
        grass: { char: '🍃', count: 2, color: '#84cc16' },
        maple: { char: '🍁', count: 2, color: '#dc2626' },
        bamboo: { char: '🎋', count: 2, color: '#65a30d' },
        cactus: { char: '🌵', count: 1, color: '#22c55e' },
        lotus: { char: '🪷', count: 2, color: '#f9a8d4' },
        sapling: { char: '🌱', count: 2, color: '#4ade80' },
      };
      const effect = effects[this._current] || effects.grass;
      for (let i = 0; i < effect.count; i++) {
        const span = document.createElement('span');
        span.textContent = effect.char;
        span.style.cssText = `position:absolute;font-size:18px;left:${30+Math.random()*40}%;top:30%;animation:plantFloat 1.5s ease-out forwards;`;
        response.appendChild(span);
        setTimeout(() => span.remove(), 1500);
      }
    }
  },
};
