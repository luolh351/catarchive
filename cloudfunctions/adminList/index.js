const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');
const _ = db.command;

// 仅超级管理员：返回管理员名单（含 openid，供转让/撤权操作；服务端仍以调用者身份重校验）
// 注意过滤 role='seat' 的并发占位文档（initAdmin 用于防止产生多个超级管理员，不是真实管理员）
exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const me = await admins.where({ openid: OPENID }).get();
  if (!me.data || me.data.length === 0 || me.data[0].role !== 'superadmin') {
    return { ok: false, msg: '仅超级管理员可查看' };
  }
  const res = await admins.where({ role: _.neq('seat') }).orderBy('createdAt', 'asc').limit(100).get();
  const list = (res.data || []).map(a => ({
    openid: a.openid,
    role: a.role,
    realName: a.realName,
    major: a.major,
    className: a.className,
    dorm: a.dorm,
    note: a.note
  }));
  return { ok: true, list };
};
