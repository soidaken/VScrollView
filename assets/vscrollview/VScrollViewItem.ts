import {
  _decorator,
  Component,
  Node,
  EventTouch,
  Vec2,
  Label,
  Tween,
  tween,
  Vec3,
  settings,
  Sorting2D,
  RichText,
} from 'cc';
const { ccclass } = _decorator;

/**
 * 更改UI节点的渲染排序层级
 * @param sortingNode Node
 * @param sortingLayer number
 * @param sortingOrder number
 */
export function changeUISortingLayer(
  sortingNode: Node,
  sortingLayer: number,
  sortingOrder?: number
) {
  let sortingLayers = settings.querySettings('engine', 'sortingLayers') as any[];

  //编辑器bug,默认有default,但是读取出来没有,需要自己配置一个后才会有默认数据.
  if (!sortingLayers || sortingLayers.length === 0) {
    sortingLayers = [{ id: 0, value: 0, name: 'default' }];
  }

  const result = sortingLayers.find(layer => layer.value === sortingLayer);
  //如果没有找到对应的layer,则使用引擎内置默认层,并给出警告
  if (!result) {
    console.warn(
      `❌未找到对应的sortingLayer:${sortingLayer}，请检查是否已在项目设置中配置该层级。将使用默认层级代替。`
    );
    sortingLayer = sortingLayers[0].value;
  }
  const sort2d = sortingNode.getComponent(Sorting2D) || sortingNode.addComponent(Sorting2D);
  if (sort2d) {
    sort2d.sortingLayer = sortingLayer;
    if (sortingOrder !== undefined) {
      sort2d.sortingOrder = sortingOrder;
    }
  }
}

/**
 * 挂载在每个 item 预制体的根节点上
 * 负责处理点击逻辑，通过回调通知父组件
 */
@ccclass('VScrollViewItem')
export class VScrollViewItem extends Component {
  /** 当前 item 对应的数据索引 */
  public dataIndex: number = -1;

  public useItemClickEffect: boolean = true;

  /** 点击回调（由 VirtualScrollView 注入） */
  public onClickCallback: ((index: number) => void) | null = null;

  private _touchStartNode: Node | null = null;
  private _isCanceled: boolean = false;
  private _startPos: Vec2 = new Vec2();
  private _moveThreshold: number = 40; // 滑动阈值
  private _clickThreshold: number = 10; // 点击阈值

  onLoad() {
    // 一次性注册事件，生命周期内不变
    this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
  }

  protected start(): void {
    // this.onSortLayer();
  }

  onDestroy() {
    // 清理事件
    this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
  }

  /**
   * 将所有子节点的 Label 组件渲染单独排序在一起,并且item的每个lable组件都独立一个orderNumber,以免交错断合批
   * @param node
   */
  public onSortLayer() {
    let orderNumber = 1;
    const labels = this.node.getComponentsInChildren(Label);
    for (let i = 0; i < labels.length; i++) {
      changeUISortingLayer(labels[i].node, 0, orderNumber);
      orderNumber++;

    }
  }

  /** 关闭渲染分层 */
  public offSortLayer() {
    let orderNumber = 0;
    const labels = this.node.getComponentsInChildren(Label);
    for (let i = 0; i < labels.length; i++) {
      changeUISortingLayer(labels[i].node, 0, orderNumber);
      // const item = labels[i];
      // const sort2d = item.node.getComponent(Sorting2D);
      // sort2d && (sort2d.enabled = false);
      // orderNumber++;
    }
  }

  /** 外部调用：更新数据索引 */
  public setDataIndex(index: number) {
    this.dataIndex = index;
  }

  private _onTouchStart(e: EventTouch) {
    // console.log("_onTouchStart");
    this._touchStartNode = this.node;
    this._isCanceled = false;
    e.getLocation(this._startPos);

    // 缩放反馈（假设第一个子节点是内容容器）
    if (this.useItemClickEffect && this.node.children.length > 0) {
      this.node.setScale(0.95, 0.95);
    }
  }

  private _onTouchMove(e: EventTouch) {
    if (this._isCanceled) return;

    const movePos = e.getLocation();
    const dx = movePos.x - this._startPos.x;
    const dy = movePos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 超过阈值认为是滑动，取消点击
    if (dist > this._moveThreshold) {
      this._isCanceled = true;
      this._restoreScale();
      this._touchStartNode = null;
    }
  }

  private _onTouchEnd(e: EventTouch) {
    if (this._isCanceled) {
      this._reset();
      return;
    }

    this._restoreScale();

    const endPos = e.getLocation();
    const dx = endPos.x - this._startPos.x;
    const dy = endPos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 移动距离小于阈值才算点击
    if (dist < this._clickThreshold && this._touchStartNode === this.node) {
      if (this.onClickCallback) {
        this.onClickCallback(this.dataIndex);
      }
    }

    this._reset();
  }

  private _onTouchCancel(e: EventTouch) {
    this._restoreScale();
    this._reset();
  }

  private _restoreScale() {
    if (this.useItemClickEffect && this.node.children.length > 0) {
      this.node.setScale(1.0, 1.0);
    }
  }

  private _reset() {
    this._touchStartNode = null;
    this._isCanceled = false;
  }
}
