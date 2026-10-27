// 管理工作台：进入即校验身份（非管理员跳 denied）；概览/列表来自服务层；操作接 service 真实执行
const service = require('../../utils/service');

Page({
  data: {
    // 统计键用 ASCII，避免 WXML 表达式解析器不支持“点+中文属性名”
    stats: { zaixiao: 0, dailingyang: 0, biye: 0, xiuxue: 0, miaoxing: 0 },
    cats: [],
    admins: [],
    subs: [],
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
    service.listAdmins().then(r => {
      const me = this.data.myRole;
      const admins = (r.list || []).map(a => ({
        openid: a.openid, realName: a.realName, roleText: a.role === 'superadmin' ? '超级管理员' : '管理员',
        major: a.major, className: a.className, dorm: a.dorm,
        canTransfer: me === 'superadmin' && a.role === 'editor',
        canRemove: me === 'superadmin' && a.role === 'editor'
      }));
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
