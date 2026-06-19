import { _decorator, Component, easing, game, Label, Node, Sprite, SpriteFrame, tween, Tween, v3 } from 'cc';
import { ItemAppearContext, VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene14')
export class scene14 extends Component {
  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  //列表数据
  private data: any[] = [];

  private renderOptOnOff = false;

  onLoad() {
    game.frameRate = 120;
    // 模拟数据
    for (let i = 0; i < 100; i++) {
      this.data.push({
        data1: `${i + 1}`,
      });
    }

    // 设置虚拟列表数据
    if (!this.vlist) return;

    this.vlist.renderItemFn = (itemNode: Node, index: number) => {
      const title = itemNode.getChildByName('title').getComponent(Label);

      title!.string = this.data[index].data1;
    };

    this.vlist.onItemInitFn = (itemNode: Node, index: number, ctx: ItemAppearContext) => {
      Tween.stopAllByTarget(itemNode);
      itemNode.setScale(0, 0);
    };

    this.vlist.onItemEdgeEnterFn = (itemNode: Node, index: number, ctx: ItemAppearContext) => {
      Tween.stopAllByTarget(itemNode);
      const delay = ctx.isInitialBatch ? 0.03 * ctx.appearOrder : 0;
      tween(itemNode)
        .delay(delay)
        .to(
          0.5,
          { scale: v3(1, 1, 1) },
          {
            // Apple 风格弹簧曲线：快速起步 → 轻微 overshoot ≈ 8% → 缓慢归位
            easing: (t: number) => 1 - Math.exp(-7 * t) * Math.cos(9 * t),
          }
        )
        .start();
    };

    this.vlist.refreshList(this.data);

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

      this.vlist.refreshList(this.data);
      this.vlist.scrollToBottom(true);
    });
  }
}
