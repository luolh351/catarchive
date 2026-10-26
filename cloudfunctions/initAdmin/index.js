const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');

// 仅在无人时为调用者初始化首位超级管理员；事务保证并发下只初始化一次（防重复写入）
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const tx = await db.startTransaction();
  try {
    const c = await tx.collection('admin_users').where({ role: 'superadmin' }).count();
    if (c.total > 0) { await tx.rollback(); return { ok: false, msg: '已初始化，禁止重复初始化' }; }
    await tx.collection('admin_users').add({
      data: {
        openid: OPENID, role: 'superadmin',
        realName: (event && event.realName) || '超级管理员',
        major: (event && event.major) || '', className: (event && event.className) || '',
        dorm: (event && event.dorm) || '', note: (event && event.note) || '',
        createdAt: db.serverDate(), createdBy: OPENID
      }
    });
    await tx.commit();
    return { ok: true, role: 'superadmin' };
  } catch (e) {
    await tx.rollback();
    return { ok: false, msg: '初始化失败' };
  }
};
