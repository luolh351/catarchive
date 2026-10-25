// 客户端服务层：统一封装数据读写，USE_CLOUD=false 时用本地模拟，true 时走云函数。
// 云函数文档见 docs/miniapp/cloud-design.md。
const app = getApp();

const USE_CLOUD = (app && app.globalData && app.globalData.USE_CLOUD) || false;

// 本地模拟数据（连云前使用，结构与 cats 集合一致）
const MOCK_CATS = [
  { id: 'c1', name: '小橘', lifeStatus: '在校', isAdoptable: true, bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '猫', sub: '橘白 · 食堂附近' },
  { id: 'c2', name: '煤球', lifeStatus: '在校', isAdoptable: false, bg: 'linear-gradient(135deg,#5B6470,#2F3640)', photoText: '猫', sub: '黑白 · 操场' },
  { id: 'c3', name: '牛奶', lifeStatus: '在校', isAdoptable: false, bg: 'linear-gradient(135deg,#E6ECF3,#C3CCD8)', photoText: '猫', sub: '白 · 图书馆' },
  { id: 'c4', name: '大白', lifeStatus: '在校', isAdoptable: false, bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '猫', sub: '白灰 · 宿舍区' },
  { id: 'c5', name: '小花', lifeStatus: '毕业', isAdoptable: false, bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '猫', sub: '已领养 · 原宿舍区' },
  { id: 'c6', name: '阿灰', lifeStatus: '毕业', isAdoptable: false, bg: 'linear-gradient(135deg,#9AA9BB,#5B6470)', photoText: '猫', sub: '已领养 · 原食堂' },
  { id: 'c7', name: '雪球', lifeStatus: '休学', isAdoptable: false, bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '猫', sub: '不知所踪 · 3个月无记录' },
  { id: 'c8', name: '老橘', lifeStatus: '喵星', isAdoptable: false, bg: 'linear-gradient(135deg,#B8C0CC,#8C96A3)', photoText: '猫', sub: '已回喵星 · 享年约9岁' }
];

const MOCK_DETAIL = {
  name: '小橘', isAdoptable: true, statusText: '在校',
  attrs: [
    { k: '毛色', v: '橘白' }, { k: '性别', v: '公（已确认）' },
    { k: '绝育情况', v: '已绝育' }, { k: '绝育时间', v: '2024-05' },
    { k: '性格', v: '亲人、粘人' }, { k: '常出没', v: '食堂、宿舍区' },
    { k: '状况', v: '健康（已确认）' }, { k: '最近情况', v: '近期食堂出没，状态良好' }
  ],
  timeline: [
    { t: '2026-10-22 · 食堂附近', c: '投喂正常，体型偏胖' },
    { t: '2026-09-10 · 宿舍区', c: '换季掉毛，精神好' }
  ]
};

function call(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({ name, data }).then(res => resolve(res.result)).catch(reject);
  });
}

function mockOk(extra) {
  return Promise.resolve(Object.assign({ ok: true, mock: true }, extra || {}));
}

// 公开：按状态取列表
function getCats(status) {
  if (!USE_CLOUD) {
    const list = status ? MOCK_CATS.filter(c => c.lifeStatus === status) : MOCK_CATS;
    return Promise.resolve(list);
  }
  return call('catList', { status: status || '' });
}

// 公开：取详情（统一返回 { cat, attrs, timeline }）
function getCat(id) {
  if (!USE_CLOUD) {
    const base = MOCK_CATS.find(c => c.id === id) || MOCK_CATS[0];
    return Promise.resolve({
      cat: { name: base.name, isAdoptable: base.isAdoptable, statusText: base.lifeStatus },
      attrs: MOCK_DETAIL.attrs,
      timeline: MOCK_DETAIL.timeline
    });
  }
  return call('catDetail', { id }).then(res => {
    const cat = res.cat || {};
    const attrs = [
      { k: '毛色', v: cat.coatColor || '未知' },
      { k: '性别', v: cat.gender || '未知' },
      { k: '绝育情况', v: cat.sterilizationStatus || '未知' },
      { k: '绝育时间', v: cat.sterilizedAt || '—' },
      { k: '性格', v: (cat.personalityTags || []).join('、') || '—' },
      { k: '常出没', v: (cat.usualLocations || []).join('、') || '—' },
      { k: '状况', v: cat.healthNotes || '—' },
      { k: '最近情况', v: cat.latestNote || '—' }
    ];
    const timeline = (res.timeline || []).map(u => ({
      t: (u.createdAt ? String(u.createdAt).slice(0, 10) : ''),
      c: u.content || ''
    }));
    return { cat: { name: cat.name, isAdoptable: !!cat.isAdoptable, statusText: cat.lifeStatus }, attrs, timeline };
  });
}

// 公开：校验管理员身份
function checkAdmin() {
  if (!USE_CLOUD) return Promise.resolve({ isAdmin: false });
  return call('checkAdmin', {});
}

// 管理员：增改归档
function catManage(action, payload) {
  if (!USE_CLOUD) return mockOk();
  return call('catManage', Object.assign({ action }, payload));
}

// 管理员：新增近况
function addUpdate(catId, content) {
  if (!USE_CLOUD) return mockOk();
  return call('updateCreate', { catId, content });
}

// 管理员：管理员名单
function listAdmins() {
  if (!USE_CLOUD) return Promise.resolve({ list: [] });
  return call('adminList', {});
}

// 管理员：增删/转让
function adminManage(action, payload) {
  if (!USE_CLOUD) return mockOk();
  return call('adminManage', Object.assign({ action }, payload));
}

// 首次：初始化超级管理员
function initAdmin(profile) {
  if (!USE_CLOUD) return mockOk();
  return call('initAdmin', profile);
}

module.exports = {
  getCats, getCat, checkAdmin, catManage, addUpdate, listAdmins, adminManage, initAdmin
};
