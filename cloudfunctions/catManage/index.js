const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const cats = db.collection('cats');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

const COAT = ['橘白', '黑白', '狸花', '白', '其他', '未知'];
const GENDER = ['公', '母', '未知'];
const STER = ['已绝育', '未绝育', '未知'];
const LIFE = ['在校', '毕业', '休学', '喵星'];

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
    const d = event.data || {};
    if (!d.name || d.name.length > 20) return { ok: false, msg: '名字必填且≤20字' };
    if (d.coatColor && !COAT.includes(d.coatColor)) return { ok: false, msg: '毛色枚举错误' };
    if (d.gender && !GENDER.includes(d.gender)) return { ok: false, msg: '性别枚举错误' };
    if (d.sterilizationStatus && !STER.includes(d.sterilizationStatus)) return { ok: false, msg: '绝育枚举错误' };
    if (d.lifeStatus && !LIFE.includes(d.lifeStatus)) return { ok: false, msg: '状态枚举错误' };
    const now = db.serverDate();
    const data = {
      name: d.name,
      aliases: d.aliases || [],
      coatColor: d.coatColor || '未知',
      gender: d.gender || '未知',
      sterilizationStatus: d.sterilizationStatus || '未知',
      sterilizedAt: d.sterilizedAt || '',
      personalityTags: d.personalityTags || [],
      usualLocations: d.usualLocations || [],
      healthNotes: d.healthNotes || '',
      latestNote: d.latestNote || '',
      lifeStatus: d.lifeStatus || '在校',
      isAdoptable: !!d.isAdoptable && d.lifeStatus === '在校',
      photos: d.photos || [],
      voice: d.voice || '',
      published: true,
      createdAt: now,
      updatedAt: now,
      operatorOpenid: OPENID
    };
    const add = await cats.add({ data });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'catCreate', target: add._id, detail: d.name, createdAt: now } });
    return { ok: true, id: add._id };
  }

  // 更新
  if (action === 'update') {
    const id = event.id;
    if (!id) return { ok: false, msg: 'missing id' };
    const d = event.data || {};
    if (d.coatColor && !COAT.includes(d.coatColor)) return { ok: false, msg: '毛色枚举错误' };
    if (d.gender && !GENDER.includes(d.gender)) return { ok: false, msg: '性别枚举错误' };
    if (d.sterilizationStatus && !STER.includes(d.sterilizationStatus)) return { ok: false, msg: '绝育枚举错误' };
    if (d.lifeStatus && !LIFE.includes(d.lifeStatus)) return { ok: false, msg: '状态枚举错误' };
    const patch = {
      name: d.name, aliases: d.aliases, coatColor: d.coatColor, gender: d.gender,
      sterilizationStatus: d.sterilizationStatus, sterilizedAt: d.sterilizedAt,
      personalityTags: d.personalityTags, usualLocations: d.usualLocations,
      healthNotes: d.healthNotes, latestNote: d.latestNote, lifeStatus: d.lifeStatus,
      isAdoptable: !!d.isAdoptable && d.lifeStatus === '在校',
      updatedAt: db.serverDate(), operatorOpenid: OPENID
    };
    Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k]);
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
