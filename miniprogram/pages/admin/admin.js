// 管理工作台：进入即校验身份（非管理员跳 denied）；概览/列表来自服务层；操作接 service 真实执行
const service = require('../../utils/service');
const audioFile = require('../../utils/audio-file');

Page({
  data: {
    // 统计键用 ASCII，避免 WXML 表达式解析器不支持“点+中文属性名”
    stats: { zaixiao: 0, dailingyang: 0, biye: 0, xiuxue: 0, miaoxing: 0 },
    cats: [],
    admins: [],
    subs: [],
    apps: [],
    detail: null,
    subPlaying: false,
    myRole: '',
    noEditor: false,
    ready: false
  },
  onUnload() {
    if (this.subAudio) { this.subAudio.destroy(); this.subAudio = null; }
  },
  onLoad() {
    // 诊断用：页面栈上限 10 层，达到上限后 navigateTo 会失败（历史“编辑点不开”的常见原因）
    console.log('[admin] 页面栈层数:', (typeof getCurrentPages === 'function' ? getCurrentPages().length : -1));
    service.checkAdmin().then(r => {
      if (!r.isAdmin) { wx.redirectTo({ url: '/pages/denied/denied' }); return; }
      this.setData({ myRole: r.role, ready: true });
      this.loadData();
    }).catch(() => { wx.redirectTo({ url: '/pages/denied/denied' }); });
  },
  // 从编辑/新增页返回时刷新，保证名字/毛色等修改即时可见（修复“保存无反应”的错觉）
  // 同时重置跳转锁：若上次跳转的释放定时器因页面卸载/热重载没跑完，锁会残留 true，
  // 之后所有点击都会被 if (this._jumping) return 静默吞掉（表现为“按钮点了没反应，刷新后就好”）
  onShow() {
    this._jumping = false;
    if (this.data.ready) this.loadData();
  },
  loadData() {
    service.getCats('').then(list => {
      const s = { zaixiao: 0, dailingyang: 0, biye: 0, xiuxue: 0, miaoxing: 0 };
      const map = { '在校': 'zaixiao', '毕业': 'biye', '休学': 'xiuxue', '喵星': 'miaoxing' };
      const cats = list.map(c => {
        if (map[c.lifeStatus]) s[map[c.lifeStatus]]++;
        if (c.isAdoptable) s.dailingyang++;
        return { id: c.id, name: c.name, s: c.lifeStatus + (c.isAdoptable ? ' · 待领养' : ''), latest: c.latestNote || '' };
      });
      this.setData({ stats: s, cats });
    });
    service.listSubmissions().then(list => this.setData({ subs: list || [] }));
    service.listApplications().then(list => this.setData({ apps: list || [] }));
    service.listAdmins().then(r => {
      const me = this.data.myRole;
      const admins = (r.list || []).map(a => ({
        openid: a.openid, realName: a.realName, role: a.role,
        roleText: a.role === 'superadmin' ? '超级管理员' : '管理员',
        major: a.major, className: a.className, dorm: a.dorm,
        canTransfer: me === 'superadmin' && a.role === 'editor',
        canRemove: me === 'superadmin' && a.role === 'editor'
      }));
      // 修复：映射里曾丢失 role，导致 noEditor 恒为 true、提示一直显示
      this.setData({ admins, noEditor: admins.filter(a => a.role === 'editor').length === 0 });
    });
  },
  goForm(e) {
    const id = e.currentTarget.dataset.id;
    const url = '/pages/catForm/catForm' + (id ? '?id=' + id : '');
    // 防重入：跳转动画未结束时重复点击会被微信丢弃（表现为“点了没反应”）
    if (this._jumping) return;
    this._jumping = true;
    const release = () => setTimeout(() => { this._jumping = false; }, 400);
    wx.navigateTo({
      url,
      success: release,
      fail: err => {
        const msg = (err && err.errMsg) || '';
        console.warn('[nav] 打开表单失败:', msg, url);
        // 页面栈已满（最多 10 层）时静默失败，降级为 redirectTo
        if (msg.indexOf('page limit') >= 0) {
          wx.redirectTo({ url, complete: () => { this._jumping = false; } });
          return;
        }
        this._jumping = false;
        wx.showToast({ title: '打开失败：' + (msg || '未知原因'), icon: 'none' });
      }
    });
  },
  archive(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '归档', content: '确定归档该猫咪？公开页将不再展示。',
      success: res => { if (res.confirm) service.catManage('archive', { id }).then(() => this.loadData()); }
    });
  },
  addUpdate(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '补充近况', editable: true, placeholderText: '输入本次近况',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          wx.showLoading({ title: '提交中' });
          service.addUpdate(id, res.content.trim()).then(r => {
            wx.hideLoading();
            if (r && r.ok === false) { wx.showToast({ title: r.msg || '失败', icon: 'none' }); return; }
            wx.showToast({ title: '已补充', icon: 'success' });
            this.loadData();
          }).catch(() => { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); });
        }
      }
    });
  },
  // 转让后当前用户变为普通管理员，重新拉取身份再刷新列表（修复转让后权限/界面未更新的问题）
  transfer(e) {
    const openid = e.currentTarget.dataset.id;
    wx.showModal({
      title: '转让超级管理员', content: '确定转让给该用户？你将变为普通管理员，且不能再转让/撤权。',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        service.adminManage('transfer', { openid }).then(r => {
          wx.hideLoading();
          if (r && r.ok === false) { wx.showToast({ title: r.msg || '操作失败', icon: 'none' }); return; }
          wx.showToast({ title: '已转让，你已变为普通管理员', icon: 'none' });
          this.refreshRole();
        }).catch(() => { wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' }); });
      }
    });
  },
  remove(e) {
    const openid = e.currentTarget.dataset.id;
    wx.showModal({
      title: '撤权', content: '确定移除该管理员？',
      success: res => { if (res.confirm) service.adminManage('remove', { openid }).then(() => this.refreshRole()); }
    });
  },
  // 管理操作（转让/撤权/新增）后刷新当前身份与列表
  refreshRole() {
    service.checkAdmin().then(r => {
      if (r && r.isAdmin) this.setData({ myRole: r.role });
      this.loadData();
    }).catch(() => this.loadData());
  },
  // 待认领申请：通过后该用户直接成为管理员（无需手抄 openid）
  approveApp(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '通过申请', content: '通过后该用户将成为管理员（普通），可编辑档案与处理投稿。',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        service.approveApplication(id).then(r => {
          wx.hideLoading();
          if (r && r.ok === false) { wx.showToast({ title: r.msg || '失败', icon: 'none' }); return; }
          wx.showToast({ title: '已通过', icon: 'success' });
          this.loadData();
        }).catch(() => { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); });
      }
    });
  },
  rejectApp(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '忽略申请', content: '确定忽略该申请？',
      success: res => { if (res.confirm) service.rejectApplication(id).then(() => this.loadData()); }
    });
  },
  addAdmin() {
    wx.showModal({
      title: '新增管理员', editable: true, placeholderText: '输入对方微信 openid',
      success: res => {
        if (res.confirm && res.content) {
          service.adminManage('add', { openid: res.content, realName: res.content }).then(r => {
            if (r && r.ok === false) { wx.showToast({ title: r.msg || '操作失败', icon: 'none' }); return; }
            this.refreshRole();
          });
        }
      }
    });
  },
  // 查看：从已加载的 subs 中取完整字段，格式化后弹出详情
  viewSub(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.subs.find(x => x.id === id);
    if (!s) return;
    const arr2str = a => (Array.isArray(a) ? a.join('、') : (a || ''));
    const createdAtText = (typeof s.createdAt === 'number')
      ? new Date(s.createdAt).toLocaleString()
      : (s.createdAt ? String(s.createdAt) : '—');
    this.setData({
      detail: {
        id: s.id, name: s.name, aliasesText: arr2str(s.aliases) || '—', coatColor: s.coatColor || '—',
        gender: s.gender || '—', sterilizationStatus: s.sterilizationStatus || '—', sterilizedAt: s.sterilizedAt || '',
        usualText: arr2str(s.usualLocations) || '—', latestNote: s.latestNote || '—', healthNotes: s.healthNotes || '—',
        personalityText: arr2str(s.personalityTags) || '—',
        isAdoptable: !!s.isAdoptable, lifeStatus: s.lifeStatus || '—',
        photos: Array.isArray(s.photos) ? s.photos : [], voice: s.voice || '',
        submitter: s.submitterOpenid || '游客投稿', createdAtText
      }
    });
  },
  closeSub() {
    if (this.subAudio) { this.subAudio.stop(); this.subAudio.destroy(); this.subAudio = null; }
    this.setData({ detail: null, subPlaying: false });
  },
  stop() {},
  // 投稿详情：点缩略图全屏预览照片
  previewSubPhoto(e) {
    const photos = this.data.detail.photos || [];
    if (!photos.length) return;
    wx.previewImage({ urls: photos, current: e.currentTarget.dataset.src });
  },
  // 投稿详情：试听投稿音频
  playSubVoice() {
    if (this.subAudio) { this.subAudio.stop(); this.subAudio.destroy(); this.subAudio = null; }
    if (this.data.subPlaying) { this.setData({ subPlaying: false }); return; }
    const a = wx.createInnerAudioContext();
    a.src = this.data.detail.voice;
    a.onEnded(() => this.setData({ subPlaying: false }));
    a.onStop(() => this.setData({ subPlaying: false }));
    a.onError(() => { this.setData({ subPlaying: false }); wx.showToast({ title: '播放失败', icon: 'none' }); });
    a.play();
    this.setData({ subPlaying: true });
    this.subAudio = a;
  },
  copySub(e) {
    const text = e.currentTarget.dataset.copy;
    if (!text || text === '—') { wx.showToast({ title: '无可复制内容', icon: 'none' }); return; }
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },
  // 将路径转为本地临时文件：支持 cloud://（云存储 fileID）、http(s) 网络地址、本地路径
  resolveLocal(path) {
    return new Promise((resolve, reject) => {
      if (!path) return reject();
      if (path.indexOf('cloud://') === 0) {
        wx.cloud.downloadFile({ fileID: path }).then(r => resolve(r.tempFilePath)).catch(reject);
        return;
      }
      if (/^https?:\/\//.test(path)) {
        wx.downloadFile({ url: path }).then(r => {
          if (r.statusCode === 200) resolve(r.tempFilePath); else reject();
        }).catch(reject);
        return;
      }
      resolve(path); // 本地临时路径或包内文件路径
    });
  },
  // 保存文件到本地：多渠道依次降级——真机相册 / PC(开发者工具)存盘 / 转发到微信会话
  saveToLocal(localPath, isImage) {
    return new Promise(resolve => {
      const ways = isImage ? ['album', 'disk', 'chat'] : ['disk', 'chat'];
      const has = name => (wx.canIUse ? wx.canIUse(name) : !!wx[name]);
      let i = 0;
      const attempt = () => {
        if (i >= ways.length) { resolve({ ok: false, way: '' }); return; }
        const way = ways[i++];
        if (way === 'album') {
          if (!has('saveImageToPhotosAlbum')) { attempt(); return; }
          wx.saveImageToPhotosAlbum({ filePath: localPath, success: () => resolve({ ok: true, way: '相册' }), fail: attempt });
        } else if (way === 'disk') {
          if (!has('saveFileToDisk')) { attempt(); return; }
          wx.saveFileToDisk({ filePath: localPath, success: () => resolve({ ok: true, way: '本地磁盘' }), fail: attempt });
        } else {
          if (!has('shareFileMessage')) { attempt(); return; }
          wx.shareFileMessage({ filePath: localPath, success: () => resolve({ ok: true, way: '微信会话' }), fail: attempt });
        }
      };
      attempt();
    });
  },
  // 全部渠道失败时，按环境给出准确原因（开发者工具本身不支持保存 API）
  saveFailTip(isImage) {
    let env = '';
    try {
      // wx.getSystemInfoSync 已废弃（控制台会报 deprecated），改用 wx.getDeviceInfo
      const d = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
      env = (d || {}).platform || '';
    } catch (e) { env = ''; }
    if (env === 'devtools') {
      wx.showModal({
        title: '当前环境不支持保存',
        content: '微信开发者工具（模拟器）不支持直接保存文件到相册/磁盘。请用工具栏「预览」在手机端，或在 PC 微信客户端打开后再试。',
        showCancel: false, confirmText: '知道了'
      });
      return;
    }
    wx.showModal({
      title: isImage ? '无法保存照片' : '无法保存音频',
      content: isImage ? '可能未授权「保存到相册」。可在小程序设置中开启权限后重试。' : '请在手机端确认已允许小程序保存/转发文件。',
      confirmText: '去设置', cancelText: '关闭',
      success: res => { if (res.confirm) wx.openSetting({}); }
    });
  },
  // 投稿照片：多张依次保存，每张走多渠道降级
  saveSubPhotos() {
    const photos = this.data.detail.photos || [];
    if (!photos.length) return;
    wx.showLoading({ title: '保存中' });
    let chain = Promise.resolve();
    let ok = 0, fail = 0, way = '';
    photos.forEach(p => {
      chain = chain.then(() => this.resolveLocal(p)
        .then(local => this.saveToLocal(local, true).then(r => { if (r.ok) { ok++; way = r.way; } else fail++; }))
        .catch(() => { fail++; }));
    });
    chain.then(() => {
      wx.hideLoading();
      if (ok && !fail) wx.showToast({ title: '已保存到' + way, icon: 'success' });
      else if (ok) wx.showToast({ title: ok + '张成功，' + fail + '张失败', icon: 'none' });
      else this.saveFailTip(true);
    });
  },
  // 投稿音频：转发给微信好友。
  // wx.shareFileMessage 只接受本地文件路径，cloud:// 需先下载为临时文件；
  // 该接口在开发者工具模拟器上不可用，需真机预览。
  shareSubVoice() { return this.handleVoiceFile('share'); },
  downloadSubVoice() { return this.handleVoiceFile('save'); },
  async handleVoiceFile(action) {
    const detail = this.data.detail;
    if (!detail || !detail.voice || this.voiceFileBusy) return;
    this.voiceFileBusy = true;
    let file;
    try {
      wx.showLoading({ title: '准备音频', mask: true });
      // 同一文件重试时复用，避免重复下载、堆积本地文件。
      const cached = this.voiceFileCache;
      if (cached && cached.source === detail.voice && cached.name === detail.name) {
        try {
          await audioFile.invoke(wx.getFileSystemManager(), 'access', { path: cached.file.path });
          file = cached.file;
        } catch (e) { /* 文件被系统清理后重新准备 */ }
      }
      if (!file) {
        file = await audioFile.prepare(wx, detail.voice, detail.name);
        this.voiceFileCache = { source: detail.voice, name: detail.name, file };
      }
      wx.hideLoading();
      if (action === 'save') { await this.saveVoiceFile(file); return; }
      try {
        await audioFile.invoke(wx, 'shareFileMessage', { filePath: file.path, fileName: file.fileName });
      } catch (e) {
        if (audioFile.isCancelled(e)) return;
        console.warn('[audio] share failed', e);
        const result = await audioFile.invoke(wx, 'showModal', {
          title: '暂时无法转发',
          content: '可先保存音频，稍后重试转发。\n原因：' + this.voiceError(e),
          confirmText: '保存音频', cancelText: '关闭'
        });
        if (result.confirm) await this.saveVoiceFile(file);
      }
    } catch (e) {
      wx.hideLoading();
      if (!audioFile.isCancelled(e)) {
        console.warn('[audio] prepare/save failed', e);
        wx.showModal({ title: '音频操作失败', content: this.voiceError(e), showCancel: false });
      }
    } finally { this.voiceFileBusy = false; }
  },
  voiceError(e) {
    return String((e && (e.errMsg || e.message)) || '请检查网络、音频是否仍存在以及云存储读取权限后重试').slice(0, 240);
  },
  async saveVoiceFile(file) {
    const device = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
    if (['windows', 'mac'].includes(device.platform) && typeof wx.saveFileToDisk === 'function') {
      try {
        await audioFile.invoke(wx, 'saveFileToDisk', { filePath: file.path });
        wx.showToast({ title: '已保存到磁盘', icon: 'success' });
        return;
      } catch (e) {
        if (audioFile.isCancelled(e)) return;
        console.warn('[audio] disk save failed', e);
      }
    }
    // 手机端沙箱文件不等于系统“下载”目录，不提示不存在的相册/文件授权。
    const stored = wx.getStorageSync('saved_cat_audio') || [];
    const list = Array.isArray(stored) ? stored : [];
    wx.setStorageSync('saved_cat_audio', [file].concat(list.filter(f => f.path !== file.path)));
    wx.showModal({
      title: '已保存到小程序本地',
      content: '音频已缓存在小程序本地，可稍后重试转发。这不是手机文件管理器的下载目录；需要导出时，请重试转发或使用电脑微信保存到磁盘。',
      showCancel: false
    });
  },
  rejectSub(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '忽略投稿', content: '确定忽略该投稿？',
      success: res => {
        if (!res.confirm) return;
        service.rejectSubmission(id).then(() => { this.setData({ detail: null }); this.loadData(); });
      }
    });
  }
});
