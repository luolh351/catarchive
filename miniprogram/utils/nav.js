// 跳转防重：600ms 内的重复跳转直接忽略。
// 连点列表卡片、返回动画未结束又点下一个，会让微信路由在旧 webview 已销毁后
// 仍执行回调，触发 "routeDone with a webviewId xx is not found"（页面路由 system error）。
let lastAt = 0;
let lastUrl = '';

function go(url) {
  const now = Date.now();
  if (now - lastAt < 600 && lastUrl === url) return;
  lastAt = now;
  lastUrl = url;
  wx.navigateTo({
    url,
    // 页面栈满 10 层时降级为重定向，避免 navigateTo 失败后界面卡死
    fail: () => { wx.redirectTo({ url, fail: () => {} }); }
  });
}

module.exports = { go };
