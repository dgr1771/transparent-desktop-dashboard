/* ============================================================
   时钟 Widget
   ============================================================ */

const ClockWidget = {
  intervalId: null,

  init() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.update();
    this.intervalId = setInterval(() => this.update(), 1000);
  },

  update() {
    const now = new Date();
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');
    if (!timeEl || !dateEl) return;

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${hh}:${mm}:${ss}`;

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    dateEl.textContent = `${now.getFullYear()}-${month}-${day} 星期${weekdays[now.getDay()]}`;
  }
};
