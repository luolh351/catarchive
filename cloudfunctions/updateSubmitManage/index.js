const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');
const subs = db.collection('update_submissions');
const updates = db.collection('cat_updates');
const logs = db.collection('admin_audit_logs');

// 管理台：游客近况投稿管理（list 列待审 / approve 通过 / reject 拒绝）。
// 通过 = 把投稿写入 cat_updates 时间线（与 updateCreate 同一套时间/摘要规则），并标记投稿已审。
const MAX_PHOTOS = 3;
function isRemote(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.indexOf('cloud://') === 0) return true;
  if (/^https?:\/\/tmp\//i.test(p)) return false;
  if (p.indexOf('wxfile://') === 0) return false;
  return /^https?:\/\//.test(p);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const r = await admins.where({ openid: OPENID }).get();
  if (!r.data || r.data.length === 0) return { ok: false, msg: '无权限' };
  const action = (event || {}).action;

  // ---------- 待审列表：旧→新，便于按提交顺序处理 ----------
  if (action === 'list') {
    const res = await subs.where({ status: 'pending' }).orderBy('createdAt', 'asc').limit(50).get();
    return {
      ok: true,
      list: (res.data || []).map(s => ({
        id: s._id, catId: s.catId, catName: s.catName || '', content: s.content || '',
        photos: Array.isArray(s.photos) ? s.photos : [],
        occurredAt: s.occurredAt || '', submitterOpenid: s.submitterOpenid || '',
        createdAt: s.createdAt
      }))
    };
  }

  if (action !== 'approve' && action !== 'reject') return { ok: false, msg: '未知 action' };
  const id = typeof event.id === 'string' ? event.id : '';
  if (!id) return { ok: false, msg: '缺少投稿 id' };
  const now = db.serverDate();

  // ---------- 拒绝：仅改状态（幂等：非 pending 直接返回） ----------
  if (action === 'reject') {
    const doc = await subs.doc(id).get().catch(() => null);
    if (!doc || !doc.data) return { ok: false, msg: '未找到该投稿' };
    if (doc.data.status !== 'pending') return { ok: true };
    await subs.doc(id).update({ data: { status: 'rejected', reviewedAt: now, reviewerOpenid: OPENID } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'updateSubmitReject', target: id, detail: (doc.data.content || '').slice(0, 50), createdAt: now } });
    return { ok: true };
  }

  // ---------- 通过：事务内写时间线 + 更新摘要 + 标记投稿，防止重复通过 ----------
  // 发生时间/新旧判断在事务外计算（事务内不支持 where 查询，与 updateCreate 同做法）；
  // 事务内复查 status 防重复通过。
  let reason = '';
  let createTime = now;
  let isNewest = true;
  const pre = await subs.doc(id).get().catch(() => null);
  if (!pre || !pre.data) return { ok: false, msg: '未找到该投稿' };
  if (pre.data.status !== 'pending') return { ok: true };   // 已处理过（幂等）
  if (pre.data.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(String(pre.data.occurredAt))) {
    const t = new Date(pre.data.occurredAt + 'T00:00:00+08:00');
    if (!isNaN(t.getTime()) && t.getTime() <= Date.now() + 86400000) {
      createTime = t;
      const top1 = await updates.where({ catId: pre.data.catId }).orderBy('createdAt', 'desc').limit(1).get();
      const latest = (top1.data || [])[0];
      if (latest && latest.createdAt) {
        const lt = latest.createdAt instanceof Date ? latest.createdAt.getTime() : new Date(latest.createdAt).getTime();
        isNewest = t.getTime() >= (isNaN(lt) ? 0 : lt);
      }
    }
  }
  try {
    await db.runTransaction(async tx => {
      let sub = null;
      try { sub = await tx.collection('update_submissions').doc(id).get(); } catch (e) { sub = null; }
      if (!sub || !sub.data) { reason = 'NO_SUB'; throw new Error('tx_abort'); }
      if (sub.data.status !== 'pending') { reason = 'DUP'; throw new Error('tx_abort'); }
      const s = sub.data;
      const catId = s.catId;

      // 猫须存在且公开
      let cat = null;
      try { cat = await tx.collection('cats').doc(catId).get(); } catch (e) { cat = null; }
      if (!cat || !cat.data || cat.data.published === false) { reason = 'NO_CAT'; throw new Error('tx_abort'); }

      const imgs = (Array.isArray(s.photos) ? s.photos : []).filter(isRemote).slice(0, MAX_PHOTOS);
      const text = (s.content || '').trim();
      await tx.collection('cat_updates').add({ data: { catId, content: text, photos: imgs, createdAt: createTime, operatorOpenid: s.submitterOpenid || OPENID, viaSubmission: id } });
      if (isNewest) {
        await tx.collection('cats').doc(catId).update({ data: { latestNote: text, updatedAt: now, operatorOpenid: OPENID } });
      }
      await tx.collection('update_submissions').doc(id).update({ data: { status: 'approved', reviewedAt: now, reviewerOpenid: OPENID } });
      await tx.collection('admin_audit_logs').add({ data: { operatorOpenid: OPENID, action: 'updateSubmitApprove', target: catId, detail: text.slice(0, 50), createdAt: now } });
    });
  } catch (e) {
    if (reason === 'NO_SUB') return { ok: false, msg: '未找到该投稿' };
    if (reason === 'DUP') return { ok: true };   // 已被处理过，视为成功（幂等）
    if (reason === 'NO_CAT') return { ok: false, msg: '猫咪不存在或已归档，无法通过' };
    return { ok: false, msg: '审核失败（已回滚）：' + ((e && e.message) || '未知错误') };
  }
  return { ok: true };
};
