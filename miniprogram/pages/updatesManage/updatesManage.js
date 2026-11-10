// 近况管理：按时间列出某只猫的全部历史近况，点击展开可修改/删除。
// 编辑/删除最新一条时，云端会同步回退档案的 latestNote（摘要）。
const service = require('../../utils/service');

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(typeof v === 'number' ? v : String(v).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

Page({
  data: { list: [], loaded: false },
  onLoad(options) {
    this.catId = options.catId || '';
    const name = options.name ? decodeURIComponent(options.name) : '猫咪';
    wx.setNavigationBarTitle({ title: name + ' · 近况管理' });
    this.load();
  },
  load() {
    wx.showLoading({ title: '加载中' });
    service.listUpdates(this.catId).then(r => {
      wx.hideLoading();
      const list = (r.list || []).map(u => ({
        id: u.id,
        date: fmtDate(u.createdAt),
        content: u.content || '',
        photos: u.photos || [],
        open: false,
        draft: u.content || ''
      }));
      this.setData({ list, loaded: true });
    }).catch(e => {
      wx.hideLoading();
      this.setData({ loaded: true });
      wx.showModal({ title: '加载失败', content: (e && e.message) || '请重试', showCancel: false });
    });
  },
  find(id) { return this.data.list.find(x => x.id === id); },
  patch(id, obj) {
    const list = this.data.list.map(x => (x.id === id ? Object.assign({}, x, obj) : x));
    this.setData({ list });
  },
  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.find(id);
    if (item) this.patch(id, { open: !item.open });
  },
  onDraft(e) {
    this.patch(e.currentTarget.dataset.id, { draft: e.detail.value });
  },
  previewPhoto(e) {
    const list = e.currentTarget.dataset.list || [];
    if (list.length) wx.previewImage({ urls: list, current: e.currentTarget.dataset.src });
  },
  removePhoto(e) {
    const id = e.currentTarget.dataset.id, pi = e.currentTarget.dataset.pi;
    const item = this.find(id);
    if (!item) return;
    const photos = item.photos.slice();
    photos.splice(pi, 1);
    this.patch(id, { photos });
  },
  // 保存修改：内容为空拦截；成功后局部更新摘要展示，不打断浏览位置
  save(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.find(id);
    if (!item) return;
    const content = (item.draft || '').trim();
    if (!content) { wx.showToast({ title: '内容不能为空', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中', mask: true });
    service.editUpdate(this.catId, id, { content, photos: item.photos }).then(r => {
      wx.hideLoading();
      if (!r || r.ok === false) { wx.showToast({ title: (r && r.msg) || '保存失败', icon: 'none' }); return; }
      this.patch(id, { content, open: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch(() => {
      wx.hideLoading();
      wx.showModal({ title: '保存失败', content: '网络异常，请重试', showCancel: false });
    });
  },
  del(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.find(id);
    if (!item) return;
    wx.showModal({
      title: '删除近况',
      content: '删除后不可恢复' + (this.data.list[0] && this.data.list[0].id === id ? '，档案摘要将回退到上一条' : '') + '。确定删除？',
      confirmColor: '#D9534F',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中', mask: true });
        service.deleteUpdate(this.catId, id).then(r => {
          wx.hideLoading();
          if (!r || r.ok === false) { wx.showToast({ title: (r && r.msg) || '删除失败', icon: 'none' }); return; }
          this.setData({ list: this.data.list.filter(x => x.id !== id) });
          wx.showToast({ title: '已删除', icon: 'success' });
        }).catch(() => {
          wx.hideLoading();
          wx.showModal({ title: '删除失败', content: '网络异常，请重试', showCancel: false });
        });
      }
    });
  }
});
