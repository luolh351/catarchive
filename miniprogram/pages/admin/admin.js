// 管理工作台：进入即校验身份（非管理员跳 denied）；概览/列表来自服务层；操作接 service 真实执行
const service = require('../../utils/service');

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
    service.checkAdmin().then(r => {
      if (!r.isAdmin) { wx.redirectTo({ url: '/pages/denied/denied' }); return; }
      this.setData({ myRole: r.role, ready: true });
      this.loadData();
    }).catch(() => { wx.redirectTo({ url: '/pages/denied/denied' }); });
  },
  // 从编辑/新增页返回时刷新，保证名字/毛色等修改即时可见（修复“保存无反应”的错觉）
  onShow() { if (this.data.ready) this.loadData(); },
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
    wx.navigateTo({ url: '/pages/catForm/catForm' + (id ? '?id=' + id : '') });
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
    try { env = (wx.getSystemInfoSync() || {}).platform || ''; } catch (e) { env = ''; }
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
  // 投稿音频：同样多渠道降级保存
  downloadSubVoice() {
    const voice = this.data.detail.voice;
    if (!voice) return;
    wx.showLoading({ title: '准备中' });
    this.resolveLocal(voice)
      .then(local => this.saveToLocal(local, false))
      .then(r => {
        wx.hideLoading();
        if (r.ok) wx.showToast({ title: '已保存到' + r.way, icon: 'success' });
        else this.saveFailTip(false);
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '下载失败', icon: 'none' }); });
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
