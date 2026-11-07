// 搜索页：独立页面，手机返回键/手势自动回首页（navigateTo 返回栈），
// 页内另有「取消」按钮兜底。数据来自 service.getCats() 全量，本地过滤。
const service = require('../../utils/service');
const nav = require('../../utils/nav');

Page({
  data: { q: '', list: [], searched: false },
  onLoad() {
    service.getCats().then(all => {
      this.all = all || [];
      this.run();   // 若用户极快输入，数据到位后补一次过滤
    }).catch(() => { this.all = []; });
  },
  onInput(e) {
    this.setData({ q: (e.detail && e.detail.value) || '' });
    this.run();
  },
  // 命中任一字段即算匹配：名字、昵称、毛色、常出没（全部）、最近情况、副标题
  run() {
    const q = (this.data.q || '').trim().toLowerCase();
    if (!q) { this.setData({ list: [], searched: false }); return; }
    const hit = v => (v || '').toLowerCase().indexOf(q) >= 0;
    const list = this.all.filter(c =>
      hit(c.name) || hit(c.aliasesText) || hit(c.coatColor) ||
      hit(c.locationsText) || hit(c.latestNote) || hit(c.sub)
    );
    this.setData({ list, searched: true });
  },
  goBack() {
    // 正常从首页进入有返回栈；直接扫码进入等场景回退到首页
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
  goDetail(e) {
    nav.go('/pages/catDetail/catDetail?id=' + e.currentTarget.dataset.id);
  }
});
