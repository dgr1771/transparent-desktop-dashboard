/* ============================================================
   天气联动效果 - 根据天气数据在全屏生成对应天气特效
   晴天=阳光、雨天=雨滴、雪天=雪花、大风=落叶横飞+植物摇摆加大、
   雷暴=闪电、雾天=雾气弥漫
   ============================================================ */

const WeatherFX = {
  _canvas: null,
  _ctx: null,
  _particles: [],
  _weatherType: 'none',  // none/sunny/rainy/snowy/windy/stormy/foggy
  _animationId: null,
  _lightningTimer: null,

  /** 初始化全屏 Canvas 覆盖层 */
  init() {
    if (this._canvas) return;  // 已初始化
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'weather-fx-canvas';
    this._canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.7;';
    document.body.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // 开始动画循环
    this._animate();
  },

  _resize() {
    if (!this._canvas) return;
    this._canvas.width = window.innerWidth;
    this._canvas.height = window.innerHeight;
  },

  /** 根据天气数据设置天气效果 */
  setWeather(weatherData) {
    if (!weatherData || !weatherData.now) {
      this.setWeatherType('none');
      return;
    }
    const icon = weatherData.now.icon || '';
    const text = (weatherData.now.text || '').toLowerCase();
    const windScale = parseInt(weatherData.now.windScale) || 0;

    // 判断天气类型
    let type = 'none';
    if (icon.startsWith('1') && icon !== '150' && icon !== '151' && icon !== '153') {
      type = 'sunny';  // 100-104 晴/多云
    } else if (icon.startsWith('3')) {
      type = 'rainy';  // 300-399 雨
    } else if (icon.startsWith('4')) {
      type = 'snowy';  // 400-499 雪
    } else if (icon.startsWith('5')) {
      type = 'foggy';  // 500-599 雾/沙尘
    }
    // 大风覆盖
    if (windScale >= 6) type = 'windy';
    // 雷暴
    if (icon === '302' || icon === '303' || icon === '304') type = 'stormy';

    this.setWeatherType(type);
  },

  setWeatherType(type) {
    if (type === this._weatherType) return;
    this._weatherType = type;
    this._particles = [];

    switch (type) {
      case 'sunny': this._initSunny(); break;
      case 'rainy': this._initRainy(); break;
      case 'snowy': this._initSnowy(); break;
      case 'windy': this._initWindy(); break;
      case 'stormy': this._initStormy(); break;
      case 'foggy': this._initFoggy(); break;
      case 'none': this._clear(); break;
    }

    // 联动绿植摇摆速度
    this._updatePlantSway(type);

    console.log('[WeatherFX] 天气效果切换为:', type);
  },

  // ===== 晴天：阳光光斑从右上角洒下 =====
  _initSunny() {
    this._canvas.style.opacity = '0.4';
    for (let i = 0; i < 8; i++) {
      this._particles.push({
        type: 'sunray',
        x: window.innerWidth + 50,
        y: -50 + Math.random() * 200,
        vx: -0.3 - Math.random() * 0.2,
        vy: 0.2 + Math.random() * 0.2,
        size: 60 + Math.random() * 80,
        alpha: 0.05 + Math.random() * 0.1,
        life: Infinity
      });
    }
  },

  // ===== 雨天：雨滴从顶部往下落 =====
  _initRainy() {
    this._canvas.style.opacity = '0.6';
    for (let i = 0; i < 120; i++) {
      this._particles.push({
        type: 'rain',
        x: Math.random() * (window.innerWidth + 200) - 100,
        y: Math.random() * window.innerHeight - window.innerHeight,
        vx: -1,
        vy: 8 + Math.random() * 6,
        length: 12 + Math.random() * 18,
        alpha: 0.3 + Math.random() * 0.4,
        life: Infinity
      });
    }
  },

  // ===== 雪天：雪花飘落 =====
  _initSnowy() {
    this._canvas.style.opacity = '0.7';
    for (let i = 0; i < 60; i++) {
      this._particles.push({
        type: 'snow',
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight - window.innerHeight,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1 + Math.random() * 2,
        size: 2 + Math.random() * 5,
        alpha: 0.5 + Math.random() * 0.5,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.01 + Math.random() * 0.02,
        life: Infinity
      });
    }
  },

  // ===== 大风：落叶横飞 =====
  _initWindy() {
    this._canvas.style.opacity = '0.6';
    for (let i = 0; i < 15; i++) {
      this._particles.push({
        type: 'leaf',
        x: -50,
        y: Math.random() * window.innerHeight,
        vx: 4 + Math.random() * 4,
        vy: (Math.random() - 0.5) * 2,
        size: 8 + Math.random() * 8,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        alpha: 0.4 + Math.random() * 0.4,
        life: Infinity
      });
    }
  },

  // ===== 雷暴：雨 + 随机闪电 =====
  _initStormy() {
    this._initRainy();  // 先加雨
    // 闪电定时器
    this._lightningTimer = setInterval(() => {
      if (this._weatherType !== 'stormy') return;
      this._flashLightning();
    }, 3000 + Math.random() * 4000);
  },

  _flashLightning() {
    // 闪电白光闪 2 下
    this._canvas.style.transition = 'opacity 0.05s';
    this._canvas.style.opacity = '0.9';
    setTimeout(() => {
      this._canvas.style.opacity = '0.3';
      setTimeout(() => {
        this._canvas.style.opacity = '0.7';
        setTimeout(() => { this._canvas.style.opacity = '0.3'; }, 50);
      }, 80);
    }, 50);
  },

  // ===== 雾天：白色雾气弥漫 =====
  _initFoggy() {
    this._canvas.style.opacity = '0.5';
    for (let i = 0; i < 5; i++) {
      this._particles.push({
        type: 'fog',
        x: Math.random() * window.innerWidth,
        y: window.innerHeight * 0.3 + Math.random() * window.innerHeight * 0.5,
        vx: 0.3 + Math.random() * 0.3,
        vy: 0,
        size: 200 + Math.random() * 200,
        alpha: 0.06 + Math.random() * 0.08,
        life: Infinity
      });
    }
  },

  /** 联动绿植摇摆 */
  _updatePlantSway(weatherType) {
    const plantInner = document.getElementById('plant-img');
    if (!plantInner) return;
    let speed = '4s';
    let degree = 3;
    switch (weatherType) {
      case 'windy': speed = '1.5s'; degree = 8; break;
      case 'stormy': speed = '1s'; degree = 10; break;
      case 'rainy': speed = '3s'; degree = 4; break;
      case 'snowy': speed = '5s'; degree = 2; break;
      case 'sunny': speed = '4s'; degree = 3; break;
      case 'foggy': speed = '6s'; degree = 2; break;
    }
    // 更新绿植摇摆动画
    const keyframes = `@keyframes weatherPlantSway { 0%,100%{transform:rotate(-${degree}deg)} 50%{transform:rotate(${degree}deg)} }`;
    let styleEl = document.getElementById('weather-plant-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'weather-plant-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = keyframes;
    if (plantInner.parentElement) {
      plantInner.parentElement.style.animation = `weatherPlantSway ${speed} ease-in-out infinite`;
    }
  },

  /** 清除所有天气效果 */
  _clear() {
    this._particles = [];
    this._canvas.style.opacity = '0';
    if (this._lightningTimer) {
      clearInterval(this._lightningTimer);
      this._lightningTimer = null;
    }
    this._updatePlantSway('none');
  },

  /** 动画主循环 */
  _animate() {
    if (!this._ctx) return;
    const w = this._canvas.width;
    const h = this._canvas.height;
    this._ctx.clearRect(0, 0, w, h);

    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      this._updateParticle(p, w, h);
      this._drawParticle(p);
    }

    this._animationId = requestAnimationFrame(() => this._animate());
  },

  _updateParticle(p, w, h) {
    p.x += p.vx;
    p.y += p.vy;

    switch (p.type) {
      case 'sunray':
        if (p.x < -p.size) { p.x = w + 50; p.y = Math.random() * h * 0.3; }
        break;
      case 'rain':
        if (p.y > h) { p.y = -p.length; p.x = Math.random() * (w + 200) - 100; }
        break;
      case 'snow':
        p.swayPhase += p.swaySpeed;
        p.x += Math.sin(p.swayPhase) * 0.5;
        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
        break;
      case 'leaf':
        p.rotation += p.rotSpeed;
        if (p.x > w + 50) { p.x = -50; p.y = Math.random() * h; }
        break;
      case 'fog':
        if (p.x > w + p.size) { p.x = -p.size; }
        break;
    }
  },

  _drawParticle(p) {
    const ctx = this._ctx;
    ctx.save();

    switch (p.type) {
      case 'sunray':
        // 阳光光斑（径向渐变圆）
        const sg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        sg.addColorStop(0, `rgba(255, 240, 150, ${p.alpha})`);
        sg.addColorStop(1, 'rgba(255, 240, 150, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'rain':
        // 雨滴（斜线）
        ctx.strokeStyle = `rgba(150, 200, 255, ${p.alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.length);
        ctx.stroke();
        break;

      case 'snow':
        // 雪花（白色圆点）
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'leaf':
        // 落叶（旋转的椭圆）
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.fillStyle = `rgba(180, 120, 40, ${p.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'fog':
        // 雾气（大面积半透明白色圆）
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        fg.addColorStop(0, `rgba(200, 200, 210, ${p.alpha})`);
        fg.addColorStop(1, 'rgba(200, 200, 210, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
  }
};
