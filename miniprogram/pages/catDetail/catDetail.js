// 猫咪详情：公开只读视图 + 游客报近况入口（浮游按钮，提交进待审，管理员通过后展示）。
// 管理操作（编辑/补充近况）仍在「管理台」进行，游客提交不直接改档案。
const service = require('../../utils/service');

Page({
  data: {
    id: '',
    cat: { name: '', isAdoptable: false, statusText: '', photos: [], voice: '' },
    attrs: [],
    timeline: [],
    notFound: false,
    playing: false,
    photoPages: [],      // 照片墙：每页 3 张（{k, items}）
    viewer: false,       // 全屏查看层开关
    viewerIndex: 0       // 当前查看的照片序号
  },
  onLoad(options) {
    const id = options && options.id;
    this.setData({ id: id || '' });
    this.load(id);
    // 打开右上角菜单的「转发给朋友 / 分享到朋友圈 / 复制链接」
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  // 游客报近况：跳转公开提交页（先审后显），带防重入
  goReport() {
    if (this._jumping) return;
    this._jumping = true;
    wx.navigateTo({
      url: '/pages/updateSubmit/updateSubmit?catId=' + encodeURIComponent(this.data.id || ''),
      complete: () => setTimeout(() => { this._jumping = false; }, 400)
    });
  },
  // 转发给朋友：带猫咪名与封面，接收者点击直达该猫详情页
  onShareAppMessage() {
    const c = this.data.cat || {};
    return {
      title: c.name ? '来认识「' + c.name + '」｜校园猫咪档案馆' : '校园猫咪档案馆',
      path: '/pages/catDetail/catDetail?id=' + encodeURIComponent(this.data.id || ''),
      imageUrl: (c.photos && c.photos[0]) || ''
    };
  },
  // 分享到朋友圈：单页模式打开，query 即页面参数
  onShareTimeline() {
    const c = this.data.cat || {};
    return {
      title: c.name ? '来认识「' + c.name + '」' : '校园猫咪档案馆',
      query: 'id=' + encodeURIComponent(this.data.id || ''),
      imageUrl: (c.photos && c.photos[0]) || ''
    };
  },
  onUnload() {
    if (this.audio) { this.audio.destroy(); this.audio = null; }
  },
  load(id) {
    service.getCat(id).then(res => {
      if (!res.cat) { this.setData({ notFound: true }); return; }
      // 照片按每页 3 张分块，供照片墙 swiper 渲染
      const photos = res.cat.photos || [];
      const photoPages = [];
      for (let i = 0; i < photos.length; i += 3) photoPages.push({ k: String(i), items: photos.slice(i, i + 3) });
      this.setData({ cat: res.cat, photoPages, attrs: res.attrs || [], more: res.more || [], timeline: res.timeline || [] });
    }).catch(() => { this.setData({ notFound: true }); wx.showToast({ title: '加载失败', icon: 'none' }); });
  },
  // 播放/停止猫叫声（本地文件直接播；云存储 cloud:// 需先下载为临时文件）
  playVoice() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null; }
    if (this.data.playing) { this.setData({ playing: false }); return; }
    const src = this.data.cat.voice;
    if (src && src.indexOf('cloud://') === 0 && wx.cloud && wx.cloud.downloadFile) {
      wx.showLoading({ title: '加载中' });
      wx.cloud.downloadFile({ fileID: src }).then(r => {
        wx.hideLoading();
        this.startPlay(r.tempFilePath);
      }).catch(err => {
        wx.hideLoading();
        // 打印具体原因：常见为文件不存在（fileID 错误/已删除）或网络问题
        console.warn('[audio] 云存储音频下载失败:', src, err);
        wx.showToast({ title: '下载失败，检查云存储文件是否存在', icon: 'none' });
      });
      return;
    }
    this.startPlay(src);
  },
  startPlay(src) {
    const a = wx.createInnerAudioContext();
    a.src = src;
    a.onPlay(() => this.setData({ playing: true }));
    a.onEnded(() => this.setData({ playing: false }));
    a.onStop(() => this.setData({ playing: false }));
    a.onError(e => {
      this.setData({ playing: false });
      // 输出错误码便于区分：10001 系统错误 / 10002 网络错误 / 10003 文件错误 / 10004 格式错误 / -1 未知
      const code = (e && e.errCode) || '';
      console.warn('[audio] 播放失败 errCode=' + code + ' errMsg=' + ((e && e.errMsg) || '') + ' src=' + src);
      wx.showToast({ title: code ? ('播放失败 ' + code) : '播放失败', icon: 'none' });
    });
    a.play();
    this.audio = a;
  },
  // 查看近况配图（时间线条目图 / 档案近况图共用）
  previewPhotos(e) {
    const list = e.currentTarget.dataset.list || [];
    if (!list.length) return;
    wx.previewImage({ urls: list, current: e.currentTarget.dataset.src });
  },

  // ---------- 全屏照片查看层 ----------
  openViewer(e) {
    const i = parseInt(e.currentTarget.dataset.i || 0, 10) || 0;
    if (!this.data.cat.photos.length) return;
    this.setData({ viewer: true, viewerIndex: Math.min(i, this.data.cat.photos.length - 1) });
  },
  closeViewer() { this.setData({ viewer: false }); },
  stop() {},   // 阻止查看层背景滚动穿透
  onViewerChange(e) { this.setData({ viewerIndex: e.detail.current }); },
  // 左右箭头切换（循环）
  prevPhoto() {
    const n = this.data.cat.photos.length;
    if (!n) return;
    this.setData({ viewerIndex: (this.data.viewerIndex - 1 + n) % n });
  },
  nextPhoto() {
    const n = this.data.cat.photos.length;
    if (!n) return;
    this.setData({ viewerIndex: (this.data.viewerIndex + 1) % n });
  },
  // 保存当前大图到相册（游客可用）；cloud:// 需先下载为临时文件
  savePhoto() {
    const photos = this.data.cat.photos || [];
    const src = photos[this.data.viewerIndex];
    if (!src) return;
    const save = path => wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: err => {
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('auth') >= 0 || msg.indexOf('denied') >= 0) {
          // 授权被拒：引导去设置开启，避免静默失败
          wx.showModal({
            title: '需要相册权限', content: '保存图片需要授权访问相册，请在设置中开启',
            confirmText: '去设置', success: r => { if (r.confirm) wx.openSetting({}); }
          });
        } else if (msg.indexOf('cancel') < 0) {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
    if (src.indexOf('cloud://') === 0 && wx.cloud && wx.cloud.downloadFile) {
      wx.showLoading({ title: '准备图片' });
      wx.cloud.downloadFile({ fileID: src }).then(r => { wx.hideLoading(); save(r.tempFilePath); }).catch(err => {
        wx.hideLoading();
        console.warn('[photo] 云存储下载失败:', src, err);
        wx.showToast({ title: '图片下载失败', icon: 'none' });
      });
      return;
    }
    if (/^https?:\/\//.test(src)) {
      wx.showLoading({ title: '准备图片' });
      wx.downloadFile({ url: src, success: r => { wx.hideLoading(); save(r.tempFilePath); }, fail: () => { wx.hideLoading(); wx.showToast({ title: '图片下载失败', icon: 'none' }); } });
      return;
    }
    save(src);   // 本地路径（mock 演示图）
  }
});
