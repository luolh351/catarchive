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
    // 姓名/专业/班级/宿舍为必填，申请理由可选
    const required = [['realName', '姓名'], ['major', '专业'], ['className', '班级'], ['dorm', '宿舍']];
    for (let i = 0; i < required.length; i++) {
      const key = required[i][0];
      const label = required[i][1];
      if (!f[key] || !String(f[key]).trim()) { wx.showToast({ title: '请填写' + label, icon: 'none' }); return; }
    }
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
