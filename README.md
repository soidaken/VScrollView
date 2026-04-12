# VScrollView

基于 CocosCreater 引擎编辑器的全新滚动组件和虚拟列表

- 目前支持 >=3.8.7 版本,全功能
- 运行支持 3.8.0-3.8.6,无分层 DC 优化
- 2.4.x 版本在另一个仓库,无分层 DC 优化

[在线预览地址](https://soidaken.github.io/VSCrollView_SamplesPreView/)

# 如果这个项目对你有帮助,恰好你心情不错,考虑请我喝杯 9.9 吧.

![alt text](reward_code.jpg)

# 它适合做什么

- 适合你项目中任何列表相关的 UI 制作
- 等高/不等高/纵向/横向/背包 GRID/动态聊天列表/嵌套列表/结果奖励列表(自动中心布局)/子项点击展开/
- 甚至,你可以关闭虚拟列表功能,仅使用这个全新的滚动组件,类似 APP 端原生的滚动交互效果,滚动惯性自然

# 你可能会问,drawcall 有优化吗

- 如果你使用的是 3.8.x 的有 Sorting2D 组件的版本,此组件自动为你做了分层 DC 优化且不影响你的子项节点树,你只要关注业务即可.

# 联系我

- 如果你遇到问题或者功能需求,可以联系我 v: soida3
- qq 群:1044961417
- mail:flashfin@foxmail.com

# 如何使用

直接使用预制体即可，不需要手动搭建节点结构：

1. 从 `assets/vscrollview` 里选择方向对应的预制体：

- `VSListTemplate_V.prefab`（纵向）
- `VSListTemplate_H.prefab`（横向）

2. 将预制体拖入场景任意父节点下即可使用。
3. 按业务需要，在预制体上的 `VScrollView` 组件里配置数据回调与滚动参数。

核心代码示例：

```ts
@property(VirtualScrollView)
vlist: VirtualScrollView | null = null;

private data: Array<{ title: string; time: string }> = [];

onLoad() {
  this.data = Array.from({ length: 50 }, (_, i) => ({
    title: `重要通知${i + 1}`,
    time: `2025.10.${i + 1}`,
  }));

  if (!this.vlist) return;

  this.vlist.renderItemFn = (itemNode, index) => {
    const item = this.data[index];
    itemNode.getChildByName('title')!.getComponent(Label)!.string = item.title;
    itemNode.getChildByName('time')!.getComponent(Label)!.string = item.time;
  };

  this.vlist.onItemClickFn = (_itemNode, index) => {
    const item = this.data[index];
    console.log(`click item ${index + 1}: ${item.title}`);
  };

  this.vlist.onItemEdgeEnterFn = (itemNode, index) => {
    // 子项刚进入可视区时触发，适合做入场动效
    Tween.stopAllByTarget(itemNode);
    itemNode.setScale(0, 0, 1);
    tween(itemNode).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  };

  this.vlist.onItemFullEnterFn = (itemNode, index) => {
    console.log(`item ${index + 1} fully visible`);
  };

  this.vlist.refreshList(this.data);

  // 常用操作
  // this.vlist.refreshIndex(1);
  // this.vlist.scrollToIndex(10, true);
  // this.vlist.scrollToBottom(true);
}
```

可视区回调说明：

- `onItemEdgeEnterFn`：子项刚进入可视区域边缘时触发，适合播放出现动画。
- `onItemFullEnterFn`：子项完全进入可视区域后触发，适合做曝光统计或完整展示后的业务逻辑。
