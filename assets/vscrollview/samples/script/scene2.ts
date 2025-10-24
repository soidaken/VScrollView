import { _decorator, Component, instantiate, Label, Node } from 'cc';
import { VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene2')
export class scene2 extends Component {
  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  //列表数据
  private data: any[] = [];

  onLoad() {
    // 模拟数据
    for (let i = 0; i < 50; i++) {
      this.data.push({
        data1: `重要通知${i + 1}`,
        data2: `2025.10.${1 + i}`,
        type: (i % 3) + 1, //你的数据中要能知道自己对应什么item的预制体
      });
    }

    // 设置虚拟列表数据
    if (this.vlist) {
      //不等高子项模式需要数据和每一项使用的子项预制体匹配上,所以定需要提供provideNodeFn
      this.vlist.provideNodeFn = (index: number) => {
        const itemdata = this.data[index];
        if (itemdata.type === 1) {
          return instantiate(this.vlist.itemPrefabs[0]);
        } else if (itemdata.type === 2) {
          return instantiate(this.vlist.itemPrefabs[1]);
        } else if (itemdata.type === 3) {
          return instantiate(this.vlist.itemPrefabs[2]);
        }
      };

      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        const itemdata = this.data[index];
        if (itemdata.type === 1) {
          const title = itemNode.getChildByName('title').getComponent(Label);
          const time = itemNode.getChildByName('time').getComponent(Label);
          title!.string = '类型1:' + this.data[index].data1;
          time!.string = this.data[index].data2;
        } else if (itemdata.type === 2) {
          const title = itemNode.getChildByName('title').getComponent(Label);
          title!.string = '类型2:' + this.data[index].data1;
        } else if (itemdata.type === 3) {
          const msg = itemNode.getChildByName('msg').getComponent(Label);
          msg!.string = '类型3：' + this.data[index].data1;
        }
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
  }
}
