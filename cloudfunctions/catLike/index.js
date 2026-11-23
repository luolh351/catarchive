const cloud = require('wx-server-sdk');
const crypto = require('crypto');
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
// 榜单数据由 catList（全字段含 likeCount/viewCount）提供，前端排序，无需 rank 接口
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, msg: '无法识别用户身份' };
  const action = (event && event.action) || 'like';
  const date = todayStr();

  if (action === 'status') {
    const used = await logs.where({ openid: OPENID, date }).count();
    const catId = event.catId;
    let catLikes = 0;
    let likedToday = false;   // 今天是否已赞过这只猫（空心/实心状态）
    if (catId) {
      const c = await cats.doc(catId).get().catch(() => null);
      catLikes = (c && c.data && c.data.likeCount) || 0;
      const mine = await logs.where({ openid: OPENID, catId, date }).count();
      likedToday = mine.total > 0;
    }
    return { ok: true, used: used.total, left: Math.max(0, DAILY_LIMIT - used.total), likeCount: catLikes, likedToday };
  }

  if (action !== 'like') return { ok: false, msg: '未知操作' };

  // ---------- 点赞 ----------
  const catId = event && event.catId;
  if (!catId) return { ok: false, msg: '缺少猫咪 id' };

  const userDay = crypto.createHash('sha256').update(OPENID + ':' + date).digest('hex');
  // 固定编号的点赞记录就是每日名额。同一用户的并发请求竞争同一 _id，
  // 冲突会回滚计数，随后重新统计并尝试下一个名额。已有旧日志同样计入额度。
  for (let attempt = 0; attempt < DAILY_LIMIT; attempt++) {
    const used = await logs.where({ openid: OPENID, date }).count();
    if (used.total >= DAILY_LIMIT) return { ok: false, msg: '今天的 ' + DAILY_LIMIT + ' 次点赞已经用完啦，明天再来' };
    const slotId = userDay + '-' + (used.total + 1);
    let likeCount = 0;
    try {
      await db.runTransaction(async tx => {
        const cat = await tx.collection('cats').doc(catId).get();
        if (!cat.data || cat.data.published === false) throw new Error('猫咪不存在或已归档');
        await tx.collection('like_logs').add({ data: {
          _id: slotId, openid: OPENID, catId, date, createdAt: db.serverDate()
        } });
        await tx.collection('cats').doc(catId).update({ data: { likeCount: _.inc(1) } });
        likeCount = (cat.data.likeCount || 0) + 1;
      });
      return { ok: true, likeCount, left: Math.max(0, DAILY_LIMIT - used.total - 1) };
    } catch (e) {
      if (attempt === DAILY_LIMIT - 1) {
        console.warn('[like] 点赞事务失败', e);
        return { ok: false, msg: '点赞未完成，请稍后重试' };
      }
    }
  }
};
