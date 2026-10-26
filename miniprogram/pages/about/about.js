// 关于我们（骨架）
Page({
  goSubmit() {
    wx.navigateTo({ url: '/pages/catSubmit/catSubmit' });
  },
  goAdmin() {
    // 后续：先调用 checkAdmin 云函数校验身份；无权限跳 denied 页
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
