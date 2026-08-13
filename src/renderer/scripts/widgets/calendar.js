/* ============================================================
   日历 Widget - 本月日历网格 + 今日高亮 + 农历 + 节气
   ============================================================ */

const CalendarWidget = {
  init() {
    this.update();
    if (window.__dashboard.timers.calendar) clearInterval(window.__dashboard.timers.calendar);
    window.__dashboard.timers.calendar = setInterval(() => this.update(), 10 * 60 * 1000);
  },

  update() {
    const el = document.querySelector('.widget[data-widget="calendar"] .widget__inner');
    if (!el) return;
    el.innerHTML = this._render();
  },

  _render() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayWeek = new Date(year, month, 1).getDay();

    // 今日农历
    let todayLunar = '';
    const lunar = (typeof Lunar !== 'undefined') ? Lunar.solar2lunar(year, month + 1, today) : null;
    if (lunar) {
      // 初一显示月份，其他显示日子；节气优先
      const term = Lunar.getSolarTerm(year, month + 1, today);
      todayLunar = term || (lunar.day === 1 ? lunar.monthStr : lunar.dayStr);
    }

    let cells = '';
    for (let i = 0; i < firstDayWeek; i++) {
      cells += '<div class="cal__cell cal__cell--empty"></div>';
    }
    const weekdays = [0, 6];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const weekDay = dateObj.getDay();
      const isToday = d === today;
      const isWeekend = weekdays.includes(weekDay);

      // 农历
      let lunarStr = '';
      let lunarType = '';  // '' 普通, 'term' 节气, 'festival' 节日
      if (typeof Lunar !== 'undefined') {
        // 优先级：节日 > 节气 > 农历
        const fest = Lunar.getFestival(year, month + 1, d);
        const l = Lunar.solar2lunar(year, month + 1, d);
        if (fest) {
          lunarStr = fest.name;
          lunarType = 'festival';
        } else {
          const term = Lunar.getSolarTerm(year, month + 1, d);
          if (term) { lunarStr = term; lunarType = 'term'; }
          else if (l) {
            lunarStr = (l.day === 1) ? l.monthStr : l.dayStr;
          }
        }
      }

      const classes = ['cal__cell'];
      if (isToday) classes.push('cal__cell--today');
      else if (isWeekend) classes.push('cal__cell--weekend');

      cells += `
        <div class="${classes.join(' ')}">
          <span class="cal__day">${d}</span>
          <span class="cal__lunar${lunarType ? ' cal__lunar--'+lunarType : ''}">${lunarStr}</span>
        </div>`;
    }

    const weekHeader = ['日','一','二','三','四','五','六']
      .map((w, i) => `<div class="cal__week${i===0||i===6?' cal__week--end':''}">${w}</div>`).join('');

    return `
      <div class="cal">
        <div class="cal__header">
          <span>${year}年 ${monthNames[month]}</span>
          <span class="cal__lunar-today">${todayLunar}</span>
        </div>
        <div class="cal__grid">
          ${weekHeader}
          ${cells}
        </div>
      </div>
    `;
  }
};
