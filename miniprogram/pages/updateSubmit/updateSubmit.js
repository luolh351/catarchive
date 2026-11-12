// 游客报告近况（先审后显）：无需管理员身份，提交进入待审核，
// 管理员在管理台通过后才写入猫咪时间线公开可见。
const service = require('../../utils/service');
const MAX_PHOTOS = 3;
// 常见场景短语：游客多为路过随手报，点一下即可填入
const QUICK = ['精神良好', '已喂食', '疑似生病', '受伤待救', '发现生崽', '亲人可撸', '暂未见到'];

Page({
  data: {
    catId: '',
    catName: '',
    content: '',
    photos: [],
    saving: false,
    maxPhotos: MAX_PHOTOS,
    occurred: '',   // 发生时间 YYYY-MM-DD，默认今天；补记过去的事时选择
    today: '',
    quick: QUICK
  },
  onLoad(options) {
    const catId = options && options.catId;
    if (!catId) {
      wx.showToast({ title: '缺少猫咪', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({ catId });
    const d = new Date();
    const p = n => (n < 10 ? '0' + n : '' + n);
    const today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    this.setData({ occurred: today, today });
    // 显示猫咪名字（公开信息，加载失败不阻塞提交）
    service.getCat(catId).then(c => {
      if (c && c.name) this.setData({ catName: c.name });
    }).catch(() => {});
  },
  onInput(e) {
    this.setData({ content: (e.detail && e.detail.value) || '' });
  },
  addQuick(e) {
    const t = e.currentTarget.dataset.t;
    const cur = (this.data.content || '').trim();
    if (cur && cur.indexOf(t) >= 0) { wx.showToast({ title: '已添加过', icon: 'none' }); return; }
    const next = (cur ? cur + '，' : '') + t;
    if (next.length > 500) { wx.showToast({ title: '已达 500 字上限', icon: 'none' }); return; }
    this.setData({ content: next });
  },
  chooseImage() {
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) { wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: res => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (paths.length) this.setData({ photos: this.data.photos.concat(paths) });
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
  onDate(e) {
    this.setData({ occurred: e.detail.value || this.data.occurred });
  },
  save() {
    if (this.data.saving) return;   // 防重复提交
    const content = (this.data.content || '').trim();
    if (!content) { wx.showToast({ title: '请填写近况内容', icon: 'none' }); return; }
    this.setData({ saving: true });
    wx.showLoading({ title: '提交中', mask: true });
    service.submitUpdate(this.data.catId, content, this.data.photos, this.data.occurred).then(r => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok === false) {
        wx.showModal({ title: '提交失败', content: r.msg || '请稍后重试', showCancel: false });
        return;
      }
      wx.showModal({
        title: '已提交',
        content: '感谢你为校园猫档案出力！管理员审核通过后会展示在它的时间线里。',
        showCancel: false,
        success: () => wx.navigateBack()
      });
    }).catch(err => {
      wx.hideLoading();
      this.setData({ saving: false });
      const media = err && err.message === 'MEDIA_UPLOAD_FAILED';
      wx.showModal({
        title: '提交失败',
        content: media ? '配图上传失败，请检查网络后重试' : '网络或数据异常，请重试',
        showCancel: false
      });
    });
  },
  cancel() {
    if (this.data.saving) return;
    wx.navigateBack();
  }
});
