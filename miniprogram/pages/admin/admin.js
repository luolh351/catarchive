// 管理工作台（骨架）：概览与列表均来自服务层（当前本地模拟），接云后改为云端聚合
const service = require('../../utils/service');

Page({
  data: {
    stats: { 在校: 0, 毕业: 0, 休学: 0, 喵星: 0, 待领养: 0 },
    cats: [],
    admins: [
      { openid: 'o1', realName: '张三', roleText: '超级管理员', major: '计算机', className: '计科1班', dorm: '3栋', canTransfer: false, canRemove: false },
      { openid: 'o2', realName: '李四', roleText: '管理员', major: '生科', className: '生科2班', dorm: '5栋', canTransfer: true, canRemove: true }
    ]
  },
  onLoad() {
    service.getCats('').then(list => {
      const s = { 在校: 0, 毕业: 0, 休学: 0, 喵星: 0, 待领养: 0 };
      const cats = list.map(c => {
        if (s[c.lifeStatus] !== undefined) s[c.lifeStatus]++;
        if (c.isAdoptable) s.待领养++;
        return { id: c.id, name: c.name, s: c.lifeStatus + (c.isAdoptable ? ' · 待领养' : '') };
      });
      this.setData({ stats: s, cats });
    });
  },
  goForm(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/catForm/catForm' + (id ? '?id=' + id : '') });
  },
  archive() { wx.showToast({ title: '骨架演示：归档待接云函数', icon: 'none' }); },
  transfer() { wx.showToast({ title: '骨架演示：转让待接云函数', icon: 'none' }); },
  remove() { wx.showToast({ title: '骨架演示：撤权待接云函数', icon: 'none' }); }
});
