import {
  _decorator,
  Component,
  game,
  instantiate,
  Label,
  Node,
  RichText,
  Sprite,
  SpriteFrame,
  tween,
  UITransform,
  Vec3,
} from 'cc';
import { VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene5')
export class scene5 extends Component {
  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  private chatData: Array<{
    player: number;
    message: string;
    calculatedHeight: number; // 缓存计算好的高度
  }> = [];

  private renderOptOnOff = true;

  onLoad() {
    game.frameRate = 120;

    // 模拟聊天数据
    for (let i = 0; i < 2; i++) {
      const message = this.generateRandomMessage(i === 1);
      this.chatData.push({
        player: i % 2 === 0 ? 1 : 2,
        message: message,
        calculatedHeight: 0,
      });
    }

    if (this.vlist) {
      // ✅ 提供高度获取函数
      this.vlist.getItemHeightFn = (index: number) => {
        return this.chatData[index].calculatedHeight;
      };

      this.vlist.getItemTypeIndexFn = (index: number) => {
        const data = this.chatData[index];
        if (data.player === 1) {
          return 0; // 玩家1使用第一个预制体
        } else {
          return 1; // 玩家2使用第二个预制体
        }
      };

      // 渲染函数
      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        const data = this.chatData[index];
        let label = itemNode.getChildByName('msg').getComponent(Label);
        if(label){
          label.string = `第${index + 1}条消息: ${data.message}`;
        }
        let richlabel = itemNode.getChildByName('msg').getComponent(RichText) as RichText;
        if(richlabel){
          richlabel.string = `第${index + 1}条消息: ${data.message}`;
        }
        const tnode = label? label.node : richlabel.node;
        //需要根据真实渲染内容计算出子项正确高度
        //这个必须外部自己提供,因为组件的高度你可能有自己留白的需求,比如下面的上下各留20px空白
        const uit = itemNode.getComponent(UITransform);
        label&&label.updateRenderData();
        uit.height = tnode.getComponent(UITransform).height + 20 * 2;
        // console.log(
        //   `[自动测量] 索引${index} 高度变化: ${this.chatData[index].calculatedHeight} -> ${uit.height}`
        // );
        this.chatData[index].calculatedHeight = uit.height;
        this.vlist.updateItemHeight(index, uit.height);
      };

      this.vlist.playItemAppearAnimationFn = (itemNode: Node, index: number) => {
        itemNode.setScale(0, 0);
        tween(itemNode)
          .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'smooth' })
          .start();
      };

      this.vlist.refreshList(this.chatData);
    }

    this.vlist.onItemClickFn = (itemNode: Node, index: number) => {
      const tip = this.node.getChildByName('tip').getComponent(Label);
      tip.string = `你点击了第${index + 1}项`;
    };

    UIButton.onClicked(this.node.getChildByName('btn1'), (button: UIButton) => {
      this.addNewMessage(1);
    });

    UIButton.onClicked(this.node.getChildByName('btn2'), (button: UIButton) => {
      // this.vlist.scrollToBottom(true);
      this.addNewMessage(2);
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

  // ✅ 新增消息时
  addNewMessage(playerId: number, message?: string) {
    this.chatData.push({
      player: playerId,
      message: this.generateRandomMessage(playerId ===2),
      calculatedHeight: 0,
    });

    this.vlist.flashToBottom();

    // 更新列表
    this.vlist.refreshList(this.chatData.length);

    this.vlist.scrollToBottom(true);
  }

  // ✅ 修改某条消息时
  updateMessage(index: number, newMessage: string) {
    this.chatData[index].message = newMessage;
    this.chatData[index].calculatedHeight = 0;

    // 刷新显示
    this.vlist.refreshIndex(index);
  }

  // 生成随机消息
  private generateRandomMessage(isRichText: boolean = false): string {
    if (isRichText) {
    const richTextMessages = [
      '<color=#ff0000>红色</color>文字测试',
      '<color=#00ff00>绿色</color>加粗<b>粗体文本</b>',
      '<color=#0000ff>蓝色</color>斜体<i>斜体文本</i><color=#ffff00>黄色背景</color>文字<color=#00ff00>绿色文字</color>',
      '<color=#ff00ff>紫色</color>下划线<u>下划线文本</u><color=#ffff00>黄色背景</color>文字<color=#00ff00>绿色文字</color>',
      '<b>粗体</b><i>斜体</i><u>下划线</u>混合样式',
      '<color=#ffa500>橙色</color>字体大小<size=30>大号字</size><color=#ffff00>黄色背景</color>文字<color=#00ff00>绿色文字</color>',
      '<color=#00ffff>青色</color>今天天气不错<color=#ff0000>出去走走</color><color=#ffff00>黄色背景</color>文字<color=#00ff00>绿色文字</color>',
      '<b>重要通知:</b> <color=#ff0000>系统将在今晚维护</color>',
      '<color=#ffff00>黄色背景</color>文字<color=#00ff00>绿色文字</color>',
      '<size=40><color=#ff0000>大</color></size><size=20><color=#00ff00>小</color></size>字体混合'
    ];
    return richTextMessages[Math.floor(Math.random() * richTextMessages.length)];
  }
    const shortMessages = [
      '好的',
      '收到',
      '👌',
      '没问题',
      '知道了',
      '哈哈哈',
      '😂😂😂',
      '在吗？',
      '晚安',
      '早上好',
    ];

    const mediumMessages = [
      '今天天气不错，出去走走吧',
      '刚才看到一个很有意思的视频',
      '周末一起去看电影怎么样？',
      '这个功能终于做完了',
      '今天加班到很晚，累死了',
      '明天早上记得带伞',
      '午餐想吃什么？',
      '这个bug修了一下午',
      '刚才在地铁上遇到老同学了',
      '今天心情超级好',
    ];

    const longMessages = [
      '你好，今天深圳的天气真的很舒服，阳光明媚，微风拂面，特别适合出去走走。下午有时间的话，要不要一起去公园散散步？',
      '刚才路过一家新开的咖啡店，装修特别有格调，咖啡的味道也超级棒。他们家还有很多特色甜点，改天带你去尝尝！',
      '今天遇到了一件特别有趣的事情，想和你分享一下。早上在地铁上看到一个小朋友，超级可爱，一直在和妈妈聊天，说的话特别搞笑。',
      '最近在看一本很有意思的书，讲的是关于时间管理的，里面有很多实用的方法。看完之后感觉对自己的工作效率提升很有帮助，推荐给你！',
      '这个项目从立项到现在已经快三个月了，中间遇到了很多困难，但是团队一起努力，终于在今天完成了。感觉特别有成就感，大家也都很开心！',
    ];

    const emojis = ['😄', '😊', '😂', '🎉', '👍', '💪', '🌈', '☀️', '🌟', '❤️', '🔥', '✨'];

    // 随机选择消息长度类型
    const rand = Math.random();
    let message = '';

    if (rand < 0.3) {
      // 30% 短消息
      message = shortMessages[Math.floor(Math.random() * shortMessages.length)];
    } else if (rand < 0.7) {
      // 40% 中等长度
      message = mediumMessages[Math.floor(Math.random() * mediumMessages.length)];
      // 随机添加 1-2 个 emoji
      const emojiCount = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < emojiCount; i++) {
        message += emojis[Math.floor(Math.random() * emojis.length)];
      }
    } else {
      // 30% 长消息
      message = longMessages[Math.floor(Math.random() * longMessages.length)];
    }

    return message;
  }
}
