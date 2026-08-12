/* ============================================================
   桌面绿植系统 - 11种植物 + 动画 + 点击回应
   ============================================================ */

const Plants = {
  // 植物定义：每种植物的 SVG + 动画类型 + 点击回应
  DEFS: {
    grass: {
      name: '狗尾草', emoji: '🌿', desc: '顽强、随遇而安',
      sway: true, swaySpeed: '4s',
    },
    clover: {
      name: '四叶草', emoji: '🍀', desc: '幸运、好运',
      sway: true, swaySpeed: '3s',
    },
    cherry: {
      name: '樱花', emoji: '🌸', desc: '短暂美好',
      sway: true, swaySpeed: '5s', petals: true,
    },
    sunflower: {
      name: '向日葵', emoji: '🌻', desc: '阳光、积极向上',
      sway: true, swaySpeed: '6s',
    },
    bamboo: {
      name: '竹子', emoji: '🎋', desc: '节节高升',
      sway: true, swaySpeed: '5s',
    },
    cactus: {
      name: '仙人掌', emoji: '🌵', desc: '坚强、坚韧不拔',
      sway: false,
    },
    lotus: {
      name: '荷花', emoji: '🪷', desc: '纯洁、出淤泥不染',
      sway: true, swaySpeed: '6s',
    },
    sapling: {
      name: '发财树苗', emoji: '🌱', desc: '财运、招财',
      sway: true, swaySpeed: '4s',
    },
    maple: {
      name: '枫叶', emoji: '🍁', desc: '收获、沉淀',
      sway: true, swaySpeed: '4s',
    },
    lavender: {
      name: '薰衣草', emoji: '💐', desc: '宁静、安眠',
      sway: true, swaySpeed: '3.5s',
    },
    rose: {
      name: '玫瑰', emoji: '🌹', desc: '浪漫、热爱',
      sway: true, swaySpeed: '4.5s', petals: true,
    },
  },

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
    this._current = Store.get('plant') || 'grass';
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
    const def = this.DEFS[this._current] || this.DEFS.grass;
    const animName = `plantSway_${this._current}`;
    const duration = def.swaySpeed || '4s';

    this._container.innerHTML = `
      <style>
        @keyframes ${animName} {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      </style>
      <img id="plant-img" src="assets/plants/${this._current}.png"
           style="width:90px;height:auto;user-select:none;-webkit-user-drag:none;display:block;margin:0 auto;${def.sway ? `transform-origin:50% 100%;animation:${animName} ${duration} ease-in-out infinite;` : ''}"
           draggable="false">
      <div id="plant-response" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></div>
    `;
  },

  setPlant(key) {
    if (!this.DEFS[key]) return;
    this._current = key;
    Store.set('plant', key);
    this.render();
  },

  /** 点击回应动画 */
  _onClick() {
    const inner = document.getElementById('plant-img');
    const response = document.getElementById('plant-response');
    if (!inner) return;

    // 植物弹跳回应（更夸张更明显）
    inner.style.transition = 'transform 0.08s';
    inner.style.transform = 'scale(1.3) rotate(10deg)';
    setTimeout(() => {
      inner.style.transition = 'transform 0.15s';
      inner.style.transform = 'scale(0.85) rotate(-8deg)';
    }, 80);
    setTimeout(() => {
      inner.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
      inner.style.transform = 'scale(1) rotate(0)';
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
