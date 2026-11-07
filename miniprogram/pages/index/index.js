// 首页：四状态标签 + 卡片列表。搜索在独立页面 pages/search 进行（返回键自动回首页）。
// 经服务层读取（默认本地模拟，可切云端）。编辑后 onShow 重新拉取，保证首页即时更新。
const service = require('../../utils/service');
const nav = require('../../utils/nav');

Page({
  data: { active: '在校', list: [], all: [] },
  onLoad() {
    // 开启右上角菜单的「转发给朋友 / 分享到朋友圈 / 复制链接」
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  onShareAppMessage() {
    return { title: '校园猫咪档案馆｜看看校园里的猫', path: '/pages/index/index' };
  },
  onShareTimeline() {
    return { title: '校园猫咪档案馆｜看看校园里的猫' };
  },
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
  // 按当前状态标签过滤
  applyView() {
    this.setData({ list: this.data.all.filter(c => c.lifeStatus === this.data.active) });
  },
  goSearch() {
    nav.go('/pages/search/search');
  },
  goDetail(e) {
    nav.go('/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id);
  }
});
