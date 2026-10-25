// 校园猫咪档案馆 V1.0 应用入口
App({
  globalData: {
    // 完整 EnvId（形如 prod-xxxxxxxx），在云开发控制台创建环境后填入
    cloudEnv: '',
    // 设为 true 并填入 cloudEnv 后启用云端；此前使用 utils/service.js 的本地模拟数据
    USE_CLOUD: false,
    // 管理员身份（由 checkAdmin 云函数校验，前端不持有 openid/角色）
    isAdmin: false,
    adminRole: ''
  },
  onLaunch() {
    if (this.globalData.USE_CLOUD && this.globalData.cloudEnv) {
      wx.cloud.init({ env: this.globalData.cloudEnv, traceUser: true });
      // 启动时校验管理员身份（公开接口，失败不影响普通浏览）
      require('./utils/service').checkAdmin().then(r => {
        if (r && r.isAdmin) {
          this.globalData.isAdmin = true;
          this.globalData.adminRole = r.role;
        }
      }).catch(() => {});
    }
  }
});
