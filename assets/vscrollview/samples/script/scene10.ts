import { _decorator, Component, game, Label, Node, Sprite, SpriteFrame } from 'cc';
import { LoadMoreState, RefreshState, VirtualScrollView } from '../../VScrollView';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

@ccclass('scene10')
export class scene10 extends Component {
  @property(VirtualScrollView)
  vlist: VirtualScrollView | null = null;

  @property(Label)
  tipRefresh: Label | null = null;

  @property(Label)
  tipLoadMore: Label | null = null;

  //列表数据
  private data: any[] = [];

  private renderOptOnOff = false;

  onLoad() {
    game.frameRate = 120;
    // 模拟数据
    for (let i = 0; i < 2; i++) {
      this.data.push({
        data1: `重要通知${i + 1}`,
        data2: `2025.10.${1 + i}`,
      });
    }

    // 设置虚拟列表数据
    if (this.vlist) {
      this.vlist.renderItemFn = (itemNode: Node, index: number) => {
        const title = itemNode.getChildByName('title').getComponent(Label);
        const time = itemNode.getChildByName('time').getComponent(Label);
        title!.string = this.data[index].data1;
        time!.string = this.data[index].data2;

        //子项中单独的button处理,没有什么特别的
        // const btnsure = itemNode.getChildByName('btn');
        // UIButton.onClicked(btnsure, (button: UIButton) => {
        //   const tip = this.node.getChildByName('tip').getComponent(Label);
        //   tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;
        // });

        //用来控制子项中按钮的点击事件是否同时影响上层节点的交互
        // btnsure.getComponent(UIButton).b_stopPropagation = false;
      };

      //如果设置了子项点击回调,则会自动开启子项点击效果
      this.vlist.onItemClickFn = (itemNode: Node, index: number) => {
        const tip = this.node.getChildByName('tip').getComponent(Label);
        tip.string = `你点击了第${index + 1}项,内容:${this.data[index].data1}`;
      };


      this.tipRefresh.node.active = false;

      // 2. 监听下拉刷新状态变化
      this.vlist.onRefreshStateChangeFn = (state: RefreshState, offset: number) => {
        switch (state) {
          case RefreshState.IDLE:
            console.log('空闲状态');
            this.tipRefresh.node.active = false;
            
            // 隐藏刷新提示
            break;
          case RefreshState.PULLING:
            console.log('正在下拉...', offset);
            // 显示"下拉刷新"文字
            this.tipRefresh.string = '下拉刷新';
            this.tipRefresh.node.active = true;
            break;
          case RefreshState.READY:
            console.log('松开即可刷新', offset);
            // 显示"松开刷新"文字
            this.tipRefresh.string = '松开刷新';
            break;
          case RefreshState.REFRESHING:
            console.log('正在刷新...');
            // 显示加载动画和"正在刷新"文字
            // 开始请求数据
            this.tipRefresh.string = '正在刷新...';
            this.loadNewData();
            break;
          case RefreshState.COMPLETE:
            this.tipRefresh.string = '刷新完成';
            console.log('刷新完成');
            // 显示"刷新完成"
            break;
        }
      };

      this.tipLoadMore.node.active = false;
      // 3. 监听上拉加载状态变化
      this.vlist.onLoadMoreStateChangeFn = (state: LoadMoreState, offset: number) => {
        switch (state) {
          case LoadMoreState.IDLE:
            this.tipLoadMore.node.active = false;
            console.log('空闲状态');
            
            break;
          case LoadMoreState.PULLING:
            console.log('正在上拉...', offset);
            // 显示"上拉加载更多"文字
            this.tipLoadMore.string = '上拉加载更多';
            this.tipLoadMore.node.active = true;
            break;
          case LoadMoreState.READY:
            console.log('松开即可加载', offset);
            // 显示"松开加载"文字
            this.tipLoadMore.string = '松开加载';
            break;
          case LoadMoreState.LOADING:
            console.log('正在加载...');
            // 显示加载动画和"正在加载"文字
            // 开始请求数据
            this.tipLoadMore.string = '正在加载...';
            this.loadMoreData();
            break;
          case LoadMoreState.COMPLETE:
            console.log('加载完成');
            this.tipLoadMore.string = '加载完成';
            break;
          case LoadMoreState.NO_MORE:
            console.log('没有更多数据了');
            this.tipLoadMore.string = '没有更多数据了';
            // 显示"没有更多了"
            break;
        }
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
        data1: `新增的数据 ${this.data.length + 1}`,
        data2: `2025.10.${this.data.length + 1}`,
      });

      //有时候,列表在顶部,你要新增一项,这里就是先设置列表跳到旧的底部,再刷新滚动到新的底部,这就很自然.
      this.vlist.flashToBottom();
      this.vlist.refreshList(this.data);
      this.vlist.scrollToBottom(true);
    });
  }



  async loadNewData() {
    let newData = [];
    for (let i = 0; i < 4; i++){
      newData.push({
        data1: `下拉刷新的数据 ${newData.length + 1}`,
        data2: `2025.10.${newData.length + 1}`,
      });
    }
    const data :any[] = await new Promise((resolve) => {
      setTimeout(() => {
        resolve(newData);
      }, 1000);
    });
    this.data = data;
    this.vlist.refreshList(data);
    this.vlist.finishRefresh(true); 
    
  }

  async loadMoreData() {
    const data = [{ data1: `上拉加载更多的数据 ${this.data.length + 1}`, data2: `2025.10.${this.data.length + 1}` }];
     const moreData:any[] = await new Promise((resolve) => {
      setTimeout(() => {
        resolve(data);
      }, 1000);
    });
    const hasMore = moreData.length > 0;
    this.data = this.data.concat(moreData);
    this.vlist.refreshList(this.data);
    this.vlist.finishLoadMore(hasMore); // 完成加载
    this.vlist.scrollToBottom(true);
  }
}
