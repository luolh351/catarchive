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
      more: '',      // 「更多」栏目：一整段自由补充资料
      photos: [], voice: '', isAdoptable: false, lifeStatus: '在校', cover: ''   // 独立封面（裁剪版），空=默认第一张照片
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
          more: res.more || '',
          photos: this.safePhotos(c.photos), voice: this.safeVoice(c.voice), isAdoptable: !!c.isAdoptable, lifeStatus: c.lifeStatus || '在校',
          cover: (c.cover && this.mediaOk(c.cover)) ? c.cover : ''
        }
      });
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '加载失败', icon: 'none' }); });
  },
  // 有改动时标记未保存，并开启“离开提醒”
  // 是否是可长期使用的媒体地址：cloud:// 或真实域名；包内 /assets 演示资源也算可用
  mediaOk(p) {
    if (typeof p !== 'string' || !p) return false;
    if (p.indexOf('cloud://') === 0) return true;
    if (p.charAt(0) === '/') return true;               // 包内演示资源
    if (/^https?:\/\/tmp\//i.test(p)) return false;     // 开发者工具临时文件（重启失效）
    if (p.indexOf('wxfile://') === 0) return false;     // 真机临时文件（跨设备失效）
    return /^https?:\/\//.test(p);
  },
  // 历史脏数据（本地临时路径）加载时剔除，否则保存会被云端校验拒绝 / 图片显示不出来
  safePhotos(list) {
    const src = list || [];
    const out = src.filter(p => this.mediaOk(p));
    if (out.length !== src.length) wx.showToast({ title: '已清除失效图片', icon: 'none' });
    return out;
  },
  safeVoice(v) {
    if (!v) return '';
    if (!this.mediaOk(v) || !/\.(mp3|wav|m4a)$/i.test(v)) {
      wx.showToast({ title: '已清除失效的叫声文件', icon: 'none' });
      return '';
    }
    return v;
  },
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
    const form = this.data.form;
    const removed = form.photos[i];
    const photos = form.photos.slice();
    photos.splice(i, 1);
    const patch = { 'form.photos': photos };
    if (form.cover === removed) patch['form.cover'] = '';   // 删除的正是封面图时清空，回退第一张
    this.setData(patch);
    this.markDirty();
  },
  // 点缩略图看大图
  previewPhoto(e) {
    const photos = this.data.form.photos || [];
    if (!photos.length) return;
    wx.previewImage({ urls: photos, current: e.currentTarget.dataset.src });
  },
  // 设为封面：弹出官方裁剪框（wx.editImage，拖框选取区域），
  // 裁剪结果存入独立 cover 字段——照片墙保留原图（一图两份），封面单独用裁剪版。
  // 取消裁剪或基础库不支持时降级为直接用原图作封面（不移动照片顺序）。
  setCover(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.form.photos || [];
    if (i < 0 || i >= photos.length) return;
    const picked = photos[i];
    const done = cover => {
      this.setData({ 'form.cover': cover });
      this.markDirty();
    };
    this.resolveLocal(picked).then(({ path: local, temp }) => {
      // 中间文件清理：仅当封面改用裁剪产物（local 不再被引用）时删除；
      // 取消裁剪时 local 就是封面照片本体，删除会导致保存上传失败
      const cleanup = () => {
        if (!temp) return;
        try { wx.getFileSystemManager().unlink({ filePath: local, fail: () => {} }); } catch (e) {}
      };
      if (typeof wx.editImage !== 'function') {
        // 当前环境不支持框选界面（如开发者工具）：自动按中间区域取用
        done(local);
        wx.showToast({ title: '已按中间区域取封面', icon: 'none' });
        return;
      }
      wx.editImage({
        src: local,
        success: res => {
          const cropped = (res && res.tempFilePath) || local;
          done(cropped);
          if (cropped !== local) cleanup();   // 裁剪成功：下载的中间文件用完即删
          wx.showToast({ title: '已设为封面', icon: 'none' });
        },
        fail: () => {
          // 用户点 × 取消框选：自动按中间区域取用（原图作封面，展示时系统居中裁切）
          done(local);
          wx.showToast({ title: '已按中间区域取封面', icon: 'none' });
        }
      });
    }).catch(() => wx.showToast({ title: '图片读取失败', icon: 'none' }));
  },
  // 把 cloud:// / https 归一化为本地临时路径（wx.editImage 需要可直接读取的图片）。
  // 返回 { path, temp }：temp=true 表示该文件是为裁剪临时下载的，用完应删除
  resolveLocal(p) {
    if (/^cloud:\/\//.test(p) && wx.cloud && wx.cloud.downloadFile) {
      return wx.cloud.downloadFile({ fileID: p }).then(r => ({ path: r.tempFilePath, temp: true }));
    }
    if (/^https?:\/\//.test(p) && !/^https?:\/\/tmp\//i.test(p)) {
      return new Promise((resolve, reject) =>
        wx.downloadFile({ url: p, success: r => resolve({ path: r.tempFilePath, temp: true }), fail: reject }));
    }
    return Promise.resolve({ path: p, temp: false });   // 本地临时路径/真机路径直接可用
  },
  // 叫声仅支持 mp3 / wav / m4a（与 InnerAudioContext 支持的格式一致，也避免把图片等文件当音频存入）
  chooseVoice() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a'],
      success: res => {
        const p = res.tempFiles[0].path;
        if (!/\.(mp3|wav|m4a)$/i.test(p)) { wx.showToast({ title: '仅支持 mp3 / wav / m4a', icon: 'none' }); return; }
        this.setData({ 'form.voice': p });
        this.markDirty();
      },
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
      latestNote: f.latestNote, photos: f.photos, voice: f.voice, cover: f.cover || '',
      more: f.more || '',
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
    }).catch(err => {
      wx.hideLoading();
      this.setData({ saving: false });
      const media = err && err.message === 'MEDIA_UPLOAD_FAILED';
      wx.showModal({
        title: '保存失败',
        content: media ? '照片或音频上传失败，档案未保存，请检查网络后重试' : '网络或数据异常，请重试',
        showCancel: false
      });
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
