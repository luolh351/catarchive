// 封面裁剪：固定比例取景（首页圆形 1:1 / 卡片横向 15:8，与实际显示区完全一致）。
// 图片可拖动/双指缩放，取景框固定不动；确认时用 canvas 按映射关系导出框内区域。
// 替代 wx.editImage（其裁剪框比例自由，与圆形/固定比例封面不匹配）。
const service = require('../../utils/service');

// 输出尺寸（px）：home 1:1，card 15:8（与详情页 hero 750:400 比例一致）
const OUT = { home: [600, 600], card: [960, 512] };

Page({
  data: {
    src: '',
    vw: 0, vh: 0,          // 取景视口（px）
    bw: 0, bh: 0,          // movable-view 基准尺寸（=图片原始像素）
    x: 0, y: 0,            // 初始定位（居中）
    scaleMin: 1, scaleMax: 4, scaleValue: 1,
    exporting: false
  },
  onLoad(op) {
    const src = decodeURIComponent(op.src || '');
    const target = op.target === 'card' ? 'card' : 'home';
    if (!src) { wx.showToast({ title: '缺少图片', icon: 'none' }); setTimeout(() => wx.navigateBack(), 600); return; }
    this._target = target;
    this._src = src;
    this._x = 0; this._y = 0; this._scale = 1;
    this._ready = false; this._done = false;
    // 管理操作：非管理员禁止进入
    service.checkAdmin().then(r => {
      if (!r || !r.isAdmin) wx.redirectTo({ url: '/pages/denied/denied' });
    }).catch(() => {});
    // 视口尺寸：宽高按比例分配，保证在屏幕内放得下
    const win = wx.getSystemInfoSync();
    const availW = win.windowWidth - 32;
    const availH = win.windowHeight - 240;
    const ratio = target === 'card' ? (OUT.card[0] / OUT.card[1]) : 1;
    let vw = availW, vh = vw / ratio;
    if (vh > availH) { vh = availH; vw = vh * ratio; }
    this.setData({ src, vw: Math.round(vw), vh: Math.round(vh) });
    // 载入图片：基准尺寸=原始像素，初始缩放至恰好铺满视口（cover）
    wx.getImageInfo({
      src,
      success: info => {
        this._iw = info.width; this._ih = info.height;
        const s0 = Math.max(this.data.vw / this._iw, this.data.vh / this._ih);
        const x0 = (this.data.vw - this._iw) / 2, y0 = (this.data.vh - this._ih) / 2;
        this.setData({
          bw: this._iw, bh: this._ih,
          scaleMin: s0, scaleMax: s0 * 4, scaleValue: s0,
          x: Math.round(x0), y: Math.round(y0)
        });
        this._x = x0; this._y = y0; this._scale = s0;
        this._ready = true;
      },
      fail: () => { wx.showToast({ title: '图片读取失败', icon: 'none' }); setTimeout(() => wx.navigateBack(), 600); }
    });
  },
  // 手势过程中只记录，不回写 data（回写会与手势打架）
  onChange(e) { this._x = e.detail.x; this._y = e.detail.y; },
  onScale(e) { this._x = e.detail.x; this._y = e.detail.y; this._scale = e.detail.scale; },
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
    const vw = this.data.vw, vh = this.data.vh, bw = this.data.bw, bh = this.data.bh;
    const scale = this._scale || 1;
    // 视口中心映射回原图坐标（显示px → 原始像素：× iw/(bw·scale)）
    const dx = vw / 2 - this._x, dy = vh / 2 - this._y;
    let sx = dx * this._iw / (bw * scale);
    let sy = dy * this._ih / (bh * scale);
    let sw = vw * this._iw / (bw * scale);
    let sh = vh * this._ih / (bh * scale);
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
