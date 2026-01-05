# VScrollView

基于 CocosCreater 引擎编辑器的全新滚动组件和虚拟列表
- 目前支持 >=3.8.7 版本,全功能
- 运行支持 3.8.0-3.8.6,无分层DC优化
- 2.4.x 版本在另一个仓库,无分层DC优化

[在线预览地址](https://soidaken.github.io/VSCrollView_SamplesPreView/)


# 如果这个项目对你有帮助,恰好你心情不错,考虑请我喝杯9.9吧.

![alt text](reward_code.jpg)

# 它适合做什么
- 适合你项目中任何列表相关的UI制作
- 等高/不等高/纵向/横向/背包GRID/动态聊天列表/嵌套列表/结果奖励列表(自动中心布局)/子项点击展开/
- 甚至,你可以关闭虚拟列表功能,仅使用这个全新的滚动组件,类似APP端原生的滚动交互效果,滚动惯性自然

# 你可能会问,drawcall有优化吗
- 如果你使用的是3.8.x的有Sorting2D组件的版本,此组件自动为你做了分层DC优化且不影响你的子项节点树,你只要关注业务即可.

# 联系我

- 如果你遇到问题或者功能需求,可以联系我 v: soida3
- qq 群:1044961417
- mail:flashfin@foxmail.com

# 如何使用
可以参考 samples 里面的几种典型场景，对照场景和代码使用即可。也可以参考如下使用方法：

1. 开启`2D渲染排序`（可选）：`Cocos Creator`编辑器打开菜单：项目 - 项目设置 - 功能裁剪 - 2D，勾选：`2D渲染排序`。如果未开启，运行后会有一个警告：`当前引擎版本不支持Sorting2p组件，如果需要请切换到3.8.7及以上版本`，只是警告不影响使用。
2. 创建UI。注意不能使用`Cocos Creator`官方提供的`ScrollView`组件，需要参考如下步骤创建：
    1. 创建一个空节点，命名为`ScrollView`，为其添加组件：`UITransform`、`Mask`、`Graphics`；
    2. 为`ScrollView`创建子节点（命名为`content`），为`content`添加组件：`UITransform`、`Widget`；
    3. `ScrollView`和`content`的`UITransform`的`Anchor`属性均需要设置为：`(0, 0.5)`；
    4. 完全参考示例的UI组织形式进行创建，也可以先通过编辑器创建一个`ScrollView`组件然后参考上述步骤进行调整，官方的`Anchor`属性默认是`(0.5, 0.5)`，这一点需要特别注意。到这一步会发现示例的`ScrollView`组织形式要比`Cocos Creator`官方提供的要简单一些。
 3. 将`VScrollView.ts`拖放到`ScrollView`的属性检查器中，将`content`节点拖放到属性「容器节点」中，其他属性根据自己需要进行修改。部分属性释义如下：
    1. 滚动方向：设置列表是纵向滚动还是竖向滚动；
    2. 创建模式：可以选择通过节点或预制体创建，如果选择了预制体模式且属性「子项预制体」有值则使用预制体创建列表项，否则使用`content`节点的第一个子节点作为模式创建列表项；
    3. 额外缓冲：默认列表页数渲染3页，如果需要多渲染可以设置一个正数，如果不需要额外多渲染可以设置为0；
    4. ……其他属性根据字面意思理解，如有疑问后续再补充释义；
 4. 初始化代码。在某个场景的代码中设置一个本组件类型的变量：`@property(VirtualScrollView) vlist: VirtualScrollView | null = null;`，然后在UI中把ScrollView`节点通过拖放的形式赋值给`vlist`。然后参考如下代码进行初始化（其他功能参考示例代码）：
```ts
  onLoad() {
    game.frameRate = 120;
    // 模拟数据
    for (let i = 0; i < 50; i++) {
      this.data.push({
        data1: `重要通知${i + 1}`,
        data2: `2025.10.${1 + i}`,
      });
    }

    // 设置虚拟列表数据
    if (this.vlist) {
      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        console.log(`renderItemFn index`, index);
        const title = itemNode.getChildByName('title').getComponent(Label);
        const time = itemNode.getChildByName('time').getComponent(Label);
        title!.string = this.data[index].data1;
        time!.string = this.data[index].data2;

        //子项中单独的button处理,没有什么特别的
        const btnsure = itemNode.getChildByName('btn');
        UIButton.onClicked(btnsure, (button: UIButton) => {
          const tip = this.node.getChildByName('tip').getComponent(Label);
          tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;
        });

        //用来控制子项中按钮的点击事件是否同时影响上层节点的交互
        // btnsure.getComponent(UIButton).b_stopPropagation = false;
      };

      //如果设置了子项点击回调,则会自动开启子项点击效果
      // this.vlist.onItemClickFn = (itemNode: Node, index: number) => {
      //   const tip = this.node.getChildByName('tip').getComponent(Label);
      //   tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;
      // };

      this.vlist.onPageChangeFn = (pageIndex: number) => {
        const tip = this.node.getChildByName('tip').getComponent(Label);
        tip.string = `当前PAGEVIEW :${pageIndex + 1}`;
      };

      this.vlist.refreshList(this.data);

      // this.vlist.onOffSortLayer(this.renderOptOnOff);
    }

    UIButton.onClicked(this.node.getChildByName('btn1'), (button: UIButton) => {
      this.data[1].data1 = '【已修改】重要通知2';
      this.vlist.refreshIndex(1);
    });

    UIButton.onClicked(this.node.getChildByName('btn2'), (button: UIButton) => {
      this.vlist.scrollToBottom(true);
    });

    UIButton.onClicked(this.node.getChildByName('btn3'), (button: UIButton) => {
      this.vlist.scrollToIndex(10 - 1, true);
    });

    UIButton.onClicked(this.node.getChildByName('btn4'), (button: UIButton) => {
      this.renderOptOnOff = !this.renderOptOnOff;
      const tip = this.node.getChildByName('tip').getComponent(Label);
      tip.string = `分层优化:${this.renderOptOnOff ? '开启' : '关闭'}`;
      this.vlist.onOffSortLayer(this.renderOptOnOff);
    });

    UIButton.onClicked(this.node.getChildByName('btn5'), (button: UIButton) => {
      this.data.push({
        data1: `新增的数据 ${this.data.length + 1}`,
        data2: `2025.10.${this.data.length + 1}`,
      });

      //有时候,列表在顶部,你要新增一项,这里就是先设置列表跳到旧的底部,再刷新滚动到新的底部,这就很自然.
      this.vlist.flashToBottom();
      this.vlist.refreshList(this.data);
      this.vlist.scrollToBottom(true);
    });
  }
```
 5. 还可以实现更多效果,更多具体实用例子,我会持续更新.
