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
  _dirty: false,   // 本次编辑会话是否拖拽/缩放过（退出编辑时提示保存布局方案）

  init() {
    // 屏幕尺寸变化时更新边界
    window.addEventListener('resize', () => {
      this._screenW = window.innerWidth;
      this._screenH = window.innerHeight;
    });

    document.querySelectorAll('.widget').forEach((widget) => {
      // 左下角缩放手柄（动态注入，index.html 只写了右下角）
      if (!widget.querySelector('.widget__resize--bl')) {
        const bl = document.createElement('div');
        bl.className = 'widget__resize widget__resize--bl';
        widget.appendChild(bl);
      }
      this._bindDrag(widget);
      this._bindResize(widget, widget.querySelector('.widget__resize:not(.widget__resize--bl)'), 'br');
      this._bindResize(widget, widget.querySelector('.widget__resize--bl'), 'bl');
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
  _bindResize(widget, handle, dir) {
    if (!handle) return;
    const isBL = dir === 'bl';   // 左下角：向左拖增宽（同步改 left）

    let startX, startY, startW, startH, startLeft, isResizing = false;

    const onDown = (e) => {
      if (!document.body.classList.contains('interactive')) return;
      if (e.button !== 0) return;

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = widget.offsetWidth;
      startH = widget.offsetHeight;
      startLeft = parseInt(widget.style.left) || widget.getBoundingClientRect().left;

      e.preventDefault();
      e.stopPropagation();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
      if (!isResizing) return;
      let dw = e.clientX - startX;
      let dh = e.clientY - startY;
      // 左下角手柄：向左拖（dw 负）宽度增加，left 同步左移
      let newW = Math.max(200, Math.min(isBL ? startW - dw : startW + dw, this._screenW));
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

      // BL 左下角：left 在磁吸之后再算（磁吸会改 newW，先写 left 会导致右缘漂移）
      if (isBL) widget.style.left = Math.max(0, startLeft - (newW - startW)) + 'px';
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
    this._dirty = true;   // 标记本次编辑改过布局
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
