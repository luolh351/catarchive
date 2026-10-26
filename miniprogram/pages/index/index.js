// 首页：四状态标签 + 卡片列表 + 搜索，经服务层读取（默认本地模拟，可切云端）
const service = require('../../utils/service');

Page({
  data: { active: '在校', list: [], all: [], q: '' },
  onLoad() { this.applyTab('在校'); },
  setTab(e) { this.applyTab(e.currentTarget.dataset.s); },
  applyTab(s) {
    this.setData({ active: s, q: '' });
    wx.showLoading({ title: '加载中' });
    service.getCats(s)
      .then(list => { this.setData({ all: list }); this.filter(); wx.hideLoading(); })
      .catch(() => { this.setData({ all: [], list: [] }); wx.hideLoading(); wx.showToast({ title: '加载失败，请重试', icon: 'none' }); });
  },
  onSearch(e) { this.setData({ q: e.detail.value }); this.filter(); },
  filter() {
    const q = (this.data.q || '').trim().toLowerCase();
    if (!q) { this.setData({ list: this.data.all }); return; }
    const list = this.data.all.filter(c =>
      (c.name || '').toLowerCase().indexOf(q) >= 0 || (c.sub || '').toLowerCase().indexOf(q) >= 0);
    this.setData({ list });
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id });
  }
});
