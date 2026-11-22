const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const cats = db.collection('cats');
const logs = db.collection('like_logs');

const DAILY_LIMIT = 3;   // 每人每天最多点赞 3 次（可投给不同猫或同一只）

// 北京时间今天，YYYY-MM-DD（点赞次数按自然日重置）
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600000);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

// 公开：游客点赞
// action=like 点赞（校验每日上限，cats.likeCount 原子 +1，写 like_logs）
// action=status 查询当天已赞次数与某猫点赞总数
// action=rank 人气榜（按点赞数降序前 50）
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '无法识别用户身份' };
  const action = (event && event.action) || 'like';
  const date = todayStr();

  if (action === 'status') {
    const used = await logs.where({ openid: OPENID, date }).count();
    const catId = event.catId;
    let catLikes = 0;
    if (catId) {
      const c = await cats.doc(catId).get().catch(() => null);
      catLikes = (c && c.data && c.data.likeCount) || 0;
    }
    return { ok: true, used: used.total, left: Math.max(0, DAILY_LIMIT - used.total), likeCount: catLikes };
  }

  if (action === 'rank') {
    const res = await cats.where({ published: _.neq(false) })
      .orderBy('likeCount', 'desc').limit(50)
      .get();
    const list = (res.data || []).map(c => ({
      id: c._id, name: c.name, photo: (c.photos || [])[0] || '',
      likeCount: c.likeCount || 0
    }));
    return { ok: true, list };
  }

  // ---------- 点赞 ----------
  const catId = event && event.catId;
  if (!catId) return { ok: false, msg: '缺少猫咪 id' };

  // 当天已赞次数
  const used = await logs.where({ openid: OPENID, date }).count();
  if (used.total >= DAILY_LIMIT) return { ok: false, msg: '今天的 ' + DAILY_LIMIT + ' 次点赞已经用完啦，明天再来' };

  // 猫须存在且公开
  const cat = await cats.doc(catId).get().catch(() => null);
  if (!cat || !cat.data || cat.data.published === false) return { ok: false, msg: '猫咪不存在或已归档' };

  // 计数原子 +1，并记录日志
  const upd = await cats.doc(catId).update({ data: { likeCount: _.inc(1) } });
  if (!upd.stats || upd.stats.updated === 0) return { ok: false, msg: '点赞失败，请重试' };
  await logs.add({ data: { openid: OPENID, catId, date, createdAt: db.serverDate() } });

  const after = await cats.doc(catId).get().catch(() => null);
  return {
    ok: true,
    likeCount: (after && after.data && after.data.likeCount) || 0,
    left: Math.max(0, DAILY_LIMIT - used.total - 1)
  };
};
