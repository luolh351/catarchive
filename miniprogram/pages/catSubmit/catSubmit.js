// 游客投稿表单：外观同管理编辑页，但无需管理员身份；提交后进入待审核（管理员采纳才公开）
const service = require('../../utils/service');
const GENDERS = ['公', '母', '未知'];
const STERS = ['已绝育', '未绝育', '未知'];
const LIFES = ['在校', '毕业', '休学', '喵星'];
const MAX_PHOTOS = 9;
const MAX_NAME = 20;

Page({
  data: {
    voicePlaying: false,
    saving: false,   // 防重复提交
    dirty: false,
    form: {
      name: '', aliases: '', coatColor: '', gender: '', sterilizationStatus: '',
      sterilizedAt: '', usualLocations: '', personalityTags: '', healthNotes: '', latestNote: '',
      photos: [], voice: '', isAdoptable: false, lifeStatus: '在校'
    }
  },
  onUnload() {
    if (this.audio) { this.audio.destroy(); this.audio = null; }
  },
  markDirty() {
    if (this.data.dirty) return;
    this.setData({ dirty: true });
    if (wx.enableAlertBeforeUnload) { try { wx.enableAlertBeforeUnload({ message: '投稿尚未提交，确定离开吗？' }); } catch (e) {} }
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
    // 业务规则：去向不是“在校”时自动取消待领养
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
  // 照片可选填：支持拍照或从相册选，最多 MAX_PHOTOS 张
  chooseImage() {
    const remain = MAX_PHOTOS - this.data.form.photos.length;
    if (remain <= 0) { wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
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
  // 设为封面：移到首位
  setCover(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.form.photos.slice();
    if (i <= 0 || i >= photos.length) return;
    photos.unshift(photos.splice(i, 1)[0]);
    this.setData({ 'form.photos': photos });
    this.markDirty();
    wx.showToast({ title: '已设为封面', icon: 'none' });
  },
  // 音频可选填：从微信聊天记录选音频文件（mp3/wav 等）
  // 叫声仅支持 mp3 / wav
  chooseVoice() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['mp3', 'wav'],
      success: res => {
        const p = res.tempFiles[0].path;
        if (!/\.(mp3|wav)$/i.test(p)) { wx.showToast({ title: '仅支持 mp3 / wav', icon: 'none' }); return; }
        this.setData({ 'form.voice': p });
        this.markDirty();
      },
      fail: () => { wx.showToast({ title: '未选择音频', icon: 'none' }); }
    });
  },
  clearVoice() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null; }
    this.setData({ 'form.voice': '', voicePlaying: false });
    this.markDirty();
  },
  // 投稿前试听已选音频
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
  submit() {
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
    wx.showLoading({ title: '提交中' });
    service.submitCat(data).then(r => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok === false) {
        wx.showModal({ title: '提交失败', content: r.msg || '请稍后重试', showCancel: false });
        return;
      }
      this.clearDirty();
      wx.showToast({ title: '已提交，待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    }).catch(err => {
      wx.hideLoading();
      this.setData({ saving: false });
      const media = err && err.message === 'MEDIA_UPLOAD_FAILED';
      wx.showModal({
        title: '提交失败',
        content: media ? '照片或音频上传失败，投稿未提交，请检查网络后重试' : '网络或数据异常，请重试',
        showCancel: false
      });
    });
  },
  cancel() {
    if (this.data.dirty) {
      wx.showModal({
        title: '放弃投稿', content: '内容尚未提交，确定离开吗？',
        success: res => { if (res.confirm) { this.clearDirty(); wx.navigateBack(); } }
      });
      return;
    }
    wx.navigateBack();
  }
});
