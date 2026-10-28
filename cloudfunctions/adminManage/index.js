const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');
const logs = db.collection('admin_audit_logs');
const apps = db.collection('admin_applications');

// 仅超级管理员：add / remove / transfer（转让用事务保证原子，避免并发产生多个超级管理员）
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const me = await admins.where({ openid: OPENID }).get();
  if (!me.data || me.data.length === 0 || me.data[0].role !== 'superadmin') {
    return { ok: false, msg: '仅超级管理员可操作' };
  }
  const action = event && event.action;
  const now = db.serverDate();

  if (action === 'add') {
    const { openid, realName, major, className, dorm, note } = event;
    if (!openid) return { ok: false, msg: '缺少 openid' };
    const exist = await admins.where({ openid }).get();
    if (exist.data && exist.data.length) return { ok: false, msg: '已是管理员' };
    await admins.add({ data: { openid, role: 'editor', realName: realName || '', major: major || '', className: className || '', dorm: dorm || '', note: note || '', createdAt: now, createdBy: OPENID } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'adminAdd', target: openid, detail: realName || '', createdAt: now } });
    return { ok: true };
  }

  if (action === 'remove') {
    const { openid } = event;
    if (!openid) return { ok: false, msg: '缺少 openid' };
    if (openid === OPENID) return { ok: false, msg: '不能移除自己' };
    const t = await admins.where({ openid }).get();
    if (!t.data || !t.data.length) return { ok: false, msg: '目标不存在' };
    if (t.data[0].role === 'superadmin') return { ok: false, msg: '不能移除超级管理员' };
    await admins.doc(t.data[0]._id).remove();
    await logs.add({ data: { operatorOpenid: OPENID, action: 'adminRemove', target: openid, createdAt: now } });
    return { ok: true };
  }

  if (action === 'transfer') {
    const { openid } = event;
    if (!openid) return { ok: false, msg: '缺少 openid' };
    if (openid === OPENID) return { ok: false, msg: '不能转让给自己' };
    const tx = await db.startTransaction();
    try {
      const t = await tx.collection('admin_users').where({ openid }).get();
      if (!t.data || !t.data.length) { await tx.rollback(); return { ok: false, msg: '目标不存在' }; }
      if (t.data[0].role !== 'editor') { await tx.rollback(); return { ok: false, msg: '只能转让给管理员' }; }
      const m = await tx.collection('admin_users').where({ openid: OPENID }).get();
      if (!m.data || !m.data.length || m.data[0].role !== 'superadmin') { await tx.rollback(); return { ok: false, msg: '仅超级管理员可操作' }; }
      await tx.collection('admin_users').doc(t.data[0]._id).update({ data: { role: 'superadmin' } });
      await tx.collection('admin_users').doc(m.data[0]._id).update({ data: { role: 'editor' } });
      await tx.collection('admin_audit_logs').add({ data: { operatorOpenid: OPENID, action: 'adminTransfer', target: openid, createdAt: now } });
      await tx.commit();
      return { ok: true };
    } catch (e) {
      await tx.rollback();
      return { ok: false, msg: '转让失败' };
    }
  }

  // 待认领的申请列表（超级管理员可见，不暴露 openid）
  if (action === 'listApply') {
    const r = await apps.where({ status: 'pending' }).orderBy('createdAt', 'asc').get();
    const list = (r.data || []).map(a => ({
      id: a._id, realName: a.realName || '', major: a.major || '', className: a.className || '',
      dorm: a.dorm || '', note: a.note || '', createdAt: a.createdAt
    }));
    return { ok: true, list };
  }

  // 通过申请：写入 admin_users(editor) 并把申请标记 approved
  if (action === 'approveApply') {
    const { id } = event;
    if (!id) return { ok: false, msg: '缺少申请 id' };
    const a = await apps.doc(id).get().catch(() => null);
    if (!a || !a.data || a.data.status !== 'pending') return { ok: false, msg: '申请不存在或已处理' };
    const openid = a.data.openid;
    const exist = await admins.where({ openid }).get();
    if (exist.data && exist.data.length) {
      await apps.doc(id).update({ data: { status: 'approved' } });
      return { ok: false, msg: '该用户已是管理员' };
    }
    await admins.add({
      data: {
        openid, role: 'editor',
        realName: a.data.realName || '', major: a.data.major || '', className: a.data.className || '',
        dorm: a.data.dorm || '', note: a.data.note || '', createdAt: now, createdBy: OPENID
      }
    });
    await apps.doc(id).update({ data: { status: 'approved' } });
    await logs.add({ data: { operatorOpenid: OPENID, action: 'adminApprove', target: openid, detail: a.data.realName || '', createdAt: now } });
    return { ok: true };
  }

  // 忽略申请
  if (action === 'rejectApply') {
    const { id } = event;
    if (!id) return { ok: false, msg: '缺少申请 id' };
    await apps.doc(id).update({ data: { status: 'rejected' } }).catch(() => null);
    await logs.add({ data: { operatorOpenid: OPENID, action: 'adminRejectApply', target: id, createdAt: now } });
    return { ok: true };
  }

  return { ok: false, msg: '未知 action' };
};
