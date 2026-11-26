// 科普页：底部 tabBar 第三大项。三个子 tab：投喂 / 绝育 / 领养。
// 当前阶段仅展示各主题的顶部插图；科普文字内容后续补充（CONTENT 常量预留结构）。
Page({
  data: {
    tab: 'feeding',   // feeding 投喂 | neuter 绝育 | adopt 领养
    tabs: [
      { key: 'feeding', name: '投喂', img: '/assets/science/feeding.jpg' },
      { key: 'neuter', name: '绝育', img: '/assets/science/neuter-care.jpg' },
      { key: 'adopt', name: '领养', img: '/assets/science/adoption.jpg' }
    ]
    // 科普文字内容占位：后续在 wxml 的注释块位置按主题填充
  },
  setTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key && key !== this.data.tab) this.setData({ tab: key });
  }
});
