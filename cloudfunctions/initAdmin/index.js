const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');

// 仅在无人时为调用者初始化首位超级管理员。
// 事务写法要点：云开发事务的 collection 只支持 doc().get()/update()/remove()/set() 与 add()，
// 不支持 where().get() 或 count()。因此：校验放事务外（普通查询），事务内只做写入。
// 并发兜底：建议把 admin_users.openid 建为“唯一”索引，并发时第二条写入会被数据库拒绝。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  // 事务外预检（覆盖绝大多数情况，失败即快速返回）
  const pre = await admins.where({ role: 'superadmin' }).get().catch(() => null);
  if (pre && pre.data && pre.data.length) {
    return { ok: false, msg: '已初始化，禁止重复初始化' };
  }
  const mine = await admins.where({ openid: OPENID }).get().catch(() => null);
  if (mine && mine.data && mine.data.length) {
    return { ok: false, msg: '你已在管理员名单中' };
  }

  const profile = event || {};
  try {
    await db.runTransaction(async tx => {
      // 事务内仅执行受支持的写操作
      await tx.collection('admin_users').add({
        data: {
          openid: OPENID, role: 'superadmin',
          realName: profile.realName || '超级管理员',
          major: profile.major || '', className: profile.className || '',
          dorm: profile.dorm || '', note: profile.note || '',
          createdAt: db.serverDate(), createdBy: OPENID
        }
      });
    });
    return { ok: true, role: 'superadmin' };
  } catch (e) {
    // 唯一索引冲突（并发重复初始化）时给出明确提示，其他错误回传原因便于排查
    const msg = (e && e.message) ? String(e.message) : '';
    if (msg.indexOf('duplicate') >= 0 || msg.indexOf('E11000') >= 0) {
      return { ok: false, msg: '你已在管理员名单中（并发重复提交已被拦截）' };
    }
    return { ok: false, msg: '初始化失败：' + (msg || '未知错误') };
  }
};
