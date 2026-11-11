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
    ready: false,        // 图片加载完成前禁用确认，避免误点无反应
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
      // 物理像素取整（dpr 可能是 2.75 等非整数），绘制与导出的坐标系都用这组值
      this._cw = Math.round(this.data.vw * dpr);
      this._ch = Math.round(this.data.vh * dpr);
      canvas.width = this._cw;
      canvas.height = this._ch;
      this._canvas = canvas;
      this._ctx = canvas.getContext('2d');
      // 真实尺寸必须用 wx.getImageInfo 取：createImage 的 img.width/height 在部分基础库
      // 返回默认值而非自然尺寸，会让缩放与导出映射全部错位（截出偏移/半张图）
      wx.getImageInfo({
        src: this._src,
        success: info => {
          this._iw = info.width;
          this._ih = info.height;
          const img = canvas.createImage();   // Image 只用于绘制，不读它的 width
          img.onload = () => {
            this._img = img;
            // 初始：恰好铺满取景框并居中（此时确认 = 取中间区域）
            const sMin = Math.max(this.data.vw / this._iw, this.data.vh / this._ih);
            this._sMin = sMin;
            this._sMax = sMin * 5;
            this._s = sMin;
            this._tx = (this.data.vw - this._iw * sMin) / 2;
            this._ty = (this.data.vh - this._ih * sMin) / 2;
            this._ready = true;
            this.setData({ ready: true });
            this.draw();
          };
          img.onerror = () => wx.showToast({ title: '图片读取失败', icon: 'none' });
          img.src = this._src;
        },
        fail: () => {
          wx.showToast({ title: '图片读取失败', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 600);
        }
      });
    });
  },
  // 绘制：图片 + （圆形时）圆外压暗与白色圆环。
  // noMask=true 时只画图片（导出用），保证导出内容=框内画面
  draw(noMask) {
    const ctx = this._ctx;
    if (!ctx || !this._img) return;
    const W = this.data.vw, H = this.data.vh;
    const rx = this._cw / W, ry = this._ch / H;
    ctx.setTransform(rx, 0, 0, ry, 0, 0);        // 以 CSS px 为单位绘制
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this._img, this._tx, this._ty, this._iw * this._s, this._ih * this._s);
    if (noMask) return;
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
    clearTimeout(this._exportTimer);
    if (!this._done) {
      const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (ch && ch.emit) ch.emit('coverCropCancel', {});   // 物理返回也通知来源页清理中间文件
    }
  },
  confirm() {
    if (this.data.exporting || !this.data.ready) return;
    if (!this._ready) { wx.showToast({ title: '图片尚未加载', icon: 'none' }); return; }
    this.setData({ exporting: true });
    // 直接导出预览画布：画布上画的就是框内画面（所见即所得），无需坐标换算，
    // 也不依赖页面外的第二块画布（其 canvasToTempFilePath 在真机上回调不稳定会卡死）。
    // 先重绘一帧去掉遮罩/圆环，导出整块画布即可。
    this.draw(true);
    const ow = OUT[this._target][0], oh = OUT[this._target][1];
    // 兜底：万一个别机型上导出回调不触发，超时恢复按钮，避免永久卡在“生成中”
    clearTimeout(this._exportTimer);
    this._exportTimer = setTimeout(() => {
      if (this._done) return;
      this.draw();
      this.failExport();
    }, 5000);
    wx.canvasToTempFilePath({
      canvas: this._canvas,
      x: 0, y: 0, width: this._cw, height: this._ch,
      destWidth: ow, destHeight: oh,
      fileType: 'jpg', quality: 0.92,
      success: r => {
        clearTimeout(this._exportTimer);
        this._done = true;
        const ch = this.getOpenerEventChannel && this.getOpenerEventChannel();
        if (ch && ch.emit) ch.emit('coverCropDone', { target: this._target, path: r.tempFilePath });
        wx.navigateBack();
      },
      fail: () => { clearTimeout(this._exportTimer); this.draw(); this.failExport(); }
    });
  },
  failExport() {
    this.setData({ exporting: false });
    wx.showToast({ title: '生成失败，请重试', icon: 'none' });
  }
});
