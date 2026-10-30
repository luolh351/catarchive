const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const updates = db.collection('cat_updates');
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');

// 近况配图：最多 3 张，必须是云存储地址（拒绝 http://tmp/、wxfile:// 等本地临时路径）
const MAX_PHOTOS = 3;
function isRemote(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.indexOf('cloud://') === 0) return true;
  if (/^https?:\/\/tmp\//i.test(p)) return false;
  if (p.indexOf('wxfile://') === 0) return false;
  return /^https?:\/\//.test(p);
}
function takePhotos(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  if (v.length > MAX_PHOTOS) return null;
  for (let i = 0; i < v.length; i++) if (!isRemote(v[i])) return null;
  return v.slice();
}

// 管理员：追加近况时间线，并同步 latestNote / updatedAt
// 用事务保证原子性：猫咪不存在（或并发中已归档/删除）时整体回滚，不会留下孤立的时间线记录
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return { ok: false, msg: '无权限' };
  const { catId, content, photos } = event || {};
  if (!catId) return { ok: false, msg: '缺少猫咪 id' };
  if (typeof content !== 'string' || !content.trim() || content.length > 500) {
    return { ok: false, msg: '内容必填且≤500字' };
  }
  const imgs = takePhotos(photos);
  if (imgs === null) return { ok: false, msg: '近况配图须为最多3项的云存储地址数组' };
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
      await tx.collection('cat_updates').add({ data: { catId, content: text, photos: imgs, createdAt: now, operatorOpenid: OPENID } });
      await tx.collection('cats').doc(catId).update({ data: { latestNote: text, updatedAt: now, operatorOpenid: OPENID } });
    });
  } catch (e) {
    if (reason === 'NO_CAT') return { ok: false, msg: '猫咪不存在，近况未写入' };
    return { ok: false, msg: '补充近况失败（已回滚）：' + ((e && e.message) || '未知错误') };
  }
  await logs.add({ data: { operatorOpenid: OPENID, action: 'updateCreate', target: catId, detail: text.slice(0, 50), createdAt: db.serverDate() } });
  return { ok: true };
};
