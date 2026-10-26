// 首页（骨架）：四去向状态 + 卡片列表，经服务层读取（默认本地模拟，可切云端）
const service = require('../../utils/service');

Page({
  data: { active: '在校', list: [] },
  onLoad() { this.applyTab('在校'); },
  setTab(e) { this.applyTab(e.currentTarget.dataset.s); },
  applyTab(s) {
    this.setData({ active: s });
    service.getCats(s)
      .then(list => this.setData({ list }))
      .catch(() => this.setData({ list: [] }));
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id });
  }
});
