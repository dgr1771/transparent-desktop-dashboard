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
    const svg = this._getSVG(this._current);
    const animName = `plantSway_${this._current}`;
    const duration = def.swaySpeed || '4s';

    this._container.innerHTML = `
      <style>
        @keyframes ${animName} {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      </style>
      <div id="plant-inner" style="transform-origin:50% 100%;${def.sway ? `animation:${animName} ${duration} ease-in-out infinite;` : ''}">
        ${svg}
      </div>
      <div id="plant-response" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></div>
    `;
  },

  setPlant(key) {
    if (!this.DEFS[key]) return;
    this._current = key;
    Store.set('plant', key);
    this.render();
  },

  _getSVG(type) {
    const svgs = {
      grass: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 Q35 120 38 80 Q40 55 40 40" stroke="#84cc16" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="40" cy="45" rx="10" ry="20" fill="url(#g1)" stroke="#65a30d" stroke-width="0.8"/>
        <defs><radialGradient id="g1" cx="50%" cy="30%"><stop offset="0%" stop-color="#dcfce7"/><stop offset="60%" stop-color="#bef264"/><stop offset="100%" stop-color="#84cc16"/></radialGradient></defs>
        <line x1="30" y1="40" x2="24" y2="34" stroke="#bef264" stroke-width="1" stroke-linecap="round"/>
        <line x1="50" y1="40" x2="56" y2="34" stroke="#bef264" stroke-width="1" stroke-linecap="round"/>
        <line x1="30" y1="48" x2="22" y2="44" stroke="#bef264" stroke-width="1" stroke-linecap="round"/>
        <line x1="50" y1="48" x2="58" y2="44" stroke="#bef264" stroke-width="1" stroke-linecap="round"/>
        <path d="M38 110 Q20 105 15 120 Q25 115 38 115" fill="#65a30d" opacity="0.7"/>
        <path d="M42 120 Q60 115 65 130 Q55 125 42 125" fill="#65a30d" opacity="0.6"/>
      </svg>`,

      clover: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 L40 80" stroke="#65a30d" stroke-width="2.5" stroke-linecap="round"/>
        <ellipse cx="40" cy="40" rx="18" ry="14" fill="#86efac" opacity="0.9"/>
        <ellipse cx="55" cy="55" rx="14" ry="12" fill="#4ade80" opacity="0.9"/>
        <ellipse cx="25" cy="55" rx="14" ry="12" fill="#4ade80" opacity="0.9"/>
        <ellipse cx="40" cy="70" rx="16" ry="13" fill="#22c55e" opacity="0.9"/>
        <circle cx="42" cy="52" r="3" fill="#fbbf24"/>
        <path d="M40 120 Q25 115 20 130 Q30 125 40 128" fill="#65a30d" opacity="0.5"/>
      </svg>`,

      cherry: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 Q35 120 38 70" stroke="#8b4513" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="30" cy="45" r="10" fill="#fce7f3" opacity="0.95"/>
        <circle cx="48" cy="35" r="11" fill="#fbcfe8" opacity="0.95"/>
        <circle cx="40" cy="55" r="9" fill="#f9a8d4" opacity="0.95"/>
        <circle cx="28" cy="65" r="8" fill="#fbcfe8" opacity="0.9"/>
        <circle cx="52" cy="60" r="9" fill="#fce7f3" opacity="0.9"/>
        <circle cx="35" cy="30" r="3" fill="#f472b6"/>
        <circle cx="50" cy="48" r="3" fill="#ec4899"/>
        <path d="M42 110 Q28 108 22 122 Q32 118 42 120" fill="#65a30d" opacity="0.5"/>
      </svg>`,

      sunflower: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 L40 70" stroke="#65a30d" stroke-width="3" stroke-linecap="round"/>
        <g transform="translate(40,40)">
          <g id="sunflower-petals">
            ${Array.from({length:12}, (_,i) => {
              const a = i * 30; return `<ellipse cx="0" cy="-20" rx="6" ry="14" fill="#fbbf24" transform="rotate(${a})" opacity="0.9"/>`;
            }).join('')}
          </g>
          <circle r="12" fill="#92400e"/>
          <circle r="10" fill="#b45309"/>
          <circle r="6" fill="#78350f"/>
        </g>
        <ellipse cx="25" cy="110" rx="12" ry="6" fill="#65a30d" transform="rotate(-30 25 110)" opacity="0.7"/>
        <ellipse cx="55" cy="100" rx="12" ry="6" fill="#65a30d" transform="rotate(30 55 100)" opacity="0.7"/>
      </svg>`,

      bamboo: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <rect x="36" y="30" width="8" height="130" rx="2" fill="#65a30d"/>
        <rect x="35" y="70" width="10" height="4" fill="#3f6212"/>
        <rect x="35" y="110" width="10" height="4" fill="#3f6212"/>
        <path d="M40 50 Q55 40 65 48 Q55 45 42 55" fill="#4ade80" opacity="0.8"/>
        <path d="M40 85 Q25 75 15 83 Q25 80 38 90" fill="#4ade80" opacity="0.7"/>
        <path d="M40 120 Q55 110 65 118 Q55 115 42 125" fill="#4ade80" opacity="0.6"/>
      </svg>`,

      cactus: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <ellipse cx="40" cy="100" rx="22" ry="50" fill="#22c55e"/>
        <ellipse cx="40" cy="100" rx="18" ry="46" fill="#16a34a"/>
        <rect x="20" y="90" width="6" height="30" rx="3" fill="#15803d"/>
        <rect x="54" y="80" width="6" height="35" rx="3" fill="#15803d"/>
        <circle cx="40" cy="60" r="5" fill="#f472b6" opacity="0.9"/>
        <circle cx="33" cy="58" r="4" fill="#ec4899" opacity="0.8"/>
        <circle cx="47" cy="58" r="4" fill="#f9a8d4" opacity="0.8"/>
        <line x1="40" y1="55" x2="40" y2="90" stroke="#15803d" stroke-width="1" opacity="0.5"/>
        <line x1="30" y1="80" x2="30" y2="120" stroke="#15803d" stroke-width="1" opacity="0.5"/>
        <line x1="50" y1="80" x2="50" y2="120" stroke="#15803d" stroke-width="1" opacity="0.5"/>
        <ellipse cx="40" cy="150" rx="20" ry="6" fill="#92400e" opacity="0.5"/>
      </svg>`,

      lotus: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <ellipse cx="40" cy="140" rx="30" ry="8" fill="#7dd3fc" opacity="0.3"/>
        <ellipse cx="40" cy="138" rx="25" ry="6" fill="#bae6fd" opacity="0.4"/>
        <path d="M40 80 Q35 100 38 130" stroke="#65a30d" stroke-width="2" fill="none" stroke-linecap="round"/>
        <g transform="translate(40,65)">
          <path d="M0 -20 Q-8 -10 0 0 Q8 -10 0 -20" fill="#fbcfe8" opacity="0.9"/>
          <path d="M0 -20 Q-15 -8 -10 5 Q-3 -5 0 -20" fill="#f9a8d4" opacity="0.85" transform="rotate(-50)"/>
          <path d="M0 -20 Q-15 -8 -10 5 Q-3 -5 0 -20" fill="#f9a8d4" opacity="0.85" transform="rotate(50)"/>
          <path d="M0 -20 Q-15 -8 -10 5 Q-3 -5 0 -20" fill="#f472b6" opacity="0.8" transform="rotate(-100)"/>
          <path d="M0 -20 Q-15 -8 -10 5 Q-3 -5 0 -20" fill="#f472b6" opacity="0.8" transform="rotate(100)"/>
          <circle r="4" fill="#fbbf24"/>
        </g>
      </svg>`,

      sapling: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 L40 80" stroke="#78350f" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="28" cy="60" rx="14" ry="10" fill="#4ade80" transform="rotate(-30 28 60)" opacity="0.9"/>
        <ellipse cx="52" cy="55" rx="14" ry="10" fill="#22c55e" transform="rotate(30 52 55)" opacity="0.9"/>
        <ellipse cx="40" cy="40" rx="16" ry="12" fill="#4ade80" opacity="0.95"/>
        <ellipse cx="30" cy="75" rx="10" ry="7" fill="#86efac" transform="rotate(-40 30 75)" opacity="0.7"/>
        <ellipse cx="50" cy="75" rx="10" ry="7" fill="#86efac" transform="rotate(40 50 75)" opacity="0.7"/>
        <circle cx="38" cy="38" r="3" fill="#fbbf24" opacity="0.6"/>
        <ellipse cx="40" cy="155" rx="16" ry="5" fill="#92400e" opacity="0.4"/>
      </svg>`,

      maple: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 Q38 120 40 70" stroke="#78350f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <g transform="translate(40,45)">
          <path d="M0 -25 L-8 -8 L-20 -12 L-12 0 L-22 8 L-8 5 L0 20 L8 5 L22 8 L12 0 L20 -12 L8 -8 Z" fill="#dc2626" opacity="0.9"/>
          <path d="M0 -25 L-8 -8 L-20 -12 L-12 0 L-22 8 L-8 5 L0 20 L8 5 L22 8 L12 0 L20 -12 L8 -8 Z" fill="none" stroke="#991b1b" stroke-width="1"/>
          <line x1="0" y1="-25" x2="0" y2="15" stroke="#991b1b" stroke-width="0.8"/>
        </g>
        <ellipse cx="25" cy="100" rx="10" ry="6" fill="#ea580c" transform="rotate(-30 25 100)" opacity="0.6"/>
        <ellipse cx="55" cy="95" rx="10" ry="6" fill="#f97316" transform="rotate(30 55 95)" opacity="0.5"/>
      </svg>`,

      lavender: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M35 160 Q33 120 34 70" stroke="#65a30d" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M45 160 Q47 120 46 70" stroke="#65a30d" stroke-width="2" fill="none" stroke-linecap="round"/>
        <g transform="translate(35,50)"><ellipse rx="5" ry="15" fill="#a855f7" opacity="0.85"/><ellipse cx="0" cy="-12" rx="4" ry="8" fill="#c084fc" opacity="0.7"/></g>
        <g transform="translate(46,45)"><ellipse rx="5" ry="15" fill="#9333ea" opacity="0.85"/><ellipse cx="0" cy="-12" rx="4" ry="8" fill="#a855f7" opacity="0.7"/></g>
        <ellipse cx="28" cy="100" rx="8" ry="3" fill="#84cc16" transform="rotate(-40 28 100)" opacity="0.6"/>
        <ellipse cx="52" cy="95" rx="8" ry="3" fill="#84cc16" transform="rotate(40 52 95)" opacity="0.5"/>
      </svg>`,

      rose: `<svg viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg" width="80" height="160">
        <path d="M40 160 Q35 120 38 70" stroke="#16a34a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g transform="translate(40,45)">
          <circle r="22" fill="#be123c" opacity="0.4"/>
          <circle r="18" fill="#e11d48" opacity="0.6"/>
          <circle r="14" fill="#f43f5e" opacity="0.7"/>
          <circle r="10" fill="#fb7185" opacity="0.8"/>
          <circle r="6" fill="#fecdd3" opacity="0.9"/>
          <circle r="3" fill="#fff1f2"/>
        </g>
        <path d="M40 100 Q25 95 18 108 Q28 103 40 105" fill="#16a34a" opacity="0.8"/>
        <path d="M40 110 Q55 105 62 118 Q52 113 40 115" fill="#22c55e" opacity="0.7"/>
        <path d="M40 125 Q28 120 22 132 Q30 128 40 130" fill="#16a34a" opacity="0.5"/>
        <circle cx="30" cy="40" r="2" fill="#fb7185" opacity="0.6"/>
        <circle cx="52" cy="48" r="2" fill="#f43f5e" opacity="0.5"/>
      </svg>`,
    };
    return svgs[type] || svgs.grass;
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
