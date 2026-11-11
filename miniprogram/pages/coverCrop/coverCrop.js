// 封面裁剪（canvas 自绘）：
//   放弃 DOM 样式方案，图片、遮罩、取景框全部画在 canvas 上——
//   预览与导出使用同一套坐标计算，所见即所得；
//   手势直接重绘画布（不 setData），拖动/双指缩放流畅；
//   每次移动后严格钳制：缩放下限=铺满取景框，位移不出框，图片永远盖满亮框。
const service = require('../../utils/service');

// 输出尺寸（px）：home 1:1，card 15:8（与详情页 hero 750:400 比例一致）
const OUT = { home: [600, 600], card: [960, 512] };

Page({
  data: {
    target: 'home',
    vw: 0, vh: 0,        // 取景框尺寸（CSS px）
    exporting: false
  },
  onLoad(op) {
    const src = decodeURIComponent(op.src || '');
    const target = op.target === 'card' ? 'card' : 'home';
    if (!src) { wx.showToast({ title: '缺少图片', icon: 'none' }); setTimeout(() => wx.navigateBack(), 600); return; }
    this._target = target;
    this._src = src;
    this._mode = '';
    this._ready = false;
    this._done = false;
    // 管理操作：非管理员禁止进入
    service.checkAdmin().then(r => {
      if (!r || !r.isAdmin) wx.redirectTo({ url: '/pages/denied/denied' });
    }).catch(() => {});
    // 取景框尺寸：按比例分配，保证在屏幕内放得下
    const win = wx.getSystemInfoSync();
    const ratio = target === 'card' ? (OUT.card[0] / OUT.card[1]) : 1;
    const availW = win.windowWidth - 32;
    const availH = win.windowHeight - 240;
    let vw = availW, vh = vw / ratio;
    if (vh > availH) { vh = availH; vw = vh * ratio; }
    this._dpr = win.pixelRatio || 2;
    this.setData({ target, vw: Math.round(vw), vh: Math.round(vh) }, () => this.initCanvas());
  },
  initCanvas() {
    wx.createSelectorQuery().in(this).select('#cropView').fields({ node: true }).exec(res => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) { wx.showToast({ title: '画布初始化失败', icon: 'none' }); return; }
      const dpr = this._dpr;
      canvas.width = this.data.vw * dpr;
      canvas.height = this.data.vh * dpr;
      this._canvas = canvas;
      this._ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        this._img = img;
        this._iw = img.width;
        this._ih = img.height;
        // 初始：恰好铺满取景框并居中（此时确认 = 取中间区域）
        const sMin = Math.max(this.data.vw / this._iw, this.data.vh / this._ih);
        this._sMin = sMin;
        this._sMax = sMin * 5;
        this._s = sMin;
        this._tx = (this.data.vw - this._iw * sMin) / 2;
        this._ty = (this.data.vh - this._ih * sMin) / 2;
        this._ready = true;
        this.draw();
      };
      img.onerror = () => wx.showToast({ title: '图片读取失败', icon: 'none' });
      img.src = this._src;
    });
  },
  // 绘制：图片 + （圆形时）圆外压暗与白色圆环。预览与导出同一变换
  draw() {
    const ctx = this._ctx;
    if (!ctx || !this._img) return;
    const W = this.data.vw, H = this.data.vh, dpr = this._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);      // 以 CSS px 为单位绘制
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this._img, this._tx, this._ty, this._iw * this._s, this._ih * this._s);
    if (this._target === 'home') {
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2;
      // 反向路径挖洞：方形四角压暗，圆形区域保持清晰
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(8,12,20,.62)';
      ctx.fill();
      // 白色圆环
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  // ---------- 手势（canvas 触摸事件坐标相对画布，直接重绘，无 setData） ----------
  onTouchStart(e) {
    const ts = e.touches;
    if (ts.length === 1) {
      this._mode = 'move';
      this._px = ts[0].x; this._py = ts[0].y;
      this._tx0 = this._tx; this._ty0 = this._ty;
    } else if (ts.length >= 2) {
      this._mode = 'zoom';
      this._dist = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y) || 1;
      this._s0 = this._s;
      this._tx0 = this._tx; this._ty0 = this._ty;
      this._mx = (ts[0].x + ts[1].x) / 2;
      this._my = (ts[0].y + ts[1].y) / 2;
    }
  },
  onTouchMove(e) {
    const ts = e.touches;
    if (!this._ready || !this._mode) return;
    if (this._mode === 'move' && ts.length === 1) {
      this._tx = this._tx0 + (ts[0].x - this._px);
      this._ty = this._ty0 + (ts[0].y - this._py);
    } else if (this._mode === 'zoom' && ts.length >= 2) {
      const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y) || 1;
      this._s = Math.min(Math.max(this._s0 * d / this._dist, this._sMin), this._sMax);
      // 两指中点对应的图片内容点跟随手指，缩放以捏合处为中心
      const mx = (ts[0].x + ts[1].x) / 2;
      const my = (ts[0].y + ts[1].y) / 2;
      const pxl = (this._mx - this._tx0) / this._s0;
      const pyl = (this._my - this._ty0) / this._s0;
      this._tx = mx - pxl * this._s;
      this._ty = my - pyl * this._s;
    }
    this.clampPos();
    this.draw();
  },
  onTouchEnd(e) {
    const ts = e.touches;
    if (ts.length === 0) {
      this._mode = '';
    } else if (ts.length === 1) {
      // 双指 → 单指：以剩余触点为新起点，避免跳变
      this._mode = 'move';
      this._px = ts[0].x; this._py = ts[0].y;
      this._tx0 = this._tx; this._ty0 = this._ty;
    }
  },
  // 边界钳制：缩放下限=铺满取景框；位移钳在框内（图片永远盖满亮框）
  clampPos() {
    const vw = this.data.vw, vh = this.data.vh;
    const w = this._iw * this._s, h = this._ih * this._s;
    this._tx = w <= vw ? (vw - w) / 2 : Math.min(Math.max(this._tx, vw - w), 0);
    this._ty = h <= vh ? (vh - h) / 2 : Math.min(Math.max(this._ty, vh - h), 0);
  },

  cancel() {
    this._done = true;
    const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (ch && ch.emit) ch.emit('coverCropCancel', {});
    wx.navigateBack();
  },
  onUnload() {
    if (!this._done) {
      const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (ch && ch.emit) ch.emit('coverCropCancel', {});   // 物理返回也通知来源页清理中间文件
    }
  },
  confirm() {
    if (this.data.exporting) return;
    if (!this._ready) { wx.showToast({ title: '图片尚未加载', icon: 'none' }); return; }
    this.setData({ exporting: true });
    const W = this.data.vw, H = this.data.vh;
    const s = this._s || 1;
    // 与预览完全一致：取景框 [0,W]×[0,H] 对应图片显示坐标 [−tx, W−tx]，÷s 回到原始像素
    const sx = -this._tx / s;
    const sy = -this._ty / s;
    const sw = W / s;
    const sh = H / s;
    const ow = OUT[this._target][0], oh = OUT[this._target][1];
    wx.createSelectorQuery().in(this).select('#cropOut').fields({ node: true }).exec(res => {
      const cv = res && res[0] && res[0].node;
      if (!cv) { this.failExport(); return; }
      cv.width = ow; cv.height = oh;
      const ctx = cv.getContext('2d');
      const img = cv.createImage();
      img.onload = () => {
        ctx.clearRect(0, 0, ow, oh);
        // 兜底：源区域可能越界时先钳制，再按同比例映射到输出画布
        const x0 = Math.max(sx, 0), y0 = Math.max(sy, 0);
        const x1 = Math.min(sx + sw, this._iw), y1 = Math.min(sy + sh, this._ih);
        if (x1 > x0 && y1 > y0) {
          const dx = (x0 - sx) / sw * ow, dy = (y0 - sy) / sh * oh;
          const dw = (x1 - x0) / sw * ow, dh = (y1 - y0) / sh * oh;
          ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, dx, dy, dw, dh);
        }
        wx.canvasToTempFilePath({
          canvas: cv, x: 0, y: 0, width: ow, height: oh, destWidth: ow, destHeight: oh,
          success: r => {
            this._done = true;
            const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
            if (ch && ch.emit) ch.emit('coverCropDone', { target: this._target, path: r.tempFilePath });
            wx.navigateBack();
          },
          fail: () => this.failExport()
        });
      };
      img.onerror = () => this.failExport();
      img.src = this._src;
    });
  },
  failExport() {
    this.setData({ exporting: false });
    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
  }
});
