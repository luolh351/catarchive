// 猫咪详情：经服务层读取（默认本地模拟，可切云端）
const service = require('../../utils/service');

Page({
  data: {
    cat: { name: '', isAdoptable: false, statusText: '', photos: [], voice: '' },
    attrs: [],
    timeline: [],
    notFound: false
  },
  onLoad(options) {
    const id = options && options.id;
    service.getCat(id)
      .then(res => {
        if (!res.cat) {
          this.setData({ notFound: true });
          return;
        }
        this.setData({
          cat: res.cat,
          attrs: res.attrs || [],
          timeline: res.timeline || []
        });
      })
      .catch(() => { this.setData({ notFound: true }); wx.showToast({ title: '加载失败', icon: 'none' }); });
  }
});
