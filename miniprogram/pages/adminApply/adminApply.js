// 管理员申请页（公开）：游客填写资料申请成为管理员，云端自动取本人 openid，无需手抄
const service = require('../../utils/service');

Page({
  data: {
    form: { realName: '', major: '', className: '', dorm: '', note: '' }
  },
  onInput(e) {
    const form = this.data.form;
    form[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ form });
  },
  submit() {
    const f = this.data.form;
    if (!f.realName || !f.realName.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    wx.showLoading({ title: '提交中' });
    service.applyAdmin({
      realName: f.realName.trim(), major: f.major.trim(), className: f.className.trim(),
      dorm: f.dorm.trim(), note: f.note.trim()
    }).then(r => {
      wx.hideLoading();
      if (r && r.ok === false) { wx.showToast({ title: r.msg || '提交失败', icon: 'none' }); return; }
      wx.showToast({ title: '已提交，待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '提交失败', icon: 'none' }); });
  },
  cancel() { wx.navigateBack(); }
});
