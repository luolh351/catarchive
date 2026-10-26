// 猫咪详情：纯公开只读视图。管理操作（编辑/补充近况）仅在「管理台」进行，
// 避免游客从首页进入详情即可更改档案。
const service = require('../../utils/service');

Page({
  data: {
    id: '',
    cat: { name: '', isAdoptable: false, statusText: '', photos: [], voice: '' },
    attrs: [],
    timeline: [],
    notFound: false
  },
  onLoad(options) {
    const id = options && options.id;
    this.setData({ id });
    this.load(id);
  },
  load(id) {
    service.getCat(id).then(res => {
      if (!res.cat) { this.setData({ notFound: true }); return; }
      this.setData({ cat: res.cat, attrs: res.attrs || [], timeline: res.timeline || [] });
    }).catch(() => { this.setData({ notFound: true }); wx.showToast({ title: '加载失败', icon: 'none' }); });
  }
});
