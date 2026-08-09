/* ============================================================
   系统监控 Widget - CPU/内存/磁盘/电池/运行时间
   性能优化：增量更新（只改进度条宽度和文字，不重建 DOM）
   ============================================================ */

const SysMonitorWidget = {
  _initialized: false,

  init() {
    if (window.__dashboard.timers.sysmonitor) clearInterval(window.__dashboard.timers.sysmonitor);
    this.update();
    // 每 10 秒刷新（桌面看板不需要 5 秒级精度）
    window.__dashboard.timers.sysmonitor = setInterval(() => this.update(), 10 * 1000);
  },

  async update() {
    const el = document.querySelector('.widget[data-widget="sysmonitor"] .widget__inner');
    if (!el) return;

    try {
      const data = await window.dashboard.fetchSysMonitor();
      if (data.error) {
        el.innerHTML = `<div class="widget__error">${this._escape(data.error)}</div>`;
        this._initialized = false;
        return;
      }
      // 首次或结构变化时全量渲染
      if (!this._initialized) {
        el.innerHTML = this._render(data);
        this._initialized = true;
      } else {
        // 增量更新：只改数值和进度条，不重建 DOM
        this._updateValues(data);
      }
    } catch (e) {
      if (!this._initialized) {
        el.innerHTML = `<div class="widget__error">监控失败：${this._escape(e.message)}</div>`;
      }
    }
  },

  /** 增量更新数值（不重建 DOM） */
  _updateValues(d) {
    const el = document.querySelector('.widget[data-widget="sysmonitor"] .widget__inner');
    if (!el) return;

    const cpuUsage = d.cpu?.usage ?? 0;
    const memPct = d.memory?.percent ?? 0;

    // CPU
    const cpuBar = el.querySelector('[data-sys="cpu-bar"]');
    const cpuPct = el.querySelector('[data-sys="cpu-pct"]');
    if (cpuBar) {
      cpuBar.style.width = cpuUsage + '%';
      cpuBar.style.background = cpuUsage > 80 ? '#f87171' : (cpuUsage > 50 ? '#fbbf24' : '#4ade80');
    }
    if (cpuPct) cpuPct.textContent = cpuUsage + '%';

    // 内存
    const memBar = el.querySelector('[data-sys="mem-bar"]');
    const memPctEl = el.querySelector('[data-sys="mem-pct"]');
    if (memBar) {
      memBar.style.width = memPct + '%';
      memBar.style.background = memPct > 85 ? '#f87171' : (memPct > 60 ? '#fbbf24' : '#4ade80');
    }
    if (memPctEl) memPctEl.textContent = memPct + '%';

    const memDetail = el.querySelector('[data-sys="mem-detail"]');
    if (memDetail) {
      const used = ((d.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1);
      const total = ((d.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(1);
      memDetail.textContent = `${used} / ${total} GB`;
    }

    // 磁盘
    if (d.disk) {
      const diskBar = el.querySelector('[data-sys="disk-bar"]');
      const diskPctEl = el.querySelector('[data-sys="disk-pct"]');
      const diskDetail = el.querySelector('[data-sys="disk-detail"]');
      const dp = d.disk.percent;
      if (diskBar) {
        diskBar.style.width = dp + '%';
        diskBar.style.background = dp > 90 ? '#f87171' : (dp > 70 ? '#fbbf24' : '#4ade80');
      }
      if (diskPctEl) diskPctEl.textContent = dp + '%';
      if (diskDetail) {
        const dg = (n) => (n / 1024 / 1024 / 1024).toFixed(0);
        diskDetail.textContent = `${dg(d.disk.used)} / ${dg(d.disk.total)} GB`;
      }
    }

    // 运行时间
    const uptime = el.querySelector('[data-sys="uptime"]');
    if (uptime) uptime.textContent = '⏱ ' + (d.uptime || '');
  },

  _render(d) {
    const cpuUsage = d.cpu?.usage ?? 0;
    const memPct = d.memory?.percent ?? 0;
    const memUsedGB = ((d.memory?.used || 0) / 1024 / 1024 / 1024).toFixed(1);
    const memTotalGB = ((d.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(1);
    const cpuColor = cpuUsage > 80 ? '#f87171' : (cpuUsage > 50 ? '#fbbf24' : '#4ade80');
    const memColor = memPct > 85 ? '#f87171' : (memPct > 60 ? '#fbbf24' : '#4ade80');

    let diskHtml = '';
    if (d.disk) {
      const diskUsedGB = (d.disk.used / 1024 / 1024 / 1024).toFixed(0);
      const diskTotalGB = (d.disk.total / 1024 / 1024 / 1024).toFixed(0);
      const diskPct = d.disk.percent;
      const diskColor = diskPct > 90 ? '#f87171' : (diskPct > 70 ? '#fbbf24' : '#4ade80');
      diskHtml = `
        <div class="sys__item">
          <span class="sys__label">磁盘</span>
          <div class="sys__bar-wrap">
            <div class="sys__bar" data-sys="disk-bar" style="width:${diskPct}%;background:${diskColor}"></div>
          </div>
          <span class="sys__pct" data-sys="disk-pct">${diskPct}%</span>
        </div>
        <div class="sys__detail" data-sys="disk-detail">${diskUsedGB} / ${diskTotalGB} GB</div>
      `;
    }

    const batteryHtml = d.battery ? `
      <div class="sys__item">
        <span class="sys__label">${d.battery.onBattery ? '🔋' : '🔌'} 电源</span>
        <span class="sys__value">${d.battery.onBattery ? '电池供电' : '已接电源'}</span>
      </div>
    ` : '';

    return `
      <div class="sys">
        <div class="sys__header">
          <span>📊 系统监控</span>
          <span class="sys__uptime" data-sys="uptime">⏱ ${d.uptime || ''}</span>
        </div>

        <div class="sys__item">
          <span class="sys__label">CPU ${d.cpu?.cores || ''}核</span>
          <div class="sys__bar-wrap">
            <div class="sys__bar" data-sys="cpu-bar" style="width:${cpuUsage}%;background:${cpuColor}"></div>
          </div>
          <span class="sys__pct" data-sys="cpu-pct">${cpuUsage}%</span>
        </div>

        <div class="sys__item">
          <span class="sys__label">内存</span>
          <div class="sys__bar-wrap">
            <div class="sys__bar" data-sys="mem-bar" style="width:${memPct}%;background:${memColor}"></div>
          </div>
          <span class="sys__pct" data-sys="mem-pct">${memPct}%</span>
        </div>

        <div class="sys__detail" data-sys="mem-detail">
          ${memUsedGB} / ${memTotalGB} GB
        </div>

        ${diskHtml}
        ${batteryHtml}
      </div>
    `;
  },

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
};
