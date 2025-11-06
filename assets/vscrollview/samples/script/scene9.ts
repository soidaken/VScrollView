import { _decorator, Component, game, instantiate, Label, Node, UITransform } from 'cc';
import { VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene9')
export class scene9 extends Component {
  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  //列表数据
  private data: any[] = [];

  private renderOptOnOff = true;

  onLoad() {
    game.frameRate = 120;
    // 模拟数据
    for (let i = 0; i < 40; i++) {
      this.data.push({
        data1: `第${i + 1}条数据`,
        data2: `2025.10.${1 + i}`,
        isDetail: false,
        dataDetail: `第${i + 1}条数据:详细内容`,
        type: 1, //你的数据中要能知道自己对应什么item的预制体
      });
    }

    // 设置虚拟列表数据
    if (this.vlist) {
      // 数据中的type对应预制体数组中的索引(第几个预制体)
      this.vlist.getItemTypeIndexFn = (index: number) => {
        const itemdata = this.data[index];
        return itemdata.type - 1; // 返回 0, 1, 2
      };

      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        const itemdata = this.data[index];
        if (itemdata.type === 1) {
          const title = itemNode.getChildByName('title');
          const titleLabel = title.getComponent(Label);
          const time = itemNode.getChildByName('time').getComponent(Label);
          titleLabel!.string = '类型1:' + this.data[index].data1;
          time!.string = this.data[index].data2;

          const uit = itemNode.getComponent(UITransform);
          uit.height = itemdata.isDetail ? 250 : 135.6;
          if (itemdata.isDetail) {
            titleLabel.string = itemdata.dataDetail;
          }
        }
      };

      this.vlist.onItemClickFn = (itemNode: Node, index: number) => {
        const tip = this.node.getChildByName('tip').getComponent(Label);
        tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;

        this.data[index].isDetail = !this.data[index].isDetail;
        this.vlist.refreshList(this.data);
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

    UIButton.onClicked(this.node.getChildByName('btn5'), (button: UIButton) => {
      this.data.push({
        data1: `新增数据: 第${this.data.length + 1}条数据`,
        data2: `2025.10.${this.data.length + 1}`,
        isDetail: false,
        dataDetail: `第${this.data.length + 1}条数据:详细内容`,
        type: 1,
      });
      this.vlist.refreshList(this.data);
      this.vlist.scrollToBottom(true);
    });
  }
}
