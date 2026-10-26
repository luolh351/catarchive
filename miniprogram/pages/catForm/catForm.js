// 新增/编辑档案表单：保存走 service.catManage（本地模拟真写入；连云走云函数，服务端校验）
const service = require('../../utils/service');
const COATS = ['橘白', '黑白', '狸花', '白', '其他', '未知'];
const GENDERS = ['公', '母', '未知'];
const STERS = ['已绝育', '未绝育', '未知'];
const LIFES = ['在校', '毕业', '休学', '喵星'];

Page({
  data: {
    id: '',
    form: {
      name: '', aliases: '', coatColor: '', gender: '', sterilizationStatus: '',
      sterilizedAt: '', usualLocations: '', latestNote: '',
      photos: [], voice: '', isAdoptable: false, lifeStatus: '在校'
    }
  },
  onLoad(options) {
    const id = options && options.id;
    if (id) {
      this.setData({ id });
      service.getCat(id).then(res => {
        if (!res.cat) { wx.showToast({ title: '未找到', icon: 'none' }); return; }
        const c = res.cat;
        this.setData({
          form: {
            name: c.name || '', aliases: (c.aliases || []).join('、'), coatColor: c.coatColor || '',
            gender: c.gender || '', sterilizationStatus: c.sterilizationStatus || '', sterilizedAt: c.sterilizedAt || '',
            usualLocations: (c.usualLocations || []).join('、'), latestNote: c.latestNote || '',
            photos: c.photos || [], voice: c.voice || '', isAdoptable: !!c.isAdoptable, lifeStatus: c.lifeStatus || '在校'
          }
        });
      });
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
  save() {
    const f = this.data.form;
    if (!f.name || !f.name.trim()) { wx.showToast({ title: '请填写名字', icon: 'none' }); return; }
    const data = {
      name: f.name.trim(), aliases: f.aliases, coatColor: COATS.includes(f.coatColor) ? f.coatColor : '未知',
      gender: GENDERS.includes(f.gender) ? f.gender : '未知',
      sterilizationStatus: STERS.includes(f.sterilizationStatus) ? f.sterilizationStatus : '未知',
      sterilizedAt: f.sterilizedAt, usualLocations: f.usualLocations,
      latestNote: f.latestNote, photos: f.photos, voice: f.voice,
      isAdoptable: f.isAdoptable, lifeStatus: LIFES.includes(f.lifeStatus) ? f.lifeStatus : '在校'
    };
    wx.showLoading({ title: '保存中' });
    const p = this.data.id
      ? service.catManage('update', Object.assign({ id: this.data.id }, { data }))
      : service.catManage('create', { data });
    p.then(r => {
      wx.hideLoading();
      if (r && r.ok === false) { wx.showToast({ title: r.msg || '保存失败', icon: 'none' }); return; }
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }); });
  },
  cancel() { wx.navigateBack(); }
});
