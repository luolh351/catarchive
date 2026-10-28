const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const subs = db.collection('cat_submissions');

const GENDER = ['公', '母', '未知'];
const STER = ['已绝育', '未绝育', '未知'];
const LIFE = ['在校', '毕业', '休学', '喵星'];
const MAX = { name: 20, coat: 20, short: 30, note: 200, latest: 500, photos: 9, tag: 20, tags: 20 };

// ---------- 严格字段校验（公开接口，任何人可调用，必须服务端校验） ----------
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
  if (!Array.isArray(v)) return null;
  if (v.length > MAX.photos) return null;
  for (let i = 0; i < v.length; i++) if (!isRemote(v[i])) return null;
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
  if (!isStr(v)) return null;
  if (!v) return '';
  if (!isRemote(v)) return null;
  if (AUDIO_EXT.indexOf(voiceExt(v)) < 0) return null; // 非 mp3/wav → 拒绝
  return v;
}

// 公开：游客投稿。任何人可提交，落 cat_submissions（status=pending），不直发公开页
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const d = (event && event.data) || {};

  const name = takeStr(d.name, MAX.name);
  if (name === null || !name) return { ok: false, msg: '名字必填且≤20字（不能只有空格）' };

  const arrFields = [['aliases', '昵称'], ['personalityTags', '性格'], ['usualLocations', '常出没']];
  const arrays = {};
  for (let i = 0; i < arrFields.length; i++) {
    const key = arrFields[i][0];
    const v = takeArr(d[key], MAX.tag, MAX.tags);
    if (v === null) return { ok: false, msg: arrFields[i][1] + '格式错误' };
    arrays[key] = v;
  }
  const coatColorRaw = takeStr(d.coatColor, MAX.coat);
  if (coatColorRaw === null) return { ok: false, msg: '毛色格式错误' };
  const sterilizedAt = takeStr(d.sterilizedAt, MAX.short);
  if (sterilizedAt === null) return { ok: false, msg: '绝育时间格式错误' };
  const healthNotes = takeStr(d.healthNotes, MAX.note);
  if (healthNotes === null) return { ok: false, msg: '健康状况≤200字' };
  const latestNote = takeStr(d.latestNote, MAX.latest);
  if (latestNote === null) return { ok: false, msg: '最近情况≤500字' };
  if (d.gender !== undefined && !GENDER.includes(d.gender)) return { ok: false, msg: '性别枚举错误' };
  if (d.sterilizationStatus !== undefined && !STER.includes(d.sterilizationStatus)) return { ok: false, msg: '绝育枚举错误' };
  if (d.lifeStatus !== undefined && !LIFE.includes(d.lifeStatus)) return { ok: false, msg: '状态枚举错误' };
  const photos = takePhotos(d.photos);
  if (photos === null) return { ok: false, msg: '照片须为最多9项的云存储地址数组' };
  const voice = takeVoice(d.voice);
  if (voice === null) return { ok: false, msg: '音频须为 mp3 / wav 格式的云存储地址' };

  const life = d.lifeStatus || '在校';
  const data = {
    name,
    aliases: arrays.aliases,
    coatColor: coatColorRaw || '未知',
    gender: d.gender || '未知',
    sterilizationStatus: d.sterilizationStatus || '未知',
    sterilizedAt,
    personalityTags: arrays.personalityTags,
    usualLocations: arrays.usualLocations,
    healthNotes,
    latestNote,
    lifeStatus: life,
    isAdoptable: !!d.isAdoptable && life === '在校',
    photos,
    voice,
    status: 'pending',
    submitterOpenid: OPENID,
    createdAt: db.serverDate()
  };
  const add = await subs.add({ data });
  return { ok: true, id: add._id };
};
