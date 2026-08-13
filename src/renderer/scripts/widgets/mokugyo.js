/* 敲木鱼：轻量点击反馈 + 功德持久化 */
const MokugyoWidget = {
  init() {
    this._render();
    const inner = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
    if (!inner) return;
    inner.querySelector('#mokugyo-hit').addEventListener('click', () => this._hit(inner));
  },

  /** 更新木鱼图（保存自定义图后调用，不重建 DOM 避免丢失事件绑定） */
  update() {
    const img = document.querySelector('.widget[data-widget="mokugyo"] .mokugyo__stage img');
    const src = Store.get('customMokugyoImage') || 'assets/interactive/mokugyo.png';
    if (img) {
      img.src = src;
      img.onload = () => console.info('[mokugyo] img加载成功 naturalWidth=', img.naturalWidth);
      img.onerror = () => console.info('[mokugyo] img加载失败! src=', String(img.src).slice(0, 80));
      setTimeout(() => console.info('[mokugyo] 500ms后 naturalWidth=', img.naturalWidth, 'complete=', img.complete), 500);
    }
  },

  _render() {
    const inner = document.querySelector('.widget[data-widget="mokugyo"] .widget__inner');
    if (!inner) return;
    const total = Number((Store.get('mokugyo') || {}).merit || 0);
    inner.innerHTML = `
      <div class="mokugyo no-drag">
        <div class="mokugyo__title">🪵 今日敲木鱼</div>
        <button id="mokugyo-hit" class="mokugyo__stage" aria-label="敲一下木鱼">
          <img src="${Store.get('customMokugyoImage') || 'assets/interactive/mokugyo.png'}" alt="可爱的木鱼">
          <span class="mokugyo__hammer" aria-hidden="true"></span>
          <span class="mokugyo__impact" aria-hidden="true">✦</span>
          <span class="mokugyo__sparkle">✦</span>
        </button>
        <div class="mokugyo__merit">功德 <b id="mokugyo-count">${total}</b></div>
        <div class="mokugyo__hint">点击一下，功德加一</div>
      </div>`;
  },

  _hit(inner) {
    const cfg = Store.get('mokugyo') || {};
    cfg.merit = Number(cfg.merit || 0) + 1;
    cfg.lastHit = Date.now();
    Store.set('mokugyo', cfg);
    const stage = inner.querySelector('#mokugyo-hit');
    const count = inner.querySelector('#mokugyo-count');
    if (count) count.textContent = cfg.merit;
    if (stage) {
      stage.classList.remove('mokugyo--hit');
      void stage.offsetWidth;
      stage.classList.add('mokugyo--hit');
    }
    const plus = document.createElement('span');
    plus.className = 'mokugyo__plus';
    plus.textContent = '+1 功德';
    inner.querySelector('.mokugyo').appendChild(plus);
    setTimeout(() => plus.remove(), 900);
  }
};
