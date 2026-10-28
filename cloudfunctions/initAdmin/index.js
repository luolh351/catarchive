const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const admins = db.collection('admin_users');

// 并发安全：用固定 _id 的“座位”文档做互斥。
// 原因：云开发事务不支持 where().get()/count()，无法在事务内统计是否已有 superadmin；
// 而 openid 唯一索引只能挡住“同一用户重复初始化”，挡不住两个不同用户同时初始化。
// 解法：竞争同一个 _id 的座位文档——_id 天然唯一，并发时第二个事务的 add 必然冲突并回滚，
// 保证全局只可能产生一个 superadmin。座位文档 role='seat'，adminList 会过滤，不影响名单。
const SEAT_ID = '__super_seat__';

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  // 事务外预检：查询必须成功，失败一律中止（不能静默继续初始化）
  let pre;
  try {
    pre = await admins.where({ role: 'superadmin' }).get();
  } catch (e) {
    return { ok: false, msg: '校验失败，未执行初始化：' + ((e && e.message) || '数据库查询异常') };
  }
  if (pre.data && pre.data.length) {
    return { ok: false, msg: '已初始化，禁止重复初始化' };
  }
  let mine;
  try {
    mine = await admins.where({ openid: OPENID }).get();
  } catch (e) {
    return { ok: false, msg: '校验失败，未执行初始化：' + ((e && e.message) || '数据库查询异常') };
  }
  if (mine.data && mine.data.length) {
    return { ok: false, msg: '你已在管理员名单中' };
  }

  const profile = event || {};
  let reason = '';
  try {
    await db.runTransaction(async tx => {
      // 占座：座位已存在说明已有（或正在初始化）超级管理员
      let seat = null;
      try {
        seat = await tx.collection('admin_users').doc(SEAT_ID).get();
      } catch (e) {
        seat = null; // 文档不存在时事务内 get 会抛错，视为未占座
      }
      if (seat && seat.data) { reason = 'TAKEN'; throw new Error('tx_abort'); }
      await tx.collection('admin_users').add({
        data: { _id: SEAT_ID, openid: '__seat__', role: 'seat', createdAt: db.serverDate(), createdBy: OPENID }
      });
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
    if (reason === 'TAKEN') return { ok: false, msg: '已有超级管理员，禁止重复初始化' };
    const m = (e && e.message) ? String(e.message) : '';
    // 并发占座冲突（_id 重复 / 唯一索引冲突）
    if (m.indexOf('duplicate') >= 0 || m.indexOf('E11000') >= 0 || m.indexOf('_id') >= 0) {
      return { ok: false, msg: '已有超级管理员（并发冲突已拦截）' };
    }
    return { ok: false, msg: '初始化失败：' + (m || '未知错误') };
  }
};
