// 猫咪详情：纯公开只读视图。管理操作（编辑/补充近况）仅在「管理台」进行，
// 避免游客从首页进入详情即可更改档案。
const service = require('../../utils/service');

Page({
  data: {
    id: '',
    cat: { name: '', isAdoptable: false, statusText: '', photos: [], voice: '' },
    attrs: [],
    timeline: [],
    notFound: false,
    playing: false
  },
  onLoad(options) {
    const id = options && options.id;
    this.setData({ id: id || '' });
    this.load(id);
    // 打开右上角菜单的「转发给朋友 / 分享到朋友圈 / 复制链接」
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
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
      this.setData({ cat: res.cat, attrs: res.attrs || [], more: res.more || [], timeline: res.timeline || [] });
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
  }
});
