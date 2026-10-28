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

    // 事务外先做校验（事务只支持 doc().get/update 与 add，不支持 where().get()）
    const t = await admins.where({ openid }).get().catch(() => null);
    if (!t || !t.data || !t.data.length) return { ok: false, msg: '目标不存在' };
    if (t.data[0].role !== 'editor') return { ok: false, msg: '只能转让给普通管理员' };
    const myDoc = me.data[0];
    const targetId = t.data[0]._id;
    const myId = myDoc._id;

    let reason = '';
    try {
      await db.runTransaction(async tx => {
        // 事务内用受支持的 doc().get() 重新校验，防止事务外校验后被并发改动
        const [cur, tgt] = await Promise.all([
          tx.collection('admin_users').doc(myId).get(),
          tx.collection('admin_users').doc(targetId).get()
        ]);
        if (!cur.data || cur.data.role !== 'superadmin') { reason = 'NOT_SUPER'; throw new Error('tx_abort'); }
        if (!tgt.data || tgt.data.role !== 'editor') { reason = 'NOT_EDITOR'; throw new Error('tx_abort'); }
        await tx.collection('admin_users').doc(targetId).update({ data: { role: 'superadmin' } });
        await tx.collection('admin_users').doc(myId).update({ data: { role: 'editor' } });
        await tx.collection('admin_audit_logs').add({ data: { operatorOpenid: OPENID, action: 'adminTransfer', target: openid, createdAt: now } });
      });
      return { ok: true };
    } catch (e) {
      // runTransaction 抛错会自动回滚；按 reason 给出明确原因
      if (reason === 'NOT_SUPER') return { ok: false, msg: '仅超级管理员可操作' };
      if (reason === 'NOT_EDITOR') return { ok: false, msg: '目标不是普通管理员' };
      return { ok: false, msg: '转让失败：' + ((e && e.message) || '未知错误') };
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
