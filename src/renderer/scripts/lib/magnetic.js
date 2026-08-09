/* ============================================================
   窗口磁吸 + 网格辅助线
   - 拖动卡片时，靠近其他卡片边缘或屏幕边缘自动吸附（5px 阈值）
   - 显示蓝色对齐辅助线
   - 集成进 drag-resize.js 的拖动流程
   ============================================================ */

const Magnetic = {
  SNAP_THRESHOLD: 6,      // 吸附阈值（px）
  GRID_SIZE: 0,           // 网格大小（0=不启用网格吸附）
  _guideLines: [],        // 当前显示的辅助线

  /**
   * 在拖动过程中，计算磁吸调整后的位置
   * @param {Object} moving - 正在拖动的卡片 {left, top, width, height}
   * @param {number} proposedLeft - 拖动产生的目标 left
   * @param {number} proposedTop - 拖动产生的目标 top
   * @param {Element} movingEl - 卡片 DOM（用于排除自身）
   * @returns {{left, top, guides: []}} 调整后的位置 + 辅助线
   */
  snap(moving, proposedLeft, proposedTop, movingEl) {
    let finalLeft = proposedLeft;
    let finalTop = proposedTop;
    const guides = [];
    const T = this.SNAP_THRESHOLD;

    const movingRight = finalLeft + moving.width;
    const movingBottom = finalTop + moving.height;
    const movingCenterX = finalLeft + moving.width / 2;
    const movingCenterY = finalTop + moving.height / 2;

    // 屏幕边缘吸附
    const edges = [
      { type: 'left', val: 0, target: finalLeft },
      { type: 'right', val: window.innerWidth, target: movingRight },
      { type: 'top', val: 0, target: finalTop },
      { type: 'bottom', val: window.innerHeight, target: movingBottom },
    ];
    for (const e of edges) {
      if (Math.abs(e.target - e.val) < T) {
        if (e.type === 'left') { finalLeft = e.val; guides.push({ orient: 'v', pos: e.val }); }
        if (e.type === 'right') { finalLeft = e.val - moving.width; guides.push({ orient: 'v', pos: e.val }); }
        if (e.type === 'top') { finalTop = e.val; guides.push({ orient: 'h', pos: e.val }); }
        if (e.type === 'bottom') { finalTop = e.val - moving.height; guides.push({ orient: 'h', pos: e.val }); }
      }
    }

    // 其他卡片吸附
    document.querySelectorAll('.widget[data-widget]').forEach((el) => {
      if (el === movingEl || el.style.display === 'none') return;
      const rect = el.getBoundingClientRect();
      const o = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                  cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };

      // 左边对齐
      if (Math.abs(finalLeft - o.left) < T) { finalLeft = o.left; guides.push({ orient: 'v', pos: o.left }); }
      // 右边对齐
      if (Math.abs(movingRight - o.right) < T) { finalLeft = o.right - moving.width; guides.push({ orient: 'v', pos: o.right }); }
      // 左对右、右对左
      if (Math.abs(finalLeft - o.right) < T) { finalLeft = o.right; guides.push({ orient: 'v', pos: o.right }); }
      if (Math.abs(movingRight - o.left) < T) { finalLeft = o.left - moving.width; guides.push({ orient: 'v', pos: o.left }); }

      // 顶部对齐
      if (Math.abs(finalTop - o.top) < T) { finalTop = o.top; guides.push({ orient: 'h', pos: o.top }); }
      // 底部对齐
      if (Math.abs(movingBottom - o.bottom) < T) { finalTop = o.bottom - moving.height; guides.push({ orient: 'h', pos: o.bottom }); }
      // 上对下、下对上
      if (Math.abs(finalTop - o.bottom) < T) { finalTop = o.bottom; guides.push({ orient: 'h', pos: o.bottom }); }
      if (Math.abs(movingBottom - o.top) < T) { finalTop = o.top - moving.height; guides.push({ orient: 'h', pos: o.top }); }

      // 中心对齐
      if (Math.abs(movingCenterX - o.cx) < T) {
        finalLeft = o.cx - moving.width / 2;
        guides.push({ orient: 'v', pos: o.cx, dashed: true });
      }
      if (Math.abs(movingCenterY - o.cy) < T) {
        finalTop = o.cy - moving.height / 2;
        guides.push({ orient: 'h', pos: o.cy, dashed: true });
      }
    });

    // 重新计算（吸附后右边/底边变了）
    return { left: finalLeft, top: finalTop, guides };
  },

  /**
   * 显示辅助线
   */
  showGuides(guides) {
    this.clearGuides();
    guides.forEach((g) => {
      const line = document.createElement('div');
      line.className = 'magnetic-guide' + (g.dashed ? ' magnetic-guide--dashed' : '');
      if (g.orient === 'v') {
        line.style.cssText = `position:fixed;left:${g.pos}px;top:0;width:1px;height:100vh;
          background:#60a5fa;z-index:99999;pointer-events:none;box-shadow:0 0 4px #60a5fa;`;
      } else {
        line.style.cssText = `position:fixed;left:0;top:${g.pos}px;width:100vw;height:1px;
          background:#60a5fa;z-index:99999;pointer-events:none;box-shadow:0 0 4px #60a5fa;`;
      }
      if (g.dashed) line.style.borderTop = '1px dashed #fbbf24';
      document.body.appendChild(line);
      this._guideLines.push(line);
    });
  },

  clearGuides() {
    this._guideLines.forEach((l) => l.remove());
    this._guideLines = [];
  }
};
