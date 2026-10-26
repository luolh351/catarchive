// 猫咪详情：经服务层读取（默认本地模拟，可切云端）；管理员可见编辑/补充近况入口
const service = require('../../utils/service');

Page({
  data: {
    id: '',
    cat: { name: '', isAdoptable: false, statusText: '', photos: [], voice: '' },
    attrs: [],
    timeline: [],
    notFound: false,
    isAdmin: false
  },
  onLoad(options) {
    const id = options && options.id;
    this.setData({ id });
    service.checkAdmin().then(r => { if (r && r.isAdmin) this.setData({ isAdmin: true }); }).catch(() => {});
    this.load(id);
  },
  load(id) {
    service.getCat(id).then(res => {
      if (!res.cat) { this.setData({ notFound: true }); return; }
      this.setData({ cat: res.cat, attrs: res.attrs || [], timeline: res.timeline || [] });
    }).catch(() => { this.setData({ notFound: true }); wx.showToast({ title: '加载失败', icon: 'none' }); });
  },
  editCat() {
    if (!this.data.isAdmin) { wx.showToast({ title: '仅管理员可编辑', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/catForm/catForm?id=' + this.data.id });
  },
  addUpdate() {
    if (!this.data.isAdmin) { wx.showToast({ title: '仅管理员可补充', icon: 'none' }); return; }
    wx.showModal({
      title: '补充近况', editable: true, placeholderText: '输入本次近况',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          wx.showLoading({ title: '提交中' });
          service.addUpdate(this.data.id, res.content.trim()).then(r => {
            wx.hideLoading();
            if (r && r.ok === false) { wx.showToast({ title: r.msg || '失败', icon: 'none' }); return; }
            wx.showToast({ title: '已补充', icon: 'success' });
            this.load(this.data.id);
          }).catch(() => { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); });
        }
      }
    });
  }
});
