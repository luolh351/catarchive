// 补充近况：正文 + 配图。管理台点「近况」进入，保存后写入时间线
const service = require('../../utils/service');
const MAX_PHOTOS = 3;
// 常用近况短语：管理台补记录时多为重复场景，点一下即可填入
const QUICK = ['精神良好', '已喂食', '疑似生病', '受伤待救', '发现生崽', '亲人可撸', '暂未见到'];

Page({
  data: {
    catId: '',
    content: '',
    photos: [],
    saving: false,
    dirty: false,
    ready: false,
    maxPhotos: MAX_PHOTOS,
    quick: QUICK,
    occurred: '',   // 发生时间 YYYY-MM-DD，默认今天；补记过去的事时选择
    today: ''
  },
  onLoad(options) {
    const catId = options && options.catId;
    if (!catId) {
      wx.showToast({ title: '缺少猫咪', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({ catId });
    // 发生时间默认今天，不允许选未来
    const d = new Date();
    const p = n => (n < 10 ? '0' + n : '' + n);
    const today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    this.setData({ occurred: today, today });
    service.checkAdmin().then(r => {
      if (!r || !r.isAdmin) { wx.redirectTo({ url: '/pages/denied/denied' }); return; }
      this.setData({ ready: true });
    }).catch(() => { wx.showToast({ title: '身份校验失败，请重新进入', icon: 'none' }); });
  },
  // 从子页面（历史近况管理）返回：返回动作已完成，此时恢复保护，避免误弹
  onShow() {
    if (!this._alertPaused) return;
    this._alertPaused = false;
    if (this.data.dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '近况尚未保存，确定离开吗？' });
  },
  // 打开子页面前临时挂起未保存离开保护
  pauseLeaveAlert() {
    this._alertPaused = true;
    if (wx.disableAlertBeforeUnload) { try { wx.disableAlertBeforeUnload(); } catch (e) {} }
  },
  markDirty() {
    if (this.data.dirty) return;
    this.setData({ dirty: true });
    if (this._alertPaused) return;   // 返回途中不重新启用，交给 onShow
    if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '近况尚未保存，确定离开吗？' });
  },
  clearDirty() {
    this.setData({ dirty: false });
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
  },
  onInput(e) {
    this.setData({ content: (e.detail && e.detail.value) || '' });
    this.markDirty();
  },
  // 追加快捷短语到正文末尾（重复添加会提示，避免误触堆成一串）
  addQuick(e) {
    const t = e.currentTarget.dataset.t;
    const cur = this.data.content || '';
    const trimmed = cur.trim();
    if (trimmed && trimmed.indexOf(t) >= 0) { wx.showToast({ title: '已添加过', icon: 'none' }); return; }
    const next = (trimmed ? trimmed + '，' : '') + t;
    if (next.length > 500) { wx.showToast({ title: '已达 500 字上限', icon: 'none' }); return; }
    this.setData({ content: next });
    this.markDirty();
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
        this.markDirty();
      },
      fail: () => {}
    });
  },
  removeImage(e) {
    const i = e.currentTarget.dataset.i;
    const list = this.data.photos.slice();
    list.splice(i, 1);
    this.setData({ photos: list });
    this.markDirty();
  },
  previewPhoto(e) {
    const list = this.data.photos || [];
    if (!list.length) return;
    wx.previewImage({ urls: list, current: e.currentTarget.dataset.src });
  },
  // 选择发生日期
  onDate(e) {
    this.setData({ occurred: e.detail.value || this.data.occurred });
    this.markDirty();
  },
  save() {
    if (this.data.saving) return; // 防重复提交
    if (!this.data.ready) { wx.showToast({ title: '请先完成身份校验', icon: 'none' }); return; }
    const content = (this.data.content || '').trim();
    if (!content) { wx.showToast({ title: '请填写近况内容', icon: 'none' }); return; }
    this.setData({ saving: true });
    wx.showLoading({ title: '提交中' });
    service.addUpdate(this.data.catId, content, this.data.photos, this.data.occurred).then(r => {
      wx.hideLoading();
      this.setData({ saving: false });
      if (r && r.ok === false) {
        wx.showModal({ title: '提交失败', content: r.msg || '请稍后重试', showCancel: false });
        return;
      }
      wx.showToast({ title: '已补充', icon: 'success' });
      this.clearDirty();
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
  // 进入历史近况管理：查看/修改/删除已有时间线条目
  goHistory() {
    if (this._jumping) return;
    this._jumping = true;
    // 挂起未保存保护：否则从历史页返回时会被误判为离开本页而弹窗
    this.pauseLeaveAlert();
    wx.navigateTo({
      url: '/pages/updatesManage/updatesManage?catId=' + this.data.catId,
      success: () => setTimeout(() => { this._jumping = false; }, 400),
      fail: () => {
        this._jumping = false;
        this._alertPaused = false;
        if (this.data.dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '近况尚未保存，确定离开吗？' });
        wx.showToast({ title: '打开失败，请重试', icon: 'none' });
      }
    });
  },
  cancel() {
    if (this.data.saving) return;
    if (this.data.dirty) {
      wx.showModal({ title: '放弃修改', content: '近况尚未保存，确定离开吗？', success: r => {
        if (r.confirm) { this.clearDirty(); wx.navigateBack(); }
      } });
      return;
    }
    wx.navigateBack();
  }
});
