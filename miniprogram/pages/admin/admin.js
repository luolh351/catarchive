// 管理工作台：进入即校验身份（非管理员跳 denied）；概览/列表来自服务层；操作接 service 真实执行
const service = require('../../utils/service');

Page({
  data: {
    stats: { 在校: 0, 毕业: 0, 休学: 0, 喵星: 0, 待领养: 0 },
    cats: [],
    admins: [],
    myRole: ''
  },
  onLoad() {
    service.checkAdmin().then(r => {
      if (!r.isAdmin) { wx.redirectTo({ url: '/pages/denied/denied' }); return; }
      this.setData({ myRole: r.role });
      this.loadData();
    }).catch(() => { wx.redirectTo({ url: '/pages/denied/denied' }); });
  },
  loadData() {
    service.getCats('').then(list => {
      const s = { 在校: 0, 毕业: 0, 休学: 0, 喵星: 0, 待领养: 0 };
      const cats = list.map(c => {
        if (s[c.lifeStatus] !== undefined) s[c.lifeStatus]++;
        if (c.isAdoptable) s.待领养++;
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
