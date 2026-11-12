const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const subs = db.collection('update_submissions');
const _ = db.command;

// 游客报近况（先审后显）：公开接口，无需管理员身份。
// 写入 update_submissions 待审核，管理员在管理台通过后才写入猫咪时间线。
// 服务端严格校验 + 基础限流（同一人未审积压上限 / 同猫同内容去重），防灌水。
const MAX_PHOTOS = 3;
const MAX_PENDING_PER_USER = 5;
function isRemote(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.indexOf('cloud://') === 0) return true;
  if (/^https?:\/\/tmp\//i.test(p)) return false;
  if (p.indexOf('wxfile://') === 0) return false;
  return /^https?:\/\//.test(p);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '身份获取失败，请重新进入小程序' };

  const catId = typeof (event || {}).catId === 'string' ? event.catId.trim() : '';
  const content = typeof event.content === 'string' ? event.content.trim() : '';
  if (!catId) return { ok: false, msg: '缺少猫咪 id' };
  if (!content || content.length > 500) return { ok: false, msg: '内容必填且≤500字' };

  const photos = Array.isArray(event.photos) ? event.photos.filter(isRemote) : [];
  if (photos.length !== (event.photos || []).length || photos.length > MAX_PHOTOS) {
    return { ok: false, msg: '配图须为最多3项的云存储地址' };
  }

  // 发生时间（可选）：格式 YYYY-MM-DD，不允许未来
  let occurredAt = '';
  if (event.occurredAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event.occurredAt))) return { ok: false, msg: '发生时间格式错误' };
    const t = new Date(event.occurredAt + 'T00:00:00+08:00');
    if (isNaN(t.getTime()) || t.getTime() > Date.now() + 86400000) return { ok: false, msg: '发生时间不能是未来' };
    occurredAt = event.occurredAt;
  }

  // 猫须存在且公开
  let cat = null;
  try { cat = await cats.doc(catId).get(); } catch (e) { cat = null; }
  if (!cat || !cat.data || cat.data.published === false) return { ok: false, msg: '猫咪不存在或已归档' };

  // 基础限流：同一openid未审积压 ≤ MAX_PENDING_PER_USER；同猫同内容待审去重
  try {
    const mine = await subs.where({ submitterOpenid: OPENID, status: 'pending' }).count();
    if ((mine.total || 0) >= MAX_PENDING_PER_USER) {
      return { ok: false, msg: '你有多条近况待审核，请耐心等待管理员处理' };
    }
    const dup = await subs.where({ catId, content, status: 'pending' }).count();
    if ((dup.total || 0) > 0) return { ok: false, msg: '相同内容已提交过，请等待审核' };
  } catch (e) { /* 限流查询失败不阻断提交 */ }

  await subs.add({
    data: {
      catId, catName: cat.data.name || '',
      content, photos,
      occurredAt,
      status: 'pending',
      submitterOpenid: OPENID,
      createdAt: db.serverDate()
    }
  });
  return { ok: true };
};
