const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const cats = db.collection('cats');

// 公开：按 lifeStatus 取已发布档案（排除 operatorOpenid）
exports.main = async (event) => {
  const where = { published: _.neq(false) };
  if (event && event.status) where.lifeStatus = event.status;
  const res = await cats.where(where).orderBy('updatedAt', 'desc').limit(100).get();
  const list = (res.data || []).map(({ operatorOpenid, ...rest }) => rest);
  return { list };
};
