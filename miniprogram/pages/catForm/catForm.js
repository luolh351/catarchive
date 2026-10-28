// 新增/编辑档案表单：保存走 service.catManage（本地模拟真写入；连云走云函数，服务端校验）
const service = require('../../utils/service');
const GENDERS = ['公', '母', '未知'];
const STERS = ['已绝育', '未绝育', '未知'];
const LIFES = ['在校', '毕业', '休学', '喵星'];
const MAX_PHOTOS = 9;   // 照片总数上限
const MAX_NAME = 20;    // 名字长度上限（与云端校验一致）

Page({
  data: {
    id: '',
    saving: false,      // 防重复点击
    dirty: false,       // 是否有未保存改动
    voicePlaying: false,
    form: {
      name: '', aliases: '', coatColor: '', gender: '', sterilizationStatus: '',
      sterilizedAt: '', usualLocations: '', personalityTags: '', healthNotes: '', latestNote: '',
      photos: [], voice: '', isAdoptable: false, lifeStatus: '在校'
    }
  },
  onUnload() {
    if (this.audio) { this.audio.destroy(); this.audio = null; }
  },
  onLoad(options) {
    const id = options && options.id;
    this.setData({ id: id || '' });
    // 表单属管理操作：非管理员（含游客）禁止进入，必须从管理台鉴权后进入
    service.checkAdmin().then(r => {
      if (!r || !r.isAdmin) { wx.redirectTo({ url: '/pages/denied/denied' }); return; }
      this.initForm(id);
    }).catch(() => { wx.redirectTo({ url: '/pages/denied/denied' }); });
  },
  initForm(id) {
    if (!id) return;
    wx.showLoading({ title: '加载中' });
    service.getCat(id).then(res => {
      wx.hideLoading();
      if (!res.cat) { wx.showToast({ title: '未找到', icon: 'none' }); return; }
      const c = res.cat;
      this.setData({
        form: {
          name: c.name || '', aliases: (c.aliases || []).join('、'), coatColor: c.coatColor || '',
          gender: c.gender || '', sterilizationStatus: c.sterilizationStatus || '', sterilizedAt: c.sterilizedAt || '',
          usualLocations: (c.usualLocations || []).join('、'),
          personalityTags: (c.personalityTags || []).join('、'), healthNotes: c.healthNotes || '',
          latestNote: c.latestNote || '',
          photos: c.photos || [], voice: c.voice || '', isAdoptable: !!c.isAdoptable, lifeStatus: c.lifeStatus || '在校'
        }
      });
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '加载失败', icon: 'none' }); });
  },
  // 有改动时标记未保存，并开启“离开提醒”
  markDirty() {
    if (this.data.dirty) return;
    this.setData({ dirty: true });
    if (wx.enableAlertBeforeUnload) { try { wx.enableAlertBeforeUnload({ message: '资料尚未保存，确定离开吗？' }); } catch (e) {} }
  },
  clearDirty() {
    this.setData({ dirty: false });
    if (wx.disableAlertBeforeUnload) { try { wx.disableAlertBeforeUnload(); } catch (e) {} }
  },
  onInput(e) {
    const form = this.data.form;
    form[e.currentTarget.dataset.field] = e.detail.value;
    this.setData({ form });
    this.markDirty();
  },
  // 自定义毛色：直接写入 form.coatColor，覆盖预设选项
  onCoatInput(e) {
    const form = this.data.form;
    form.coatColor = e.detail.value;
    this.setData({ form });
    this.markDirty();
  },
  selectOpt(e) {
    const form = this.data.form;
    const group = e.currentTarget.dataset.group;
    const val = e.currentTarget.dataset.val;
    form[group] = val;
    // 业务规则：去向不是“在校”时，自动取消待领养
    if (group === 'lifeStatus' && val !== '在校' && form.isAdoptable) {
      form.isAdoptable = false;
      wx.showToast({ title: '非在校已取消待领养', icon: 'none' });
    }
    this.setData({ form });
    this.markDirty();
  },
  toggleSwitch() {
    const form = this.data.form;
    if (!form.isAdoptable && form.lifeStatus !== '在校') {
      wx.showToast({ title: '仅“在校”可标记待领养', icon: 'none' });
      return;
    }
    form.isAdoptable = !form.isAdoptable;
    this.setData({ form });
    this.markDirty();
  },
  // 照片：支持拍照/相册，最多 MAX_PHOTOS 张
  chooseImage() {
    const remain = MAX_PHOTOS - this.data.form.photos.length;
    if (remain <= 0) { wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: res => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        this.setData({ 'form.photos': this.data.form.photos.concat(paths) });
        this.markDirty();
      },
      fail: () => {}
    });
  },
  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.form.photos.slice();
    photos.splice(i, 1);
    this.setData({ 'form.photos': photos });
    this.markDirty();
  },
  // 点缩略图看大图
  previewPhoto(e) {
    const photos = this.data.form.photos || [];
    if (!photos.length) return;
    wx.previewImage({ urls: photos, current: e.currentTarget.dataset.src });
  },
  // 设为封面：移到首位（列表首图即详情页大图与首页封面）
  setCover(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.form.photos.slice();
    if (i <= 0 || i >= photos.length) return;
    const picked = photos.splice(i, 1)[0];
    photos.unshift(picked);
    this.setData({ 'form.photos': photos });
    this.markDirty();
    wx.showToast({ title: '已设为封面', icon: 'none' });
  },
  chooseVoice() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a', 'silk'],
      success: res => { this.setData({ 'form.voice': res.tempFiles[0].path }); this.markDirty(); },
      fail: () => wx.showToast({ title: '未选择音频', icon: 'none' })
    });
  },
  clearVoice() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null; }
    this.setData({ 'form.voice': '', voicePlaying: false });
    this.markDirty();
  },
  previewVoice() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null; }
    if (this.data.voicePlaying) { this.setData({ voicePlaying: false }); return; }
    const a = wx.createInnerAudioContext();
    a.src = this.data.form.voice;
    a.onEnded(() => this.setData({ voicePlaying: false }));
    a.onStop(() => this.setData({ voicePlaying: false }));
    a.onError(() => { this.setData({ voicePlaying: false }); wx.showToast({ title: '播放失败', icon: 'none' }); });
    a.play();
    this.setData({ voicePlaying: true });
    this.audio = a;
  },
  save() {
    if (this.data.saving) return; // 防重复点击
    const f = this.data.form;
    const name = (f.name || '').trim();
    if (!name) { wx.showToast({ title: '请填写名字', icon: 'none' }); return; }
    if (name.length > MAX_NAME) { wx.showToast({ title: '名字不超过 ' + MAX_NAME + ' 字', icon: 'none' }); return; }
    const data = {
      name, aliases: f.aliases, coatColor: (f.coatColor && f.coatColor.trim()) ? f.coatColor.trim() : '未知',
      gender: GENDERS.includes(f.gender) ? f.gender : '未知',
      sterilizationStatus: STERS.includes(f.sterilizationStatus) ? f.sterilizationStatus : '未知',
      sterilizedAt: f.sterilizedAt, usualLocations: f.usualLocations,
      personalityTags: f.personalityTags, healthNotes: f.healthNotes,
      latestNote: f.latestNote, photos: f.photos, voice: f.voice,
      isAdoptable: !!f.isAdoptable && f.lifeStatus === '在校',
      lifeStatus: LIFES.includes(f.lifeStatus) ? f.lifeStatus : '在校'
    };
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    const p = this.data.id
      ? service.catManage('update', Object.assign({ id: this.data.id }, { data }))
      : service.catManage('create', { data });
    p.then(r => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok === false) {
        wx.showModal({ title: '保存失败', content: r.msg || '请稍后重试', showCancel: false });
        return;
      }
      this.clearDirty();
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    }).catch(() => {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showModal({ title: '保存失败', content: '网络或数据异常，请重试', showCancel: false });
    });
  },
  cancel() {
    if (this.data.dirty) {
      wx.showModal({
        title: '放弃修改', content: '有未保存的改动，确定离开吗？',
        success: res => { if (res.confirm) { this.clearDirty(); wx.navigateBack(); } }
      });
      return;
    }
    wx.navigateBack();
  }
});
