// 补充近况：正文 + 配图。管理台点「近况」进入，保存后写入时间线
const service = require('../../utils/service');
const MAX_PHOTOS = 3;

Page({
  data: {
    catId: '',
    content: '',
    photos: [],
    saving: false,
    maxPhotos: MAX_PHOTOS
  },
  onLoad(options) {
    const catId = options && options.catId;
    if (!catId) {
      wx.showToast({ title: '缺少猫咪', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({ catId });
  },
  onInput(e) {
    this.setData({ content: (e.detail && e.detail.value) || '' });
  },
  chooseImage() {
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) { wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: res => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        this.setData({ photos: this.data.photos.concat(paths) });
      },
      fail: () => {}
    });
  },
  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const list = this.data.photos.slice();
    list.splice(i, 1);
    this.setData({ photos: list });
  },
  previewPhoto(e) {
    const list = this.data.photos || [];
    if (!list.length) return;
    wx.previewImage({ urls: list, current: e.currentTarget.dataset.src });
  },
  save() {
    if (this.data.saving) return; // 防重复提交
    const content = (this.data.content || '').trim();
    if (!content) { wx.showToast({ title: '请填写近况内容', icon: 'none' }); return; }
    this.setData({ saving: true });
    wx.showLoading({ title: '提交中' });
    service.addUpdate(this.data.catId, content, this.data.photos).then(r => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok === false) {
        wx.showModal({ title: '提交失败', content: r.msg || '请稍后重试', showCancel: false });
        return;
      }
      wx.showToast({ title: '已补充', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    }).catch(err => {
      wx.hideLoading();
      this.setData({ saving: false });
      const media = err && err.message === 'MEDIA_UPLOAD_FAILED';
      wx.showModal({
        title: '提交失败',
        content: media ? '配图上传失败，近况未保存，请检查网络后重试' : '网络或数据异常，请重试',
        showCancel: false
      });
    });
  },
  cancel() {
    wx.navigateBack();
  }
});
