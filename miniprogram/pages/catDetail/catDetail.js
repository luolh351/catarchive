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
  },
  onUnload() {
    if (this.audio) { this.audio.destroy(); this.audio = null; }
  },
  load(id) {
    service.getCat(id).then(res => {
      if (!res.cat) { this.setData({ notFound: true }); return; }
      this.setData({ cat: res.cat, attrs: res.attrs || [], timeline: res.timeline || [] });
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
  // 把云端叫声另存到电脑（仅电脑版微信 / 开发者工具支持；手机端微信不允许写本地磁盘）
  saveVoice() {
    const src = this.data.cat.voice;
    if (!src) return;
    if (src.indexOf('cloud://') !== 0) {
      wx.showToast({ title: '仅云端上传的音频可另存', icon: 'none' });
      return;
    }
    if (!wx.saveFileToDisk) {
      wx.showToast({ title: '请在电脑版微信中使用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '下载中' });
    wx.cloud.downloadFile({ fileID: src }).then(r => {
      wx.hideLoading();
      wx.saveFileToDisk({
        filePath: r.tempFilePath,
        success: () => wx.showToast({ title: '已保存到电脑' }),
        fail: (e) => {
          console.warn('[audio] 另存失败:', e);
          wx.showToast({ title: '另存失败', icon: 'none' });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      console.warn('[audio] 下载失败:', err);
      wx.showToast({ title: '下载失败', icon: 'none' });
    });
  },
});
