// 首页：四状态标签 + 卡片列表。搜索在独立页面 pages/search 进行（返回键自动回首页）。
// 经服务层读取（默认本地模拟，可切云端）。编辑后 onShow 重新拉取，保证首页即时更新。
const service = require('../../utils/service');
const nav = require('../../utils/nav');

Page({
  data: { active: '在校', list: [], all: [], daily: null, rankShow: false, rankTab: 'like', rankList: [] },
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
      .then(all => {
        this.setData({ all, daily: service.drawRandomCat(all) });
        this.applyView();
        wx.hideLoading();
      })
      .catch(() => {
        this.setData({ all: [], list: [], daily: null });
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
  },
  // 底部「今天随机认识一只猫咪」卡片 → 今日那只猫的详情
  goDaily() {
    const d = this.data.daily;
    if (d && d.id) nav.go('/pages/catDetail/catDetail?id=' + d.id);
  },
  // ---------- 风云猫子弹窗（点赞榜 ♡ / 人气榜 🔥，仿参考设计） ----------
  // 打开时用全量猫数据按当前 tab 排序；点行进详情
  goRank() {
    this.setData({ rankShow: true });
    this.loadRank(this.data.rankTab);
  },
  closeRank() { this.setData({ rankShow: false }); },
  stop() {},   // 阻止弹层内点击冒泡关闭
  setRankTab(e) {
    const t = e.currentTarget.dataset.t;
    if (t === this.data.rankTab) return;
    this.setData({ rankTab: t });
    this.loadRank(t);
  },
  loadRank(tab) {
    // 数据源：全量已发布猫（likeCount/viewCount 均在档案上），前端排序
    const key = tab === 'hot' ? 'viewCount' : 'likeCount';
    const src = (this.data.all && this.data.all.length) ? this.data.all : [];
    const list = src.slice()
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .map((c, i) => ({
        id: c.id, name: c.name, photo: c.photo || '', count: c[key] || 0,
        initial: (c.name || '·')[0],
        rank: i + 1
      }));
    this.setData({ rankList: list });
    if (!src.length) {
      // 直接进首页弹窗但列表还没加载完的兜底：拉一次全量
      service.getCats().then(all => {
        this.setData({ all });
        this.loadRank(tab);
      }).catch(() => {});
    }
  },
  goRankDetail(e) {
    this.setData({ rankShow: false });
    nav.go('/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id);
  }
});
