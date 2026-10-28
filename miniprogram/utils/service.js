// 客户端服务层：统一封装数据读写。USE_CLOUD=false 时用本地模拟(支持真实写入演示)，true 时走云函数。
// 云函数文档见 docs/miniapp/cloud-design.md。
const app = getApp();

const USE_CLOUD = (app && app.globalData && app.globalData.USE_CLOUD) || false;

// ---------- mock 持久化：模拟数据写入本地 Storage，跨“重新编译/切换身份”保留 ----------
// 目的：本地验证流程需要重新编译切换身份，若只存内存，新增的猫/投稿会丢失，流程走不通
const STORE_CATS = 'mock_cats';
const STORE_SUBS = 'mock_cat_submissions';
const STORE_ADMINS = 'mock_admin_users';
const STORE_APPS = 'mock_admin_applications';
function loadStore(key, def) {
  try { const v = wx.getStorageSync(key); return Array.isArray(v) ? v : def; } catch (e) { return def; }
}
function saveStore(key, val) { try { wx.setStorageSync(key, val); } catch (e) {} }

// 本地演示素材：给 mock 猫轮询分配照片与叫声（包内文件，真机/模拟器可直接显示与播放）
const DEMO_PHOTOS = ['/assets/photos/cat1.jpg', '/assets/photos/cat2.jpg', '/assets/photos/cat3.jpg', '/assets/photos/cat4.jpg', '/assets/photos/cat5.jpg', '/assets/photos/cat6.jpg'];
const DEMO_VOICE = ['/assets/sounds/meow1.wav', '/assets/sounds/meow2.wav', '/assets/sounds/meow3.wav', '/assets/sounds/meow4.mp3'];

// ---------- 本地模拟数据（结构与 cats 集合一致；每只猫带完整属性与近况） ----------
// 首次启动用默认数据并写入 Storage；之后从 Storage 读取，保证新增/编辑/投稿跨重编译不丢
function defaultCats() {
  const list = [
  { id: 'c1', name: '小橘', lifeStatus: '在校', isAdoptable: true, coatColor: '橘白', gender: '公', sterilizationStatus: '已绝育', sterilizedAt: '2024-05', personalityTags: ['亲人', '粘人'], usualLocations: ['食堂', '宿舍区'], healthNotes: '健康', latestNote: '近期食堂出没，状态良好', photos: [], voice: '', bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '橘', sub: '橘白 · 食堂附近',
    timeline: [ { t: '2026-10-22 · 食堂附近', c: '投喂正常，体型偏胖' }, { t: '2026-09-10 · 宿舍区', c: '换季掉毛，精神好' } ] },
  { id: 'c2', name: '煤球', lifeStatus: '在校', isAdoptable: false, coatColor: '黑白', gender: '母', sterilizationStatus: '已绝育', sterilizedAt: '2023-11', personalityTags: ['高冷', '怕生'], usualLocations: ['操场', '体育馆'], healthNotes: '健康', latestNote: '常在操场晒太阳', photos: [], voice: '', bg: 'linear-gradient(135deg,#5B6470,#2F3640)', photoText: '煤', sub: '黑白 · 操场',
    timeline: [ { t: '2026-10-20 · 操场', c: '远处观望，未靠近' } ] },
  { id: 'c3', name: '牛奶', lifeStatus: '在校', isAdoptable: false, coatColor: '白', gender: '母', sterilizationStatus: '未绝育', sterilizedAt: '', personalityTags: ['温顺'], usualLocations: ['图书馆', '教学楼'], healthNotes: '偏瘦，建议驱虫', latestNote: '图书馆门口偶遇', photos: [], voice: '', bg: 'linear-gradient(135deg,#E6ECF3,#C3CCD8)', photoText: '牛', sub: '白 · 图书馆',
    timeline: [ { t: '2026-10-18 · 图书馆', c: '安静卧着，未进食' } ] },
  { id: 'c4', name: '大白', lifeStatus: '在校', isAdoptable: false, coatColor: '白', gender: '公', sterilizationStatus: '已绝育', sterilizedAt: '2024-03', personalityTags: ['慵懒'], usualLocations: ['宿舍区'], healthNotes: '健康', latestNote: '宿舍楼下常驻', photos: [], voice: '', bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '白', sub: '白灰 · 宿舍区',
    timeline: [ { t: '2026-10-15 · 宿舍区', c: '被同学投喂罐头' } ] },
  { id: 'c5', name: '小花', lifeStatus: '毕业', isAdoptable: false, coatColor: '橘白', gender: '母', sterilizationStatus: '已绝育', sterilizedAt: '2023-06', personalityTags: ['亲人'], usualLocations: ['宿舍区'], healthNotes: '已领养', latestNote: '已被校友领养回家', photos: [], voice: '', bg: 'linear-gradient(135deg,#FFB46B,#FF8A3D)', photoText: '花', sub: '已领养 · 原宿舍区',
    timeline: [ { t: '2026-06-30', c: '正式被领养，离开校园' } ] },
  { id: 'c6', name: '阿灰', lifeStatus: '毕业', isAdoptable: false, coatColor: '其他', gender: '公', sterilizationStatus: '已绝育', sterilizedAt: '2023-04', personalityTags: ['独立'], usualLocations: ['食堂'], healthNotes: '已领养', latestNote: '由教职工领养', photos: [], voice: '', bg: 'linear-gradient(135deg,#9AA9BB,#5B6470)', photoText: '灰', sub: '已领养 · 原食堂',
    timeline: [ { t: '2026-05-20', c: '被食堂阿姨领养' } ] },
  { id: 'c7', name: '雪球', lifeStatus: '休学', isAdoptable: false, coatColor: '白', gender: '未知', sterilizationStatus: '未知', sterilizedAt: '', personalityTags: [], usualLocations: ['不明'], healthNotes: '3 个月无可靠记录', latestNote: '不知所踪，暂记为休学', photos: [], voice: '', bg: 'linear-gradient(135deg,#CDD7E3,#9AA9BB)', photoText: '雪', sub: '不知所踪 · 3个月无记录',
    timeline: [ { t: '2026-07-01', c: '最后一次出现在宿舍区' } ] },
  { id: 'c8', name: '老橘', lifeStatus: '喵星', isAdoptable: false, coatColor: '橘白', gender: '公', sterilizationStatus: '已绝育', sterilizedAt: '2018-01', personalityTags: ['校园元老'], usualLocations: ['全校'], healthNotes: '享年约9岁', latestNote: '已回喵星，铭记', photos: [], voice: '', bg: 'linear-gradient(135deg,#B8C0CC,#8C96A3)', photoText: '老', sub: '已回喵星 · 享年约9岁',
    timeline: [ { t: '2025-12-01', c: '安详离世，感谢陪伴' } ] }
  ];
  // 给 mock 猫轮询分配照片与叫声
  list.forEach((c, i) => {
    c.photos = [DEMO_PHOTOS[i % DEMO_PHOTOS.length]];
    c.voice = DEMO_VOICE[i % DEMO_VOICE.length];
  });
  // 演示“无叫声”的展示效果：煤球(c2)不分配音频（照片保留，复用现有图）
  list[1].voice = '';
  return list;
}

let MOCK_CATS = loadStore(STORE_CATS, null) || defaultCats();

// ---------- 管理员名单默认数据 ----------
const DEFAULT_ADMINS = [
  { openid: 'o_super', realName: '我（超级管理员）', role: 'superadmin', major: '计算机', className: '计科1班', dorm: '3栋', note: '本地演示' },
  { openid: 'o_editor', realName: '李四', role: 'editor', major: '生科', className: '生科2班', dorm: '5栋', note: '' }
];

let MOCK_ADMINS = loadStore(STORE_ADMINS, DEFAULT_ADMINS);

// 游客投稿（待审核，不直发公开页，持久化）
let MOCK_SUBS = loadStore(STORE_SUBS, []);
// 本地“当前登录”的 openid —— 身份只由这一行决定，无需其它开关：
//   'o_super'   → 超级管理员（默认，可进管理台、管理其他管理员）
//   'o_editor'  → 普通管理员（李四）
//   'o_visitor' → 游客；一旦其申请被审批通过，会自动进入名单，再以此身份登录即为普通管理员
//   想体验“全新游客”申请流程：改成一个不在名单里的值（如 'o_new'），或清空 Storage 后重编译
let MOCK_ME_OPENID = 'o_super';
// 管理员申请（待认领，持久化）
let MOCK_APPS = loadStore(STORE_APPS, []);

function call(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({ name, data }).then(res => resolve(res.result)).catch(err => {
      console.warn('[cloud] 调用失败:', name, err); // 便于在控制台定位是未部署还是参数问题
      reject(err);
    });
  });
}
function mockOk(extra) { return Promise.resolve(Object.assign({ ok: true, mock: true }, extra || {})); }
function toArr(v) {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v;
  return String(v).split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}
function pickBg(coat) {
  const m = { '橘白': 'linear-gradient(135deg,#FFB46B,#FF8A3D)', '黑白': 'linear-gradient(135deg,#5B6470,#2F3640)', '白': 'linear-gradient(135deg,#E6ECF3,#C3CCD8)', '狸花': 'linear-gradient(135deg,#B08968,#6F4E37)', '其他': 'linear-gradient(135deg,#9AA9BB,#5B6470)', '未知': 'linear-gradient(135deg,#9AA9BB,#5B6470)' };
  return m[coat] || m['未知'];
}

// 列表卡片派生字段（mock 与 cloud 共用）：保证 _id→id、封面/简介字段齐全
function cardOf(c) {
  return {
    id: c._id || c.id,
    name: c.name,
    isAdoptable: !!c.isAdoptable,
    lifeStatus: c.lifeStatus,
    photo: (c.photos && c.photos[0]) || '',
    bg: c.bg || pickBg(c.coatColor),
    photoText: c.photoText || (c.name ? c.name[0] : '猫'),
    // 搜索用：昵称（全部）、常出没（全部区域，而非仅第一个）、最新近况
    latestNote: c.latestNote || '',
    aliasesText: Array.isArray(c.aliases) ? c.aliases.join('、') : (c.aliases || ''),
    locationsText: Array.isArray(c.usualLocations) ? c.usualLocations.join('、') : (c.usualLocations || ''),
    healthNotes: c.healthNotes || '',
    sub: c.sub || [ (c.coatColor || ''), (Array.isArray(c.usualLocations) ? c.usualLocations[0] : (c.usualLocations || '')) ].filter(Boolean).join(' · ') || '校园流浪猫'
  };
}
// 详情属性派生
function attrsOf(c) {
  return [
    { k: '毛色', v: c.coatColor || '未知' },
    { k: '性别', v: c.gender || '未知' },
    { k: '绝育情况', v: c.sterilizationStatus || '未知' },
    { k: '绝育时间', v: c.sterilizedAt || '—' },
    { k: '性格', v: (Array.isArray(c.personalityTags) ? c.personalityTags.join('、') : (c.personalityTags || '')) || '—' },
    { k: '常出没', v: (Array.isArray(c.usualLocations) ? c.usualLocations.join('、') : (c.usualLocations || '')) || '—' },
    { k: '状况', v: c.healthNotes || '—' },
    { k: '最近情况', v: c.latestNote || '—' }
  ];
}
// 时间线派生（container 含 timeline 数组）
function timelineOf(container) {
  const tl = (container && container.timeline) || [];
  return tl.map(u => ({ t: u.t || (u.createdAt ? String(u.createdAt).slice(0, 10) : ''), c: u.c || u.content || '' }));
}

// ---------- 公开：列表 ----------
function getCats(status) {
  if (!USE_CLOUD) {
    let list = MOCK_CATS.filter(c => c.published !== false);
    if (status) list = list.filter(c => c.lifeStatus === status);
    return Promise.resolve(list.map(cardOf));
  }
  return call('catList', { status: status || '' }).then(r => {
    const list = (r && r.list) || [];
    return list.map(cardOf);
  });
}

// ---------- 公开：详情（统一返回 { cat, attrs, timeline }；归档/不存在返回 cat:null） ----------
function getCat(id) {
  if (!USE_CLOUD) {
    const c = MOCK_CATS.find(x => x.id === id);
    if (!c || c.published === false) return Promise.resolve({ cat: null, attrs: [], timeline: [] });
    const cat = {
      id: c.id, name: c.name, isAdoptable: !!c.isAdoptable, statusText: c.lifeStatus,
      photos: c.photos || [], voice: c.voice || '', lifeStatus: c.lifeStatus,
      coatColor: c.coatColor, gender: c.gender, sterilizationStatus: c.sterilizationStatus,
      sterilizedAt: c.sterilizedAt, personalityTags: c.personalityTags || [], usualLocations: c.usualLocations || [],
      healthNotes: c.healthNotes || '', aliases: c.aliases || [], latestNote: c.latestNote || ''
    };
    return Promise.resolve({ cat, attrs: attrsOf(c), timeline: timelineOf(c) });
  }
  return call('catDetail', { id }).then(res => {
    if (!res || !res.cat) return { cat: null, attrs: [], timeline: [] };
    const c = res.cat;
    const cat = {
      id: c._id, name: c.name, isAdoptable: !!c.isAdoptable, statusText: c.lifeStatus,
      photos: c.photos || [], voice: c.voice || '', lifeStatus: c.lifeStatus,
      coatColor: c.coatColor, gender: c.gender, sterilizationStatus: c.sterilizationStatus,
      sterilizedAt: c.sterilizedAt, personalityTags: c.personalityTags || [], usualLocations: c.usualLocations || [],
      healthNotes: c.healthNotes || '', aliases: c.aliases || [], latestNote: c.latestNote || ''
    };
    return { cat, attrs: attrsOf(c), timeline: timelineOf(res) };
  });
}

// ---------- 公开：校验管理员身份 ----------
function checkAdmin() {
  if (!USE_CLOUD) {
    const me = MOCK_ADMINS.find(a => a.openid === MOCK_ME_OPENID);
    if (!me) return Promise.resolve({ isAdmin: false });
    return Promise.resolve({ isAdmin: true, role: me.role, profile: { realName: me.realName, note: me.note || '' } });
  }
  return call('checkAdmin', {});
}

// ---------- 云端媒体上传：把本地临时文件转成云存储 fileID ----------
// 原因：表单选到的是本地临时路径，直接写库会在会话结束后失效；必须先上传到云存储
function isRemotePath(p) { return !!p && (p.indexOf('cloud://') === 0 || /^https?:\/\//.test(p)); }
function uploadOne(p) {
  if (!p || isRemotePath(p)) return Promise.resolve(p || '');
  const ext = (String(p).split('.').pop() || 'jpg').toLowerCase().slice(0, 8);
  const cloudPath = 'cats/' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.' + ext;
  return wx.cloud.uploadFile({ cloudPath, filePath: p }).then(r => r.fileID).catch(() => p);
}
function uploadList(list) { return Promise.all((list || []).map(uploadOne)); }
// 提交前统一处理媒体；非云端或云能力不可用时原样返回
function prepareMedia(data) {
  const d = Object.assign({}, data || {});
  if (!USE_CLOUD || !wx.cloud || !wx.cloud.uploadFile) return Promise.resolve(d);
  return Promise.all([ uploadList(d.photos), uploadOne(d.voice) ]).then(r => {
    d.photos = r[0] || [];
    d.voice = r[1] || '';
    return d;
  });
}

// ---------- 管理员：增改归档（mock 真写入，cloud 走云函数） ----------
function catManage(action, payload) {
  if (!USE_CLOUD) {
    if (action === 'create') {
      const d = payload.data || {};
      const id = 'c' + Date.now();
      const life = d.lifeStatus || '在校'; // 业务规则：不在“在校”状态不允许标记待领养
      const cat = {
        id, name: d.name, lifeStatus: life, isAdoptable: !!d.isAdoptable && life === '在校',
        coatColor: d.coatColor || '未知', gender: d.gender || '未知', sterilizationStatus: d.sterilizationStatus || '未知',
        sterilizedAt: d.sterilizedAt || '', personalityTags: toArr(d.personalityTags) || [], usualLocations: toArr(d.usualLocations) || [],
        aliases: toArr(d.aliases) || [], healthNotes: d.healthNotes || '', latestNote: d.latestNote || '',
        photos: d.photos || [], voice: d.voice || '', published: true,
        bg: pickBg(d.coatColor), photoText: (d.name || '猫')[0] || '猫',
        sub: [ (d.coatColor || ''), (toArr(d.usualLocations)[0] || '') ].filter(Boolean).join(' · '),
        timeline: d.latestNote ? [ { t: '刚刚', c: d.latestNote } ] : []
      };
      MOCK_CATS.push(cat);
      saveStore(STORE_CATS, MOCK_CATS);
      return mockOk({ id });
    }
    if (action === 'update') {
      const cat = MOCK_CATS.find(x => x.id === payload.id);
      if (!cat) return Promise.resolve({ ok: false, msg: '未找到该猫咪' });
      const d = payload.data || {};
      if (d.name !== undefined) cat.name = d.name;
      if (d.coatColor !== undefined) cat.coatColor = d.coatColor;
      if (d.gender !== undefined) cat.gender = d.gender;
      if (d.sterilizationStatus !== undefined) cat.sterilizationStatus = d.sterilizationStatus;
      if (d.sterilizedAt !== undefined) cat.sterilizedAt = d.sterilizedAt;
      if (d.personalityTags !== undefined) cat.personalityTags = toArr(d.personalityTags) || [];
      if (d.usualLocations !== undefined) cat.usualLocations = toArr(d.usualLocations) || [];
      if (d.aliases !== undefined) cat.aliases = toArr(d.aliases) || [];
      if (d.healthNotes !== undefined) cat.healthNotes = d.healthNotes;
      if (d.latestNote !== undefined) cat.latestNote = d.latestNote;
      // 业务规则：去向一旦不是“在校”，自动取消待领养（与云端 update 一致）
      const nextLife = d.lifeStatus !== undefined ? d.lifeStatus : cat.lifeStatus;
      if (d.lifeStatus !== undefined) cat.lifeStatus = d.lifeStatus;
      if (d.isAdoptable !== undefined) cat.isAdoptable = !!d.isAdoptable && nextLife === '在校';
      else if (nextLife !== '在校') cat.isAdoptable = false;
      if (d.photos !== undefined) cat.photos = d.photos;
      if (d.voice !== undefined) cat.voice = d.voice;
      cat.bg = pickBg(cat.coatColor); cat.photoText = (cat.name || '猫')[0];
      cat.sub = [ (cat.coatColor || ''), (cat.usualLocations[0] || '') ].filter(Boolean).join(' · ');
      // 近况摘要只更新字段，不在此追加时间线（追加时间线由 addUpdate 负责，与云端行为一致）
      saveStore(STORE_CATS, MOCK_CATS);
      return mockOk();
    }
    if (action === 'archive') {
      const cat = MOCK_CATS.find(x => x.id === payload.id);
      if (cat) { cat.published = false; saveStore(STORE_CATS, MOCK_CATS); }
      return mockOk();
    }
    return Promise.resolve({ ok: false, msg: '未知 action' });
  }
  // 云端：先把照片/音频上传到云存储拿到 fileID，再写入数据库
  const d0 = (payload && payload.data) || {};
  if (d0.photos || d0.voice) {
    return prepareMedia(d0).then(d => call('catManage', Object.assign({ action }, payload, { data: d })));
  }
  return call('catManage', Object.assign({ action }, payload));
}

// ---------- 管理员：新增近况 ----------
function addUpdate(catId, content) {
  if (!USE_CLOUD) {
    const cat = MOCK_CATS.find(x => x.id === catId);
    if (cat) {
      cat.latestNote = content;
      cat.timeline = cat.timeline || [];
      cat.timeline.unshift({ t: '刚刚', c: content }); // 补充近况＝新增时间线条目
      saveStore(STORE_CATS, MOCK_CATS);
    }
    return mockOk();
  }
  return call('updateCreate', { catId, content });
}

// ---------- 管理员：名单（mock） ----------
function listAdmins() {
  if (!USE_CLOUD) return Promise.resolve({ ok: true, list: MOCK_ADMINS.map(a => ({ openid: a.openid, role: a.role, realName: a.realName, major: a.major, className: a.className, dorm: a.dorm, note: a.note || '' })) });
  return call('adminList', {});
}

// ---------- 管理员：增删/转让（mock） ----------
function adminManage(action, payload) {
  if (!USE_CLOUD) {
    if (action === 'add') {
      if (MOCK_ADMINS.find(a => a.openid === payload.openid)) return Promise.resolve({ ok: false, msg: '已是管理员' });
      MOCK_ADMINS.push({ openid: payload.openid, realName: payload.realName || '新管理员', role: 'editor', major: payload.major || '', className: payload.className || '', dorm: payload.dorm || '', note: '' });
      saveStore(STORE_ADMINS, MOCK_ADMINS);
      return mockOk();
    }
    if (action === 'remove') {
      MOCK_ADMINS = MOCK_ADMINS.filter(a => a.openid !== payload.openid);
      saveStore(STORE_ADMINS, MOCK_ADMINS);
      return mockOk();
    }
    if (action === 'transfer') {
      const t = MOCK_ADMINS.find(a => a.openid === payload.openid);
      if (t && t.role === 'editor') {
        t.role = 'superadmin';
        const me = MOCK_ADMINS.find(a => a.role === 'superadmin' && a !== t);
        if (me) me.role = 'editor';
        saveStore(STORE_ADMINS, MOCK_ADMINS);
      }
      return mockOk();
    }
    return Promise.resolve({ ok: false, msg: '未知 action' });
  }
  return call('adminManage', Object.assign({ action }, payload));
}

// ---------- 首次：初始化超级管理员（mock 直接成功） ----------
function initAdmin(profile) {
  if (!USE_CLOUD) {
    // 与云端一致：只有尚未存在 superadmin 时才允许初始化（否则拒绝，防重复/防篡权）
    if (MOCK_ADMINS.some(a => a.role === 'superadmin')) {
      return Promise.resolve({ ok: false, msg: '已初始化，禁止重复初始化' });
    }
    // 本地：把“当前登录”身份置为首位超级管理员
    if (!MOCK_ADMINS.find(a => a.openid === MOCK_ME_OPENID)) {
      MOCK_ADMINS.push({
        openid: MOCK_ME_OPENID, realName: (profile && profile.realName) || '我（本地管理员）',
        role: 'superadmin', major: (profile && profile.major) || '', className: (profile && profile.className) || '',
        dorm: (profile && profile.dorm) || '', note: '本地演示'
      });
      saveStore(STORE_ADMINS, MOCK_ADMINS);
    }
    return mockOk();
  }
  return call('initAdmin', profile);
}

// ---------- 公开：游客投稿（进入待审核，不直发公开页） ----------
function submitCat(data) {
  if (!USE_CLOUD) {
    const id = 's' + Date.now();
    MOCK_SUBS.push(Object.assign({ id, status: 'pending', createdAt: Date.now() }, data));
    saveStore(STORE_SUBS, MOCK_SUBS);
    return mockOk({ id });
  }
  // 投稿的照片/音频同样先上传云存储，保证管理员审核时能正常预览与播放
  return prepareMedia(data).then(d => call('catSubmit', { data: d }));
}
function listSubmissions() {
  if (!USE_CLOUD) {
    // 返回完整字段，便于管理台“查看”直接展示详情（无需再请求）
    const list = MOCK_SUBS.filter(s => s.status === 'pending').map(s => ({
      id: s.id, name: s.name, aliases: s.aliases || [], coatColor: s.coatColor, gender: s.gender,
      sterilizationStatus: s.sterilizationStatus, sterilizedAt: s.sterilizedAt || '', usualLocations: s.usualLocations || [],
      healthNotes: s.healthNotes || '', latestNote: s.latestNote || '', lifeStatus: s.lifeStatus,
      personalityTags: s.personalityTags || [],
      isAdoptable: !!s.isAdoptable, photos: s.photos || [], voice: s.voice || '',
      submitterOpenid: s.submitterOpenid || '', createdAt: s.createdAt
    }));
    return Promise.resolve(list);
  }
  return call('submissionManage', { action: 'list' }).then(r => (r && r.list) || []);
}
function approveSubmission(id) {
  if (!USE_CLOUD) {
    const i = MOCK_SUBS.findIndex(s => s.id === id && s.status === 'pending');
    if (i < 0) return Promise.resolve({ ok: false, msg: '未找到投稿' });
    const d = MOCK_SUBS[i];
    const cat = {
      id: 'c' + Date.now(), name: d.name, lifeStatus: d.lifeStatus || '在校', isAdoptable: !!d.isAdoptable && (d.lifeStatus || '在校') === '在校',
      coatColor: d.coatColor || '未知', gender: d.gender || '未知', sterilizationStatus: d.sterilizationStatus || '未知',
      sterilizedAt: d.sterilizedAt || '', personalityTags: toArr(d.personalityTags) || [], usualLocations: toArr(d.usualLocations) || [],
      aliases: toArr(d.aliases) || [], healthNotes: d.healthNotes || '', latestNote: d.latestNote || '',
      photos: d.photos || [], voice: d.voice || '', published: true,
      bg: pickBg(d.coatColor), photoText: (d.name || '猫')[0] || '猫',
      sub: [ (d.coatColor || ''), (toArr(d.usualLocations)[0] || '') ].filter(Boolean).join(' · '),
      timeline: d.latestNote ? [ { t: '投稿审核通过', c: d.latestNote } ] : []
    };
    // 采纳投稿：写入公开档案（待领养按“在校”规则），移除待审记录
    MOCK_CATS.push(cat);
    MOCK_SUBS.splice(i, 1);
    saveStore(STORE_CATS, MOCK_CATS);
    saveStore(STORE_SUBS, MOCK_SUBS);
    return mockOk();
  }
  return call('submissionManage', { action: 'approve', id });
}
function rejectSubmission(id) {
  if (!USE_CLOUD) {
    const i = MOCK_SUBS.findIndex(s => s.id === id && s.status === 'pending');
    if (i >= 0) { MOCK_SUBS.splice(i, 1); saveStore(STORE_SUBS, MOCK_SUBS); }
    return mockOk();
  }
  return call('submissionManage', { action: 'reject', id });
}

// ---------- 公开：申请成为管理员（无需手抄 openid，云端自动取本人 openid） ----------
function applyAdmin(profile) {
  if (!USE_CLOUD) {
    const p0 = profile || {};
    // 与云端一致的必填校验：姓名/专业/班级/宿舍
    if (!p0.realName) return Promise.resolve({ ok: false, msg: '请填写姓名' });
    if (!p0.major) return Promise.resolve({ ok: false, msg: '请填写专业' });
    if (!p0.className) return Promise.resolve({ ok: false, msg: '请填写班级' });
    if (!p0.dorm) return Promise.resolve({ ok: false, msg: '请填写宿舍' });
    if (MOCK_ADMINS.find(a => a.openid === MOCK_ME_OPENID)) {
      return Promise.resolve({ ok: false, msg: '你已是管理员' }); // 与云端 adminApply 校验保持一致
    }
    if (MOCK_APPS.find(a => a.openid === MOCK_ME_OPENID && a.status === 'pending')) {
      return Promise.resolve({ ok: false, msg: '你已有待审核的申请' });
    }
    MOCK_APPS.push(Object.assign({
      id: 'a' + Date.now(), openid: MOCK_ME_OPENID, status: 'pending', createdAt: Date.now()
    }, profile || {}));
    saveStore(STORE_APPS, MOCK_APPS);
    return mockOk();
  }
  return call('adminApply', { action: 'submit', profile });
}
// 查询自己当前的申请状态（用于入口分流：已在审核中则提示等待）
function myApplication() {
  if (!USE_CLOUD) {
    const a = MOCK_APPS.find(x => x.openid === MOCK_ME_OPENID && x.status === 'pending');
    return Promise.resolve(a ? { status: 'pending', createdAt: a.createdAt } : null);
  }
  return call('adminApply', { action: 'mine' }).then(r => (r && r.app) || null);
}
// ---------- 超级管理员：待认领申请列表与审批 ----------
function listApplications() {
  if (!USE_CLOUD) {
    return Promise.resolve(MOCK_APPS.filter(a => a.status === 'pending').map(a => ({
      id: a.id, realName: a.realName || '', major: a.major || '', className: a.className || '',
      dorm: a.dorm || '', note: a.note || '', createdAt: a.createdAt
    })));
  }
  return call('adminManage', { action: 'listApply' }).then(r => (r && r.list) || []);
}
function approveApplication(id) {
  if (!USE_CLOUD) {
    const i = MOCK_APPS.findIndex(a => a.id === id && a.status === 'pending');
    if (i < 0) return Promise.resolve({ ok: false, msg: '未找到申请' });
    const a = MOCK_APPS[i];
    if (!MOCK_ADMINS.find(x => x.openid === a.openid)) {
      MOCK_ADMINS.push({ openid: a.openid, realName: a.realName || '新管理员', role: 'editor', major: a.major || '', className: a.className || '', dorm: a.dorm || '', note: a.note || '' });
      saveStore(STORE_ADMINS, MOCK_ADMINS);
    }
    MOCK_APPS.splice(i, 1);
    saveStore(STORE_APPS, MOCK_APPS);
    return mockOk();
  }
  return call('adminManage', { action: 'approveApply', id });
}
function rejectApplication(id) {
  if (!USE_CLOUD) {
    const i = MOCK_APPS.findIndex(a => a.id === id && a.status === 'pending');
    if (i >= 0) { MOCK_APPS.splice(i, 1); saveStore(STORE_APPS, MOCK_APPS); }
    return mockOk();
  }
  return call('adminManage', { action: 'rejectApply', id });
}

module.exports = {
  getCats, getCat, checkAdmin, catManage, addUpdate, listAdmins, adminManage, initAdmin,
  submitCat, listSubmissions, approveSubmission, rejectSubmission,
  applyAdmin, myApplication, listApplications, approveApplication, rejectApplication
};
