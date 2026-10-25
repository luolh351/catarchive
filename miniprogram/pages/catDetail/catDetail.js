// 猫咪详情（骨架）：经服务层读取（默认本地模拟，可切云端）
const service = require('../../utils/service');

Page({
  data: {
    cat: { name: '', isAdoptable: false, statusText: '' },
    attrs: [],
    timeline: []
  },
  onLoad(options) {
    const id = options && options.id;
    service.getCat(id)
      .then(res => this.setData({
        cat: res.cat || { name: '', isAdoptable: false, statusText: '' },
        attrs: res.attrs || [],
        timeline: res.timeline || []
      }))
      .catch(() => {});
  }
});
