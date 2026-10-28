const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const updates = db.collection('cat_updates');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

// 管理员：追加近况时间线，并同步 latestNote / updatedAt
// 用事务保证原子性：猫咪不存在（或并发中已归档/删除）时整体回滚，不会留下孤立的时间线记录
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return { ok: false, msg: '无权限' };
  const { catId, content } = event || {};
  if (!catId) return { ok: false, msg: '缺少猫咪 id' };
  if (typeof content !== 'string' || !content.trim() || content.length > 500) {
    return { ok: false, msg: '内容必填且≤500字' };
  }
  const text = content.trim();
  const now = db.serverDate();

  let reason = '';
  try {
    await db.runTransaction(async tx => {
      // 事务内只使用受支持的 doc().get()/update() 与 add()
      let cat = null;
      try {
        cat = await tx.collection('cats').doc(catId).get();
      } catch (e) {
        cat = null;
      }
      if (!cat || !cat.data) { reason = 'NO_CAT'; throw new Error('tx_abort'); }
      await tx.collection('cat_updates').add({ data: { catId, content: text, createdAt: now, operatorOpenid: OPENID } });
      await tx.collection('cats').doc(catId).update({ data: { latestNote: text, updatedAt: now, operatorOpenid: OPENID } });
    });
  } catch (e) {
    if (reason === 'NO_CAT') return { ok: false, msg: '猫咪不存在，近况未写入' };
    return { ok: false, msg: '补充近况失败（已回滚）：' + ((e && e.message) || '未知错误') };
  }
  await logs.add({ data: { operatorOpenid: OPENID, action: 'updateCreate', target: catId, detail: text.slice(0, 50), createdAt: db.serverDate() } });
  return { ok: true };
};
