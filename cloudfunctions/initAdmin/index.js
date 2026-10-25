const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');

// 仅当 admin_users 为空时，把当前调用者设为首位超级管理员（防重复初始化）
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const count = await admins.count();
  if (count.total > 0) {
    return { ok: false, msg: '已初始化，禁止重复初始化' };
  }
  const doc = {
    openid: OPENID,
    role: 'superadmin',
    realName: (event && event.realName) || '超级管理员',
    major: (event && event.major) || '',
    className: (event && event.className) || '',
    dorm: (event && event.dorm) || '',
    note: (event && event.note) || '',
    createdAt: db.serverDate(),
    createdBy: OPENID
  };
  await admins.add({ data: doc });
  return { ok: true, role: 'superadmin' };
};
