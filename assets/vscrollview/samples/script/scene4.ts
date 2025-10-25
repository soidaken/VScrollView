import { _decorator, Component, Label, Node, Sprite, SpriteFrame } from 'cc';
import { VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene4')
export class scene4 extends Component {
  @property([SpriteFrame])
  spfs: SpriteFrame[] = [];

  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  //列表数据
  private data: any[] = [];

  private renderOptOnOff = true;

  onLoad() {
    // 模拟数据
    for (let i = 0; i < 50; i++) {
      this.data.push({
        data1: `第 ${i + 1} 项`,
        icon: i % this.spfs.length,
      });
    }

    // 设置虚拟列表数据
    if (this.vlist) {
      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        const title = itemNode.getChildByName('title').getComponent(Label);
        title!.string = this.data[index].data1;

        const sp = itemNode.getChildByName('icon').getComponent(Sprite);
        sp.spriteFrame = this.spfs[this.data[index].icon];
      };

      this.vlist.onItemClickFn = (itemNode: Node, index: number) => {
        const tip = this.node.getChildByName('tip').getComponent(Label);
        tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;
      };

      this.vlist.refreshList(this.data);
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
  }
}
