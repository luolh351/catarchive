// 首页：四状态标签 + 卡片列表 + 搜索。搜索时隐藏状态分类、跨分类直接展示匹配结果。
// 经服务层读取（默认本地模拟，可切云端）。编辑后 onShow 重新拉取，保证首页即时更新。
const service = require('../../utils/service');

Page({
  data: { active: '在校', list: [], all: [], q: '' },
  onShow() { this.loadAll(); },
  loadAll() {
    wx.showLoading({ title: '加载中' });
    service.getCats()
      .then(all => { this.setData({ all }); this.applyView(); wx.hideLoading(); })
      .catch(() => {
        this.setData({ all: [], list: [] });
        wx.hideLoading();
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      });
  },
  setTab(e) { this.setData({ active: e.currentTarget.dataset.s }); this.applyView(); },
  onSearch(e) { this.setData({ q: e.detail.value }); this.applyView(); },
  // 搜索中：跨全部状态匹配（名字/昵称/毛色/全部出没区域/最近情况）；非搜索：按当前状态标签过滤
  applyView() {
    const q = (this.data.q || '').trim().toLowerCase();
    let list;
    if (q) {
      list = this.data.all.filter(c => this.match(c, q));
    } else {
      list = this.data.all.filter(c => c.lifeStatus === this.data.active);
    }
    this.setData({ list });
  },
  // 命中任一字段即算匹配：名字、昵称、毛色、常出没（全部）、最近情况
  match(c, q) {
    const hit = v => (v || '').toLowerCase().indexOf(q) >= 0;
    return hit(c.name) || hit(c.aliasesText) || hit(c.coatColor) ||
      hit(c.locationsText) || hit(c.latestNote) || hit(c.sub);
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id });
  }
});
