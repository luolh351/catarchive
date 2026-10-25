// 校园猫咪档案馆 V1.0 应用入口
// 注意：云开发初始化需要用户在云开发控制台创建环境后，把完整 EnvId 填入 globalData.cloudEnv。
App({
  globalData: {
    // 完整 EnvId（形如 prod-xxxxxxxx），由用户在云开发控制台创建后提供
    cloudEnv: '',
    // 管理员身份占位：真实实现由云函数在服务端用 getWXContext().OPENID 校验，前端不持有 openid/角色
    isAdmin: false
  },
  onLaunch() {
    // 拿到 EnvId 后启用（示例）：
    // if (this.globalData.cloudEnv) {
    //   wx.cloud.init({ env: this.globalData.cloudEnv, traceUser: true });
    // }
  }
});
