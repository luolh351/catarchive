// 首页：四状态标签 + 卡片列表。搜索在独立页面 pages/search 进行（返回键自动回首页）。
// 经服务层读取（默认本地模拟，可切云端）。编辑后 onShow 重新拉取，保证首页即时更新。
const service = require('../../utils/service');
const nav = require('../../utils/nav');

Page({
  data: { active: '在校', list: [], all: [], daily: null, rankShow: false, rankTab: 'like', podium: [], rankList: [], likeLeft: 3 },
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
    if (this._loadingCats) return this._loadingCats;
    wx.showLoading({ title: '加载中' });
    this._loadingCats = service.getCats()
      .then(all => {
        this.setData({ all, daily: service.drawRandomCat(all) });
        this.applyView();
        if (this.data.rankShow) this.loadRank(this.data.rankTab);
      })
      .catch(() => {
        this.setData({ all: [], list: [], daily: null, rankList: [] });
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      }).finally(() => {
        this._loadingCats = null;
        wx.hideLoading();
      });
    return this._loadingCats;
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
    this.loadAll();
    // 打开弹窗时顺带刷新今日点赞余额（弹窗底部提示条）
    service.likeStatus('').then(r => {
      if (r && r.ok && typeof r.left === 'number') this.setData({ likeLeft: r.left });
    }).catch(() => {});
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
    const sorted = src.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0));
    const fmt = (c, i) => ({
      id: c.id, name: c.name, photo: c.photo || '', count: c[key] || 0,
      initial: (c.name || '·')[0], rank: i + 1
    });
    // 前三名上领奖台（wxml 按 第2-第1-第3 居中排列）；其余进普通列表
    const podium = [sorted[1], sorted[0], sorted[2]]
      .map((c, idx) => {
        if (!c) return null;
        const place = idx === 1 ? 1 : (idx === 0 ? 2 : 3);   // sorted 下标与名次对应
        const item = fmt(c, place - 1);
        item.place = place;
        return item;
      })
      .filter(Boolean);
    const rest = sorted.slice(3).map((c, i) => fmt(c, i + 3));
    this.setData({ podium, rankList: rest });
  },
  goRankDetail(e) {
    this.setData({ rankShow: false });
    nav.go('/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id);
  }
});
