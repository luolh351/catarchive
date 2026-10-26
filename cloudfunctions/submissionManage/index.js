const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const subs = db.collection('cat_submissions');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

async function auth(OPENID) {
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return null;
  return r.data[0];
}
function toArr(v) {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v;
  return String(v).split(/[,，、]/).map(s => s.trim()).filter(Boolean);
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
    const now = db.serverDate();
    const catData = {
      name: d.name, aliases: d.aliases || [], coatColor: d.coatColor || '未知', gender: d.gender || '未知',
      sterilizationStatus: d.sterilizationStatus || '未知', sterilizedAt: d.sterilizedAt || '',
      personalityTags: d.personalityTags || [], usualLocations: d.usualLocations || [],
      healthNotes: d.healthNotes || '', latestNote: d.latestNote || '', lifeStatus: d.lifeStatus || '在校',
      isAdoptable: !!d.isAdoptable && (d.lifeStatus || '在校') === '在校', photos: d.photos || [], voice: d.voice || '',
      published: true, createdAt: now, updatedAt: now, operatorOpenid: OPENID
    };
    const add = await cats.add({ data: catData });
    await subs.doc(id).update({ data: { status: 'approved', approvedCatId: add._id } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'subApprove', target: id, detail: d.name, createdAt: now } });
    return { ok: true };
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
