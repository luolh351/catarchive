// 管理工作台：进入即校验身份（非管理员跳 denied）；概览/列表来自服务层；操作接 service 真实执行
const service = require('../../utils/service');

Page({
  data: {
    // 统计键用 ASCII，避免 WXML 表达式解析器不支持“点+中文属性名”
    stats: { zaixiao: 0, dailingyang: 0, biye: 0, xiuxue: 0, miaoxing: 0 },
    cats: [],
    admins: [],
    myRole: '',
    ready: false
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
        return { id: c.id, name: c.name, s: c.lifeStatus + (c.isAdoptable ? ' · 待领养' : '') };
      });
      this.setData({ stats: s, cats });
    });
    service.listAdmins().then(r => {
      const me = this.data.myRole;
      const admins = (r.list || []).map(a => ({
        openid: a.openid, realName: a.realName, roleText: a.role === 'superadmin' ? '超级管理员' : '管理员',
        major: a.major, className: a.className, dorm: a.dorm,
        canTransfer: me === 'superadmin' && a.role === 'editor',
        canRemove: me === 'superadmin' && a.role === 'editor'
      }));
      this.setData({ admins });
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
  transfer(e) {
    const openid = e.currentTarget.dataset.id;
    wx.showModal({
      title: '转让超级管理员', content: '确定转让给该用户？你将变为普通管理员。',
      success: res => {
        if (!res.confirm) return;
        service.adminManage('transfer', { openid }).then(r => {
          if (r && r.ok === false) { wx.showToast({ title: r.msg || '操作失败', icon: 'none' }); return; }
          wx.showToast({ title: '已转让', icon: 'success' });
          this.loadData();
        });
      }
    });
  },
  remove(e) {
    const openid = e.currentTarget.dataset.id;
    wx.showModal({
      title: '撤权', content: '确定移除该管理员？',
      success: res => { if (res.confirm) service.adminManage('remove', { openid }).then(() => this.loadData()); }
    });
  },
  addAdmin() {
    wx.showModal({
      title: '新增管理员', editable: true, placeholderText: '输入对方微信 openid',
      success: res => {
        if (res.confirm && res.content) {
          service.adminManage('add', { openid: res.content, realName: res.content }).then(r => {
            if (r && r.ok === false) { wx.showToast({ title: r.msg || '操作失败', icon: 'none' }); return; }
            this.loadData();
          });
        }
      }
    });
  }
});
