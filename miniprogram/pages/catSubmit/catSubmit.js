// 游客投稿表单：外观同管理编辑页，但无需管理员身份；提交后进入待审核（管理员采纳才公开）
const service = require('../../utils/service');
const GENDERS = ['公', '母', '未知'];
const STERS = ['已绝育', '未绝育', '未知'];
const LIFES = ['在校', '毕业', '休学', '喵星'];

Page({
  data: {
    form: {
      name: '', aliases: '', coatColor: '', gender: '', sterilizationStatus: '',
      sterilizedAt: '', usualLocations: '', latestNote: '',
      photos: [], voice: '', isAdoptable: false, lifeStatus: '在校'
    }
  },
  onInput(e) {
    const form = this.data.form;
    form[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ form });
  },
  // 自定义毛色：直接写入 form.coatColor，覆盖预设选项
  onCoatInput(e) {
    const form = this.data.form;
    form.coatColor = e.detail.value;
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
  chooseImage() {
    wx.chooseImage({
      count: 9,
      success: res => this.setData({ 'form.photos': this.data.form.photos.concat(res.tempFilePaths) })
    });
  },
  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.form.photos.slice();
    photos.splice(i, 1);
    this.setData({ 'form.photos': photos });
  },
  chooseVoice() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a', 'silk'],
      success: res => this.setData({ 'form.voice': res.tempFiles[0].path }),
      fail: () => {}
    });
  },
  clearVoice() { this.setData({ 'form.voice': '' }); },
  submit() {
    const f = this.data.form;
    if (!f.name || !f.name.trim()) { wx.showToast({ title: '请填写名字', icon: 'none' }); return; }
    const data = {
      name: f.name.trim(), aliases: f.aliases, coatColor: (f.coatColor && f.coatColor.trim()) ? f.coatColor.trim() : '未知',
      gender: GENDERS.includes(f.gender) ? f.gender : '未知',
      sterilizationStatus: STERS.includes(f.sterilizationStatus) ? f.sterilizationStatus : '未知',
      sterilizedAt: f.sterilizedAt, usualLocations: f.usualLocations,
      latestNote: f.latestNote, photos: f.photos, voice: f.voice,
      isAdoptable: f.isAdoptable, lifeStatus: LIFES.includes(f.lifeStatus) ? f.lifeStatus : '在校'
    };
    wx.showLoading({ title: '提交中' });
    service.submitCat(data).then(r => {
      wx.hideLoading();
      if (r && r.ok === false) { wx.showToast({ title: r.msg || '提交失败', icon: 'none' }); return; }
      wx.showToast({ title: '已提交，待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '提交失败', icon: 'none' }); });
  },
  cancel() { wx.navigateBack(); }
});
