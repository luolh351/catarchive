const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const subs = db.collection('cat_submissions');

function toArr(v) {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v;
  return String(v).split(/[,，、]/).map(s => s.trim()).filter(Boolean);
}

// 公开：游客投稿。任何人可提交，落 cat_submissions（status=pending），不直发公开页
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const d = event.data || {};
  if (!d.name || !d.name.trim() || d.name.length > 20) return { ok: false, msg: '名字必填且≤20字' };
  if (d.coatColor !== undefined && (typeof d.coatColor !== 'string' || d.coatColor.length > 20)) return { ok: false, msg: '毛色格式错误' };
  if (d.gender && !['公', '母', '未知'].includes(d.gender)) return { ok: false, msg: '性别枚举错误' };
  if (d.sterilizationStatus && !['已绝育', '未绝育', '未知'].includes(d.sterilizationStatus)) return { ok: false, msg: '绝育枚举错误' };
  if (d.lifeStatus && !['在校', '毕业', '休学', '喵星'].includes(d.lifeStatus)) return { ok: false, msg: '状态枚举错误' };

  const now = db.serverDate();
  const data = {
    name: d.name.trim(),
    aliases: toArr(d.aliases) || [],
    coatColor: d.coatColor || '未知',
    gender: d.gender || '未知',
    sterilizationStatus: d.sterilizationStatus || '未知',
    sterilizedAt: d.sterilizedAt || '',
    personalityTags: toArr(d.personalityTags) || [],
    usualLocations: toArr(d.usualLocations) || [],
    healthNotes: d.healthNotes || '',
    latestNote: d.latestNote || '',
    lifeStatus: d.lifeStatus || '在校',
    isAdoptable: !!d.isAdoptable && (d.lifeStatus || '在校') === '在校',
    photos: d.photos || [],
    voice: d.voice || '',
    status: 'pending',
    submitterOpenid: OPENID,
    createdAt: now
  };
  const add = await subs.add({ data });
  return { ok: true, id: add._id };
};
