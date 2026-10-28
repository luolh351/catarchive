// 校园猫咪档案馆 V1.0 应用入口
App({
  globalData: {
    // 云开发环境 ID（已创建环境：cloud1-d0gowrero76a516dd）
    cloudEnv: 'cloud1-d0gowrero76a516dd',
    // true：走云函数与云数据库；false：用 utils/service.js 的本地模拟数据（本地预览 UI 用）
    USE_CLOUD: true,
    // 管理员身份（由 checkAdmin 云函数校验，前端不持有 openid/角色）
    isAdmin: false,
    adminRole: ''
  },
  onLaunch() {
    if (this.globalData.USE_CLOUD && this.globalData.cloudEnv) {
      // wx.cloud.init 必须同步执行：后续任何页面调用 wx.cloud 前都要已初始化
      wx.cloud.init({ env: this.globalData.cloudEnv, traceUser: true });
      // 管理员身份校验延后到下一轮事件循环：require 整个 service 模块（含模拟数据）
      // 会拖长 onLaunch，触发控制台 [Perf] App.onLaunch 耗时提示。
      // 各页面（关于/管理台）进入时都会自行 checkAdmin，不依赖这里的抢先结果。
      setTimeout(() => {
        require('./utils/service').checkAdmin().then(r => {
          if (r && r.isAdmin) {
            this.globalData.isAdmin = true;
            this.globalData.adminRole = r.role;
          }
        }).catch(() => {});
      }, 0);
    }
  }
});
