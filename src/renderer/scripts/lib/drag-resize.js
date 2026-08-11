/* ============================================================
   拖拽 + 缩放库
   - 拖动：仅通过卡片顶部的 .widget__handle 手柄触发
   - 缩放：通过右下角 .widget__resize 手柄触发
   - 仅在编辑模式（body.interactive）下生效
   - 带边界限制，防止卡片拖出屏幕
   ============================================================ */

const DragResize = {
  _screenW: window.innerWidth,
  _screenH: window.innerHeight,

  init() {
    // 屏幕尺寸变化时更新边界
    window.addEventListener('resize', () => {
      this._screenW = window.innerWidth;
      this._screenH = window.innerHeight;
    });

    document.querySelectorAll('.widget').forEach((widget) => {
      this._bindDrag(widget);
      this._bindResize(widget);
    });
  },

  /**
   * 拖动（通过顶部手柄）
   */
  _bindDrag(widget) {
    const handle = widget.querySelector('[data-handle]');
    if (!handle) return;

    let startX, startY, startLeft, startTop, isDragging = false;

    const onDown = (e) => {
      if (!document.body.classList.contains('interactive')) return;
      if (e.button !== 0) return;

      isDragging = true;
      widget.classList.add('dragging');

      // 如果卡片在缩略模式，拖动时自动放大到合适尺寸
      if (widget._thumbnail) {
        widget._thumbnail = false;
        // 测量内容需要的高度
        const oldW = widget.style.width;
        widget.style.height = 'auto';
        const inner = widget.querySelector('.widget__inner');
        const contentH = inner ? inner.scrollHeight : 200;
        const expandH = Math.max(120, Math.min(contentH + 4, window.innerHeight - 60));
        widget.style.height = expandH + 'px';
        // 宽度也调到合理大小（300px 比缩略宽更易看清内容）
        const expandW = Math.min(320, window.innerWidth - 40);
        widget.style.width = expandW + 'px';
      }

      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      widget.style.left = rect.left + 'px';
      widget.style.top = rect.top + 'px';
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
      startLeft = rect.left;
      startTop = rect.top;

      widget.style.zIndex = 100;

      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
      if (!isDragging) return;
      let nx = startLeft + (e.clientX - startX);
      let ny = startTop + (e.clientY - startY);

      const w = widget.offsetWidth;
      const h = widget.offsetHeight;
      const minVisible = 60;
      nx = Math.max(-w + minVisible, Math.min(nx, this._screenW - minVisible));
      ny = Math.max(0, Math.min(ny, this._screenH - minVisible));

      // 磁吸吸附（仅编辑模式）
      let finalLeft = nx, finalTop = ny;
      if (typeof Magnetic !== 'undefined') {
        const snap = Magnetic.snap({ width: w, height: h }, nx, ny, widget);
        finalLeft = snap.left;
        finalTop = snap.top;
        Magnetic.showGuides(snap.guides);
      }

      widget.style.left = finalLeft + 'px';
      widget.style.top = finalTop + 'px';
    };

    const onUp = () => {
      if (!isDragging) return;
      isDragging = false;
      widget.classList.remove('dragging');
      widget.style.zIndex = '';
      // 清除磁吸辅助线
      if (typeof Magnetic !== 'undefined') Magnetic.clearGuides();
      this._saveWidgetLayout(widget);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', onDown);
  },

  /**
   * 缩放（通过右下角手柄）
   */
  _bindResize(widget) {
    const handle = widget.querySelector('.widget__resize');
    if (!handle) return;

    let startX, startY, startW, startH, isResizing = false;

    const onDown = (e) => {
      if (!document.body.classList.contains('interactive')) return;
      if (e.button !== 0) return;

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = widget.offsetWidth;
      startH = widget.offsetHeight;

      e.preventDefault();
      e.stopPropagation();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
      if (!isResizing) return;
      let dw = e.clientX - startX;
      let dh = e.clientY - startY;
      let newW = Math.max(200, Math.min(startW + dw, this._screenW));
      let newH = Math.max(140, Math.min(startH + dh, this._screenH));

      // 磁吸：缩放时右边/底边对齐其他卡片或屏幕边缘
      if (typeof Magnetic !== 'undefined') {
        const rect = widget.getBoundingClientRect();
        const myRight = rect.left + newW;
        const myBottom = rect.top + newH;
        const T = Magnetic.SNAP_THRESHOLD;
        const guides = [];

        // 右边对齐
        document.querySelectorAll('.widget[data-widget]').forEach((el) => {
          if (el === widget || el.style.display === 'none') return;
          const o = el.getBoundingClientRect();
          if (Math.abs(myRight - o.left) < T) { newW = o.left - rect.left; guides.push({orient:'v',pos:o.left}); }
          if (Math.abs(myRight - o.right) < T) { newW = o.right - rect.left; guides.push({orient:'v',pos:o.right}); }
          // 底边对齐
          if (Math.abs(myBottom - o.top) < T) { newH = o.top - rect.top; guides.push({orient:'h',pos:o.top}); }
          if (Math.abs(myBottom - o.bottom) < T) { newH = o.bottom - rect.top; guides.push({orient:'h',pos:o.bottom}); }
        });
        // 屏幕边缘
        if (Math.abs(myRight - this._screenW) < T) { newW = this._screenW - rect.left; guides.push({orient:'v',pos:this._screenW}); }
        if (Math.abs(myBottom - this._screenH) < T) { newH = this._screenH - rect.top; guides.push({orient:'h',pos:this._screenH}); }

        Magnetic.showGuides(guides);
      }

      widget.style.width = newW + 'px';
      widget.style.height = newH + 'px';
    };

    const onUp = () => {
      if (!isResizing) return;
      isResizing = false;
      if (typeof Magnetic !== 'undefined') Magnetic.clearGuides();
      this._saveWidgetLayout(widget);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', onDown);
  },

  /**
   * 保存某个 widget 的布局到 Store（按显示器分桶）
   * displayKey 从 window.__dashboard.displayKey 获取（app.js 设置）
   */
  _saveWidgetLayout(widget) {
    const name = widget.dataset.widget;
    const displayKey = (window.__dashboard && window.__dashboard.displayKey) || 'primary';
    const displayLayout = Store.get('displayLayout') || {};
    if (!displayLayout[displayKey]) displayLayout[displayKey] = {};
    displayLayout[displayKey][name] = {
      left: widget.style.left,
      top: widget.style.top,
      width: widget.style.width,
      height: widget.style.height
    };
    Store.set('displayLayout', displayLayout);
  }
};
