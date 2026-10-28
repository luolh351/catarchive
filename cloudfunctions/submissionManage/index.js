const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const subs = db.collection('cat_submissions');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

const GENDER = ['公', '母', '未知'];
const STER = ['已绝育', '未绝育', '未知'];
const LIFE = ['在校', '毕业', '休学', '喵星'];
const MAX = { name: 20, coat: 20, short: 30, note: 200, latest: 500, photos: 9, tag: 20, tags: 20 };

// ---------- 严格字段校验（云端不信任客户端；与 catManage / catSubmit 一致） ----------
function isStr(v) { return typeof v === 'string'; }
function takeStr(v, max) {
  if (v === undefined || v === null) return '';
  if (!isStr(v)) return null;
  const s = v.trim();
  return s.length > max ? null : s;
}
function takeArr(v, itemMax, countMax) {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : (isStr(v) ? v.split(/[,，、]/) : null);
  if (!list) return null;
  if (list.length > countMax) return null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!isStr(list[i])) return null;
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
  if (!Array.isArray(v)) return null;               // 字符串形式的照片列表 → 拒绝
  if (v.length > MAX.photos) return null;
  for (let i = 0; i < v.length; i++) if (!isRemote(v[i])) return null; // 本地临时路径 → 拒绝
  return v.slice();
}
// 叫声仅允许 mp3 / wav
const AUDIO_EXT = ['mp3', 'wav'];
function voiceExt(v) {
  const m = String(v).toLowerCase().split('?')[0].match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}
function takeVoice(v) {
  if (v === undefined || v === null) return '';
  if (!isStr(v)) return null;                       // 对象形式的音频 → 拒绝
  if (!v) return '';
  if (!isRemote(v)) return null;
  if (AUDIO_EXT.indexOf(voiceExt(v)) < 0) return null; // 非 mp3/wav → 拒绝
  return v;
}
function normalize(d, requireName) {
  d = d || {};
  const out = {};
  if (requireName || d.name !== undefined) {
    const n = takeStr(d.name, MAX.name);
    if (n === null || !n) return { err: '名字必填且为≤20字的非空字符串' };
    out.name = n;
  }
  const fields = [
    ['aliases', MAX.tag, MAX.tags, '昵称'],
    ['personalityTags', MAX.tag, MAX.tags, '性格'],
    ['usualLocations', MAX.tag, MAX.tags, '常出没']
  ];
  for (let i = 0; i < fields.length; i++) {
    const key = fields[i][0];
    if (d[key] === undefined) continue;
    const v = takeArr(d[key], fields[i][1], fields[i][2]);
    if (v === null) return { err: fields[i][3] + '格式错误（须为字符串数组或逗号分隔字符串）' };
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
  if (d.voice !== undefined) { const v = takeVoice(d.voice); if (v === null) return { err: '音频须为 mp3 / wav 格式的云存储地址' }; out.voice = v; }
  return { data: out };
}

async function auth(OPENID) {
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return null;
  return r.data[0];
}

// 管理员：待审投稿的列表/采纳/忽略
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const me = await auth(OPENID);
  if (!me) return { ok: false, msg: '无权限' };

  const action = event && event.action;

  if (action === 'list') {
    const r = await subs.where({ status: 'pending' }).orderBy('createdAt', 'asc').get();
    const list = (r.data || []).map(s => ({
      id: s._id, name: s.name, aliases: s.aliases || [], coatColor: s.coatColor, gender: s.gender,
      sterilizationStatus: s.sterilizationStatus, sterilizedAt: s.sterilizedAt || '', usualLocations: s.usualLocations || [],
      healthNotes: s.healthNotes || '', latestNote: s.latestNote || '', lifeStatus: s.lifeStatus,
      personalityTags: s.personalityTags || [],   // 审核页要展示性格，与 mock 返回字段保持一致
      isAdoptable: !!s.isAdoptable, photos: s.photos || [], voice: s.voice || '',
      submitterOpenid: s.submitterOpenid || '', createdAt: s.createdAt
    }));
    return { ok: true, list };
  }

  if (action === 'approve') {
    const id = event.id;
    if (!id) return { ok: false, msg: 'missing id' };
    const s = await subs.doc(id).get();
    const d = s.data;
    if (!d || d.status !== 'pending') return { ok: false, msg: '投稿不存在或已处理' };

    // 采纳前同样做严格校验，避免把不合规数据带进公开档案
    const n = normalize(d, true);
    if (n.err) return { ok: false, msg: '投稿数据不合规，无法采纳：' + n.err };
    const nd = n.data;
    const now = db.serverDate();
    const life = nd.lifeStatus || '在校';
    const catData = Object.assign({
      aliases: [], personalityTags: [], usualLocations: [], sterilizedAt: '', healthNotes: '', latestNote: '',
      coatColor: '未知', gender: '未知', sterilizationStatus: '未知', photos: [], voice: ''
    }, nd, {
      lifeStatus: life,
      isAdoptable: !!nd.isAdoptable && life === '在校',
      published: true, createdAt: now, updatedAt: now, operatorOpenid: OPENID
    });

    // 事务防重复建档：并发采纳同一投稿时，两个事务都会写同一条 submission 文档，
    // 后提交的会因写冲突失败并回滚，因此只会产生一条猫咪记录。
    const newId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let reason = '';
    try {
      await db.runTransaction(async tx => {
        const cur = await tx.collection('cat_submissions').doc(id).get();
        if (!cur.data || cur.data.status !== 'pending') { reason = 'DONE'; throw new Error('tx_abort'); }
        await tx.collection('cats').add({ data: Object.assign({ _id: newId }, catData) });
        await tx.collection('cat_submissions').doc(id).update({ data: { status: 'approved', approvedCatId: newId } });
      });
    } catch (e) {
      if (reason === 'DONE') return { ok: false, msg: '该投稿已被处理，未重复建档' };
      return { ok: false, msg: '采纳失败（已回滚）：' + ((e && e.message) || '未知错误') };
    }
    await logs.add({ data: { operatorOpenid: OPENID, action: 'subApprove', target: id, detail: catData.name, createdAt: db.serverDate() } });
    return { ok: true, id: newId };
  }

  if (action === 'reject') {
    const id = event.id;
    if (!id) return { ok: false, msg: 'missing id' };
    await subs.doc(id).update({ data: { status: 'rejected' } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'subReject', target: id, createdAt: db.serverDate() } });
    return { ok: true };
  }

  return { ok: false, msg: '未知 action' };
};
