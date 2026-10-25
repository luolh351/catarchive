const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');

// 公开：校验当前用户是否为管理员，返回角色与可见备注（不返回 openid 给普通前端逻辑）
exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const res = await admins.where({ openid: OPENID }).get();
  if (!res.data || res.data.length === 0) {
    return { isAdmin: false };
  }
  const a = res.data[0];
  return {
    isAdmin: true,
    role: a.role,
    profile: {
      realName: a.realName,
      major: a.major,
      className: a.className,
      dorm: a.dorm,
      note: a.note
    }
  };
};
