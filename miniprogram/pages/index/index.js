// 首页（骨架）：四去向状态 + 卡片列表
// 注：当前用本地模拟数据，后续在云环境就绪后改为 wx.cloud 查询 cats 集合（仅已发布）。
const ALL = [
  { id: 'c1', name: '小橘', status: 'on', isAdoptable: true, bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '猫', sub: '橘白 · 食堂附近' },
  { id: 'c2', name: '煤球', status: 'on', isAdoptable: false, bg: 'linear-gradient(135deg,#5B6470,#2F3640)', photoText: '猫', sub: '黑白 · 操场' },
  { id: 'c3', name: '牛奶', status: 'on', isAdoptable: false, bg: 'linear-gradient(135deg,#E6ECF3,#C3CCD8)', photoText: '猫', sub: '白 · 图书馆' },
  { id: 'c4', name: '大白', status: 'on', isAdoptable: false, bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '猫', sub: '白灰 · 宿舍区' },
  { id: 'c5', name: '小花', status: 'ad', isAdoptable: false, bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '猫', sub: '已领养 · 原宿舍区' },
  { id: 'c6', name: '阿灰', status: 'ad', isAdoptable: false, bg: 'linear-gradient(135deg,#9AA9BB,#5B6470)', photoText: '猫', sub: '已领养 · 原食堂' },
  { id: 'c7', name: '雪球', status: 'mi', isAdoptable: false, bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '猫', sub: '不知所踪 · 3个月无记录' },
  { id: 'c8', name: '老橘', status: 'de', isAdoptable: false, bg: 'linear-gradient(135deg,#B8C0CC,#8C96A3)', photoText: '猫', sub: '已回喵星 · 享年约9岁' }
];

Page({
  data: { active: 'on', list: [] },
  onLoad() { this.applyTab('on'); },
  setTab(e) { this.applyTab(e.currentTarget.dataset.s); },
  applyTab(s) {
    this.setData({ active: s, list: ALL.filter(c => c.status === s) });
  },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id });
  }
});
