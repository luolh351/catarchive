// 管理工作台（骨架）
// 后续：进入本页前先调用 checkAdmin 校验角色；编辑/归档/管理员管理均走云函数服务端校验。
Page({
  data: {
    cats: [
      { id: 'c1', name: '小橘', s: '在校 · 待领养' },
      { id: 'c2', name: '煤球', s: '在校' }
    ],
    admins: [
      { openid: 'o1', realName: '张三', roleText: '超级管理员', major: '计算机', className: '计科1班', dorm: '3栋', canTransfer: false, canRemove: false },
      { openid: 'o2', realName: '李四', roleText: '管理员', major: '生科', className: '生科2班', dorm: '5栋', canTransfer: true, canRemove: true }
    ]
  },
  goForm(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/catForm/catForm' + (id ? '?id=' + id : '') });
  },
  archive() { wx.showToast({ title: '骨架演示：归档待接云函数', icon: 'none' }); },
  transfer() { wx.showToast({ title: '骨架演示：转让待接云函数', icon: 'none' }); },
  remove() { wx.showToast({ title: '骨架演示：撤权待接云函数', icon: 'none' }); }
});
