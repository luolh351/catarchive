// 关于我们
const service = require('../../utils/service');

Page({
  goSubmit() {
    wx.navigateTo({ url: '/pages/catSubmit/catSubmit' });
  },
  // 入口智能分流：已是管理员→进管理台；有待审申请→提示等待；否则→引导填写申请。
  // 身份一律由云端 checkAdmin 判定，前端不掌握 openid，游客无法伪造。
  goAdmin() {
    wx.showLoading({ title: '校验中' });
    service.checkAdmin().then(r => {
      wx.hideLoading();
      if (r && r.isAdmin) { wx.navigateTo({ url: '/pages/admin/admin' }); return; }
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
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '校验失败', icon: 'none' }); });
  }
});
