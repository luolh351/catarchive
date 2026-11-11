// 封面裁剪：固定比例取景（首页圆形 1:1 / 卡片横向 15:8，与实际显示区完全一致）。
// 自实现手势（弃用 movable-view，其坐标语义不可控导致所见非所得）：
//   - 单指拖动 / 双指缩放，每次移动后边界钳制——图片永远盖住取景框，不会拖出框外；
//   - 显示与导出用同一套状态计算映射，保证所见即所得；
//   - 圆形封面取景框视觉为圆形亮框（导出方形图，显示端圆角裁切，等价）。
const service = require('../../utils/service');

// 输出尺寸（px）：home 1:1，card 15:8（与详情页 hero 750:400 比例一致）
const OUT = { home: [600, 600], card: [960, 512] };

Page({
  data: {
    target: 'home',
    src: '',
    vw: 0, vh: 0,          // 取景视口（px）
    bw: 0, bh: 0,          // 图片基准尺寸（=原始像素）
    tx: 0, ty: 0, s: 1,    // 图片左上角在视口中的位置与缩放（渲染用）
    exporting: false
  },
  onLoad(op) {
    const src = decodeURIComponent(op.src || '');
    const target = op.target === 'card' ? 'card' : 'home';
    if (!src) { wx.showToast({ title: '缺少图片', icon: 'none' }); setTimeout(() => wx.navigateBack(), 600); return; }
    this._target = target;
    this._src = src;
    this._mode = '';
    this._ready = false; this._done = false;
    // 管理操作：非管理员禁止进入
    service.checkAdmin().then(r => {
      if (!r || !r.isAdmin) wx.redirectTo({ url: '/pages/denied/denied' });
    }).catch(() => {});
    // 视口尺寸：按比例分配，保证在屏幕内放得下
    const win = wx.getSystemInfoSync();
    const availW = win.windowWidth - 32;
    const availH = win.windowHeight - 240;
    const ratio = target === 'card' ? (OUT.card[0] / OUT.card[1]) : 1;
    let vw = availW, vh = vw / ratio;
    if (vh > availH) { vh = availH; vw = vh * ratio; }
    this.setData({ target, src, vw: Math.round(vw), vh: Math.round(vh) });
    // 载入图片：初始缩放至恰好铺满视口并居中（此时确认＝取中间）
    wx.getImageInfo({
      src,
      success: info => {
        this._iw = info.width; this._ih = info.height;
        const sMin = Math.max(this.data.vw / this._iw, this.data.vh / this._ih);
        this._s = sMin;
        this._sMin = sMin;
        this._sMax = sMin * 5;
        this._tx = (this.data.vw - this._iw * sMin) / 2;
        this._ty = (this.data.vh - this._ih * sMin) / 2;
        this.setData({
          bw: this._iw, bh: this._ih,
          tx: Math.round(this._tx), ty: Math.round(this._ty), s: sMin
        });
        this._ready = true;
      },
      fail: () => { wx.showToast({ title: '图片读取失败', icon: 'none' }); setTimeout(() => wx.navigateBack(), 600); }
    });
  },

  // ---------- 手势：单指拖动 / 双指缩放，状态自控并即时钳制边界 ----------
  onTouchStart(e) {
    const ts = e.touches;
    if (ts.length === 1) {
      this._mode = 'move';
      this._px = ts[0].clientX; this._py = ts[0].clientY;
      this._tx0 = this._tx; this._ty0 = this._ty;
    } else if (ts.length >= 2) {
      this._mode = 'zoom';
      this._dist = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) || 1;
      this._s0 = this._s;
      this._tx0 = this._tx; this._ty0 = this._ty;
      this._mx = (ts[0].clientX + ts[1].clientX) / 2;
      this._my = (ts[0].clientY + ts[1].clientY) / 2;
    }
  },
  onTouchMove(e) {
    const ts = e.touches;
    if (!this._ready || !this._mode) return;
    if (this._mode === 'move' && ts.length === 1) {
      this._tx = this._tx0 + (ts[0].clientX - this._px);
      this._ty = this._ty0 + (ts[0].clientY - this._py);
    } else if (this._mode === 'zoom' && ts.length >= 2) {
      const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) || 1;
      this._s = Math.min(Math.max(this._s0 * d / this._dist, this._sMin), this._sMax);
      // 两指中点对应的图片内容点跟随手指，缩放以捏合处为中心
      const mx = (ts[0].clientX + ts[1].clientX) / 2;
      const my = (ts[0].clientY + ts[1].clientY) / 2;
      const px = (this._mx - this._tx0) / this._s0;
      const py = (this._my - this._ty0) / this._s0;
      this._tx = mx - px * this._s;
      this._ty = my - py * this._s;
    }
    this.clampPos();
    this.setData({ tx: this._tx, ty: this._ty, s: this._s });
  },
  onTouchEnd(e) {
    const ts = e.touches;
    if (ts.length === 0) {
      this._mode = '';
    } else if (ts.length === 1) {
      // 双指 → 单指：以剩余触点为新拖动起点，避免跳变
      this._mode = 'move';
      this._px = ts[0].clientX; this._py = ts[0].clientY;
      this._tx0 = this._tx; this._ty0 = this._ty;
    }
  },
  // 边界钳制：图片任何时刻都必须盖满取景框（缩放下限=铺满，位移钳在框内）
  clampPos() {
    const vw = this.data.vw, vh = this.data.vh;
    const w = this.data.bw * this._s, h = this.data.bh * this._s;
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
    const vw = this.data.vw, vh = this.data.vh;
    const s = this._s || 1;
    // 显示与导出同一状态：视口 [0,vw]×[0,vh] → 图片显示坐标 [−tx, vw−tx]，再 ÷s 回到原始像素
    let sx = -this._tx / s;
    let sy = -this._ty / s;
    let sw = vw / s;
    let sh = vh / s;
    // 兜底钳制：不越出原图边界
    sx = sw >= this._iw ? (this._iw - sw) / 2 : Math.min(Math.max(sx, 0), this._iw - sw);
    sy = sh >= this._ih ? (this._ih - sh) / 2 : Math.min(Math.max(sy, 0), this._ih - sh);
    const ow = OUT[this._target][0], oh = OUT[this._target][1];
    wx.createSelectorQuery().in(this).select('#cropCanvas').fields({ node: true }).exec(res => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) { this.failExport(); return; }
      canvas.width = ow; canvas.height = oh;
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        ctx.clearRect(0, 0, ow, oh);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
        wx.canvasToTempFilePath({
          canvas, x: 0, y: 0, width: ow, height: oh, destWidth: ow, destHeight: oh,
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
