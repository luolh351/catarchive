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
  // 播放/停止猫叫声（wav/mp3 包内文件；InnerAudioContext 官方支持两种格式）
  playVoice() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null; }
    if (this.data.playing) { this.setData({ playing: false }); return; }
    const a = wx.createInnerAudioContext();
    a.src = this.data.cat.voice;
    a.onPlay(() => this.setData({ playing: true }));
    a.onEnded(() => this.setData({ playing: false }));
    a.onStop(() => this.setData({ playing: false }));
    a.onError(() => {
      this.setData({ playing: false });
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
    a.play();
    this.audio = a;
  }
});
