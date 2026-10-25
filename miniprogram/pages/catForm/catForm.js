// 新增/编辑档案表单（骨架）
// 后续：保存时调用 catCreate / catUpdate 云函数（服务端校验角色、必填、枚举、长度、内容安全）。
Page({
  data: {
    form: {
      name: '', aliases: '', coatColor: '', gender: '', sterilizationStatus: '',
      sterilizedAt: '', usualLocations: '', latestNote: '',
      isAdoptable: false, lifeStatus: '在校'
    }
  },
  onInput(e) {
    const form = this.data.form;
    form[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ form });
  },
  selectOpt(e) {
    const form = this.data.form;
    form[e.currentTarget.dataset.group] = e.currentTarget.dataset.val;
    this.setData({ form });
  },
  toggleSwitch() {
    const form = this.data.form;
    form.isAdoptable = !form.isAdoptable;
    this.setData({ form });
  },
  save() {
    if (!this.data.form.name) {
      wx.showToast({ title: '请填写名字', icon: 'none' });
      return;
    }
    wx.showToast({ title: '骨架演示：保存待接云函数', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 800);
  },
  cancel() { wx.navigateBack(); }
});
