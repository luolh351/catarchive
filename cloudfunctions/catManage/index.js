const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

const GENDER = ['公', '母', '未知'];
const STER = ['已绝育', '未绝育', '未知'];
const LIFE = ['在校', '毕业', '休学', '喵星'];
const MAX = { name: 20, coat: 20, short: 30, note: 200, latest: 500, photos: 9, tag: 20, tags: 20 };

// ---------- 严格字段校验（云端是安全边界，不能只依赖前端校验） ----------
function isStr(v) { return typeof v === 'string'; }
function takeStr(v, max) {
  if (v === undefined || v === null) return '';
  if (!isStr(v)) return null;                 // 非字符串 → 拒绝
  const s = v.trim();                          // 纯空格会被 trim 成空，由调用方判定
  return s.length > max ? null : s;            // 超长 → 拒绝
}
function takeArr(v, itemMax, countMax) {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : (isStr(v) ? v.split(/[,，、]/) : null);
  if (!list) return null;                     // 对象/数字 → 拒绝
  if (list.length > countMax) return null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!isStr(list[i])) return null;          // 数组里混入对象 → 拒绝
    const s = list[i].trim();
    if (!s) continue;
    if (s.length > itemMax) return null;
    out.push(s);
  }
  return out;
}
function isRemote(p) { return isStr(p) && (p.indexOf('cloud://') === 0 || /^https?:\/\//.test(p)); }
function takePhotos(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;          // 字符串形式的“照片列表” → 拒绝（旧实现会直接写入）
  if (v.length > MAX.photos) return null;
  for (let i = 0; i < v.length; i++) if (!isRemote(v[i])) return null; // 本地临时路径/非字符串 → 拒绝
  return v.slice();
}
function takeVoice(v) {
  if (v === undefined || v === null) return '';
  if (!isStr(v)) return null;                  // 对象形式的音频 → 拒绝
  if (!v) return '';
  return isRemote(v) ? v : null;
}
// requireName=true 时名字必须存在且 trim 后非空（空格名字会被拒绝）
function normalize(d, requireName) {
  d = d || {};
  const out = {};
  if (requireName || d.name !== undefined) {
    const n = takeStr(d.name, MAX.name);
    if (n === null || !n) return { err: '名字必填且为≤20字的非空字符串（不能只有空格）' };
    out.name = n;
  }
  const arrFields = [['aliases', '昵称'], ['personalityTags', '性格'], ['usualLocations', '常出没']];
  for (let i = 0; i < arrFields.length; i++) {
    const key = arrFields[i][0];
    if (d[key] === undefined) continue;
    const v = takeArr(d[key], MAX.tag, MAX.tags);
    if (v === null) return { err: arrFields[i][1] + '格式错误（须为字符串数组或逗号分隔字符串）' };
    out[key] = v;
  }
  if (d.sterilizedAt !== undefined) { const v = takeStr(d.sterilizedAt, MAX.short); if (v === null) return { err: '绝育时间格式错误' }; out.sterilizedAt = v; }
  if (d.healthNotes !== undefined) { const v = takeStr(d.healthNotes, MAX.note); if (v === null) return { err: '健康状况≤200字' }; out.healthNotes = v; }
  if (d.latestNote !== undefined) { const v = takeStr(d.latestNote, MAX.latest); if (v === null) return { err: '最近情况≤500字' }; out.latestNote = v; }
  if (d.coatColor !== undefined) { const v = takeStr(d.coatColor, MAX.coat); if (v === null) return { err: '毛色格式错误' }; out.coatColor = v || '未知'; }
  if (d.gender !== undefined) { if (!GENDER.includes(d.gender)) return { err: '性别枚举错误' }; out.gender = d.gender; }
  if (d.sterilizationStatus !== undefined) { if (!STER.includes(d.sterilizationStatus)) return { err: '绝育枚举错误' }; out.sterilizationStatus = d.sterilizationStatus; }
  if (d.lifeStatus !== undefined) { if (!LIFE.includes(d.lifeStatus)) return { err: '状态枚举错误' }; out.lifeStatus = d.lifeStatus; }
  if (d.isAdoptable !== undefined) out.isAdoptable = !!d.isAdoptable;
  if (d.photos !== undefined) { const v = takePhotos(d.photos); if (v === null) return { err: '照片须为最多9项的云存储地址数组（不接受本地临时路径）' }; out.photos = v; }
  if (d.voice !== undefined) { const v = takeVoice(d.voice); if (v === null) return { err: '音频须为云存储地址字符串' }; out.voice = v; }
  return { data: out };
}

async function auth(OPENID) {
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return null;
  return r.data[0];
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const me = await auth(OPENID);
  if (!me) return { ok: false, msg: '无权限' };

  const action = event && event.action;

  // 新增
  if (action === 'create') {
    const r = normalize(event.data || {}, true);
    if (r.err) return { ok: false, msg: r.err };
    const d = r.data;
    const now = db.serverDate();
    const life = d.lifeStatus || '在校';
    const data = Object.assign({
      aliases: [], personalityTags: [], usualLocations: [], sterilizedAt: '', healthNotes: '', latestNote: '',
      coatColor: '未知', gender: '未知', sterilizationStatus: '未知', photos: [], voice: '', isAdoptable: false
    }, d, {
      lifeStatus: life,
      isAdoptable: !!d.isAdoptable && life === '在校', // 不在“在校”不允许标记待领养
      published: true, createdAt: now, updatedAt: now, operatorOpenid: OPENID
    });
    const add = await cats.add({ data });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'catCreate', target: add._id, detail: data.name, createdAt: now } });
    return { ok: true, id: add._id };
  }

  // 更新：仅写入提供的字段
  if (action === 'update') {
    const id = event.id;
    if (!id) return { ok: false, msg: 'missing id' };
    const r = normalize(event.data || {}, false);
    if (r.err) return { ok: false, msg: r.err };
    const d = r.data;
    let ex;
    try {
      ex = await cats.doc(id).get();
    } catch (e) {
      return { ok: false, msg: '档案不存在' };
    }
    const exLife = (ex.data && ex.data.lifeStatus) || '在校';
    const patch = { updatedAt: db.serverDate(), operatorOpenid: OPENID };
    const keys = ['name', 'aliases', 'coatColor', 'gender', 'sterilizationStatus', 'sterilizedAt',
      'personalityTags', 'usualLocations', 'healthNotes', 'latestNote', 'lifeStatus', 'photos', 'voice'];
    for (let i = 0; i < keys.length; i++) {
      if (d[keys[i]] !== undefined) patch[keys[i]] = d[keys[i]];
    }
    const nextLife = d.lifeStatus !== undefined ? d.lifeStatus : exLife;
    if (d.isAdoptable !== undefined) patch.isAdoptable = !!d.isAdoptable && nextLife === '在校';
    // 统一业务规则：去向一旦不是“在校”，无论是否传 isAdoptable 都取消待领养
    if (nextLife !== '在校') patch.isAdoptable = false;
    await cats.doc(id).update({ data: patch });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'catUpdate', target: id, detail: d.name || '', createdAt: db.serverDate() } });
    return { ok: true };
  }

  // 归档（软删除，不物理删除）
  if (action === 'archive') {
    const id = event.id;
    if (!id) return { ok: false, msg: 'missing id' };
    await cats.doc(id).update({ data: { published: false, updatedAt: db.serverDate(), operatorOpenid: OPENID } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'catArchive', target: id, createdAt: db.serverDate() } });
    return { ok: true };
  }

  return { ok: false, msg: '未知 action' };
};
