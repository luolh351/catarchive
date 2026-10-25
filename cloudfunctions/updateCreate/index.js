const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const updates = db.collection('cat_updates');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

// 管理员：追加近况时间线，并同步 latestNote / updatedAt
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return { ok: false, msg: '无权限' };
  const { catId, content } = event || {};
  if (!catId || !content || content.length > 500) return { ok: false, msg: '内容必填且≤500字' };
  const now = db.serverDate();
  await updates.add({ data: { catId, content, createdAt: now, operatorOpenid: OPENID } });
  await cats.doc(catId).update({ data: { latestNote: content, updatedAt: now, operatorOpenid: OPENID } });
  await logs.add({ data: { operatorOpenid: OPENID, action: 'updateCreate', target: catId, detail: content.slice(0, 50), createdAt: now } });
  return { ok: true };
};
