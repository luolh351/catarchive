// 关于我们
const service = require('../../utils/service');

Page({
  goSubmit() {
    wx.navigateTo({ url: '/pages/catSubmit/catSubmit' });
  },
  // 入口智能分流：
  //   1) 已是管理员 → 进管理台
  //   2) 系统还没有任何管理员 → 首位使用者初始化为超级管理员（云端仅在 admin_users 无 superadmin 时成功）
  //   3) 已有待审申请 → 提示等待
  //   4) 其余 → 引导填写管理员申请
  // 身份由云端 checkAdmin / initAdmin 判定，前端不掌握 openid，游客无法伪造。
  goAdmin() {
    wx.showLoading({ title: '校验中' });
    service.checkAdmin().then(r => {
      wx.hideLoading();
      if (r && r.isAdmin) { wx.navigateTo({ url: '/pages/admin/admin' }); return; }
      service.initAdmin({}).then(res => {
        if (res && res.ok !== false) {
          wx.showModal({
            title: '初始化成功',
            content: '系统还没有管理员，你已成为首位超级管理员。',
            showCancel: false,
            success: () => wx.navigateTo({ url: '/pages/admin/admin' })
          });
          return;
        }
        this.gotoApplyOrWait();
      }).catch(() => this.gotoApplyOrWait());
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '校验失败', icon: 'none' }); });
  },
  // 已有管理员的情况下：看自己是否申请过，没申请过就引导申请
  gotoApplyOrWait() {
    service.myApplication().then(app => {
      if (app && app.status === 'pending') {
        wx.showModal({ title: '申请审核中', content: '你的管理员申请已提交，请等待超级管理员审核。', showCancel: false, confirmText: '知道了' });
        return;
      }
      wx.showModal({
        title: '还不是管理员', content: '是否提交管理员申请？审核通过后即可进入管理台。',
        confirmText: '填写申请', cancelText: '关闭',
        success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/adminApply/adminApply' }); }
      });
    }).catch(() => wx.showToast({ title: '网络异常', icon: 'none' }));
  }
});
