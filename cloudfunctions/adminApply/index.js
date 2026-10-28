const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');
const apps = db.collection('admin_applications');

// 公开：任何人可提交管理员申请或查询自己的申请状态。
// openid 由云端 getWXContext 获取——申请人无需（也无法）手动提供 openid。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event && event.action;
  const now = db.serverDate();

  if (action === 'submit') {
    const p = (event && event.profile) || {};
    // 必填校验（与前端一致；云端必须独立校验，不能只信前端）
    if (!p.realName) return { ok: false, msg: '请填写姓名' };
    if (!p.major) return { ok: false, msg: '请填写专业' };
    if (!p.className) return { ok: false, msg: '请填写班级' };
    if (!p.dorm) return { ok: false, msg: '请填写宿舍' };
    const isAdmin = await admins.where({ openid: OPENID }).get();
    if (isAdmin.data && isAdmin.data.length) return { ok: false, msg: '你已是管理员' };
    const dup = await apps.where({ openid: OPENID, status: 'pending' }).get();
    if (dup.data && dup.data.length) return { ok: false, msg: '你已有待审核的申请' };
    await apps.add({
      data: {
        openid: OPENID,
        realName: p.realName || '',
        major: p.major || '',
        className: p.className || '',
        dorm: p.dorm || '',
        note: p.note || '',
        status: 'pending',
        createdAt: now
      }
    });
    return { ok: true };
  }

  if (action === 'mine') {
    const r = await apps.where({ openid: OPENID, status: 'pending' }).get();
    const a = (r.data && r.data[0]) || null;
    return { ok: true, app: a ? { id: a._id, status: a.status, createdAt: a.createdAt } : null };
  }

  return { ok: false, msg: '未知 action' };
};
