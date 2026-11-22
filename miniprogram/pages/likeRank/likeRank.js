// 人气榜：按点赞总数降序展示全部已发布猫咪；点击行进详情页。
// 前三名带奖牌徽章；数据来自 service.likeRank()（云 catLike action=rank / mock 排序）。
const service = require('../../utils/service');
const nav = require('../../utils/nav');

Page({
  data: { list: [], loading: true },
  onShow() { this.load(); },
  load() {
    this.setData({ loading: true });
    service.likeRank().then(r => {
      const list = ((r && r.list) || []).map((c, i) => ({
        id: c.id, name: c.name, photo: c.photo || '', likeCount: c.likeCount || 0,
        initial: (c.name || '·')[0],
        rank: i + 1,
        medal: i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : ''))
      }));
      this.setData({ list, loading: false });
    }).catch(() => {
      this.setData({ list: [], loading: false });
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' });
    });
  },
  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },
  goDetail(e) {
    nav.go('/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id);
  }
});
