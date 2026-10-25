const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const cats = db.collection('cats');
const updates = db.collection('cat_updates');

// 公开：按 id 取档案与近况时间线（排除 operatorOpenid）
exports.main = async (event) => {
  if (!event || !event.id) return { err: 'missing id' };
  const res = await cats.doc(event.id).get();
  const cat = res.data || null;
  if (!cat) return { cat: null, timeline: [] };
  delete cat.operatorOpenid;
  const up = await updates.where({ catId: event.id }).orderBy('createdAt', 'desc').limit(50).get();
  const timeline = (up.data || []).map(({ operatorOpenid, ...r }) => r);
  return { cat, timeline };
};
