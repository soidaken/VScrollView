import {
  _decorator,
  Component,
  Node,
  UITransform,
  instantiate,
  Prefab,
  EventTouch,
  Vec3,
  math,
  Mask,
  Vec2,
  tween,
  Tween,
  input,
  Input,
  Enum,
} from 'cc';
import { VScrollViewItem } from './VScrollViewItem';
const { ccclass, property, menu } = _decorator;

class InternalNodePool {
  private pools: Map<number, Node[]> = new Map();
  private prefabs: Prefab[] = [];

  constructor(prefabs: Prefab[]) {
    this.prefabs = prefabs;
    prefabs.forEach((_, index) => {
      this.pools.set(index, []);
    });
  }

  get(typeIndex: number): Node {
    const pool = this.pools.get(typeIndex);
    if (!pool) {
      console.error(`[VScrollView NodePool] 类型 ${typeIndex} 不存在`);
      return null;
    }
    if (pool.length > 0) {
      const node = pool.pop()!;
      node.active = true;
      return node;
    }
    const newNode = instantiate(this.prefabs[typeIndex]);
    return newNode;
  }

  put(node: Node, typeIndex: number) {
    if (!node) return;
    const pool = this.pools.get(typeIndex);
    if (!pool) {
      console.error(`[VScrollView NodePool] 类型 ${typeIndex} 不存在`);
      node.destroy();
      return;
    }
    node.active = false;
    node.removeFromParent();
    pool.push(node);
  }

  clear() {
    this.pools.forEach(pool => {
      pool.forEach(node => node.destroy());
      pool.length = 0;
    });
    this.pools.clear();
  }

  getStats() {
    const stats: any = {};
    this.pools.forEach((pool, type) => {
      stats[`type${type}`] = pool.length;
    });
    return stats;
  }
}

export type RenderItemFn = (node: Node, index: number) => void;
export type ProvideNodeFn = (index: number) => Node | Promise<Node>;
export type OnItemClickFn = (node: Node, index: number) => void;
export type PlayItemAppearAnimationFn = (node: Node, index: number) => void;
export type GetItemHeightFn = (index: number) => number;
export type GetItemTypeIndexFn = (index: number) => number;

export enum ScrollDirection {
  VERTICAL = 0,
  HORIZONTAL = 1,
}

@ccclass('VirtualScrollView')
@menu('2D/VirtualScrollView(虚拟滚动列表)')
export class VirtualScrollView extends Component {
  @property({ type: Node, displayName: '容器节点', tooltip: 'content 容器节点（在 Viewport 下）' })
  public content: Node | null = null;

  @property({
    displayName: '启用虚拟列表',
    tooltip: '是否启用虚拟列表模式（关闭则仅提供滚动功能）',
  })
  public useVirtualList: boolean = true;

  @property({
    type: Enum(ScrollDirection),
    displayName: '滚动方向',
    tooltip: '滚动方向：纵向（向上）或横向（向左）',
  })
  public direction: ScrollDirection = ScrollDirection.VERTICAL;

  @property({
    type: Prefab,
    displayName: '子项预制体',
    tooltip: '可选：从 Prefab 创建 item（等大小模式）',
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicSize;
    },
  })
  public itemPrefab: Prefab | null = null;

  @property({
    displayName: '不等大小模式',
    tooltip: '启用不等大小模式',
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public useDynamicSize: boolean = false;

  @property({
    displayName: '不等高模式（已废弃,仅保持兼容）',
    tooltip: '启用不等高模式（已废弃,仅保持兼容）',
  })
  public useDynamicHeight: boolean = false;

  @property({
    type: [Prefab],
    displayName: '子项预制体数组',
    tooltip: '不等大小模式：预先提供的子项预制体数组（可在编辑器拖入）',
    visible(this: VirtualScrollView) {
      return this.useVirtualList && this.useDynamicSize;
    },
  })
  public itemPrefabs: Prefab[] = [];

  private itemMainSize: number = 100;
  private itemCrossSize: number = 100;

  @property({
    displayName: '行/列数',
    tooltip: '纵向模式为列数，横向模式为行数',
    range: [1, 10, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicSize;
    },
  })
  public gridCount: number = 1;

  @property({
    displayName: '副方向间距',
    tooltip: '主方向垂直方向的间距（像素）',
    range: [0, 1000, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicSize;
    },
  })
  public gridSpacing: number = 8;

  @property({
    displayName: '主方向间距',
    tooltip: '主方向的间距（像素）',
    range: [0, 1000, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public spacing: number = 8;

  @property({
    displayName: '总条数',
    tooltip: '总条数（可在运行时 setTotalCount 动态修改）',
    range: [0, 1000, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public totalCount: number = 50;

  @property({
    displayName: '额外缓冲',
    tooltip: '额外缓冲（可视区外多渲染几条，避免边缘复用闪烁）',
    range: [0, 10, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public buffer: number = 1;

  @property({ displayName: '像素对齐', tooltip: '是否启用像素对齐' })
  public pixelAlign: boolean = true;

  @property({
    displayName: '惯性阻尼系数',
    tooltip: '指数衰减系数，越大减速越快',
    range: [0, 10, 0.5],
  })
  public inertiaDampK: number = 1;

  @property({ displayName: '弹簧刚度', tooltip: '越界弹簧刚度 K（建议 120–240）' })
  public springK: number = 150.0;

  @property({ displayName: '弹簧阻尼', tooltip: '越界阻尼 C（建议 22–32）' })
  public springC: number = 26.0;

  @property({ displayName: '速度阈值', tooltip: '速度阈值（像素/秒），低于即停止' })
  public velocitySnap: number = 5;

  @property({ displayName: '速度窗口', tooltip: '速度估计窗口（秒）' })
  public velocityWindow: number = 0.08;

  @property({ displayName: '最大惯性速度', tooltip: '最大惯性速度（像素/秒）' })
  public maxVelocity: number = 6000;

  @property({ displayName: 'iOS减速曲线', tooltip: '是否使用 iOS 风格的减速曲线' })
  public useIOSDecelerationCurve: boolean = true;

  public renderItemFn: RenderItemFn | null = null;
  public provideNodeFn: ProvideNodeFn | null = null;
  public onItemClickFn: OnItemClickFn | null = null;
  public playItemAppearAnimationFn: PlayItemAppearAnimationFn | null = null;
  public getItemHeightFn: GetItemHeightFn | null = null;
  public getItemTypeIndexFn: GetItemTypeIndexFn | null = null;

  private _viewportSize = 0;
  private _contentSize = 0;
  private _boundsMin = 0;
  private _boundsMax = 0;
  private _velocity = 0;
  private _isTouching = false;
  private _velSamples: { t: number; delta: number }[] = [];
  private _slotNodes: Node[] = [];
  private _slots = 0;
  private _slotFirstIndex = 0;
  private _itemSizes: number[] = [];
  private _prefixPositions: number[] = [];
  private _prefabSizeCache: Map<number, number> = new Map();
  private _nodePool: InternalNodePool | null = null;
  private _slotPrefabIndices: number[] = [];
  private _needAnimateIndices: Set<number> = new Set();
  private _initSortLayerFlag: boolean = true;
  private _scrollTween: any = null;
  private _tmpMoveVec2 = new Vec2();

  private get _contentTf(): UITransform {
    this.content = this._getContentNode();
    return this.content!.getComponent(UITransform)!;
  }

  private get _viewportTf(): UITransform {
    return this.node.getComponent(UITransform)!;
  }

  private _getContentNode(): Node {
    if (!this.content) {
      console.warn(`[VirtualScrollView] :${this.node.name} 请在属性面板绑定 content 容器节点`);
      this.content = this.node.getChildByName('content');
    }
    return this.content;
  }

  private _isVertical(): boolean {
    return this.direction === ScrollDirection.VERTICAL;
  }

  private _getViewportMainSize(): number {
    return this._isVertical() ? this._viewportTf.height : this._viewportTf.width;
  }

  private _getContentMainPos(): number {
    return this._isVertical() ? this.content!.position.y : this.content!.position.x;
  }

  private _setContentMainPos(pos: number) {
    if (!Number.isFinite(pos)) return;
    if (this.pixelAlign) pos = Math.round(pos);
    const p = this.content!.position;
    if (this._isVertical()) {
      if (pos === p.y) return;
      this.content!.setPosition(p.x, pos, p.z);
    } else {
      if (pos === p.x) return;
      this.content!.setPosition(pos, p.y, p.z);
    }
  }

  async start() {
    this.content = this._getContentNode();
    if (!this.content) return;
    const mask = this.node.getComponent(Mask);
    if (!mask) console.warn('[VirtualScrollView] 建议在视窗节点挂一个 Mask 组件用于裁剪');
    this.gridCount = Math.max(1, Math.round(this.gridCount));
    if (!this.useVirtualList) {
      this._viewportSize = this._getViewportMainSize();
      this._contentSize = this._isVertical() ? this._contentTf.height : this._contentTf.width;
      if (this._isVertical()) {
        this._boundsMin = 0;
        this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
      } else {
        this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
        this._boundsMax = 0;
      }
      this._bindTouch();
      this._bindGlobalTouch();
      return;
    }
    this.content.removeAllChildren();
    this._viewportSize = this._getViewportMainSize();
    //兼容废弃属性
    if (this.useDynamicHeight) {
      this.useDynamicSize = true;
    }
    if (this.useDynamicSize) await this._initDynamicSizeMode();
    else await this._initFixedSizeMode();
    this._bindTouch();
    this._bindGlobalTouch();
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_START, this._onDown, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this._onMove, this);
    this.node.off(Node.EventType.TOUCH_END, this._onUp, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this._onUp, this);
    if (this._nodePool) {
      this._nodePool.clear();
      this._nodePool = null;
    }
  }

  private _bindTouch() {
    this.node.on(Node.EventType.TOUCH_START, this._onDown, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this._onMove, this);
    this.node.on(Node.EventType.TOUCH_END, this._onUp, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this._onUp, this);
  }

  private _bindGlobalTouch() {
    input.on(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
  }

  private _onGlobalTouchEnd(event: EventTouch) {
    if (this._isTouching) {
      console.log('[VScrollView] Global touch end detected');
      this._onUp(event);
    }
  }

  private async _initFixedSizeMode() {
    if (!this.provideNodeFn) {
      this.provideNodeFn = (index: number) => {
        if (this.itemPrefab) return instantiate(this.itemPrefab);
        console.warn('[VirtualScrollView] 没有提供 itemPrefab');
        const n = new Node('item-auto-create');
        const size = this._isVertical() ? this._viewportTf.width : this._viewportTf.height;
        n.addComponent(UITransform).setContentSize(this._isVertical() ? size : this.itemMainSize, this._isVertical() ? this.itemMainSize : size);
        return n;
      };
    }
    let item_pre = this.provideNodeFn(0);
    if (item_pre instanceof Promise) item_pre = await item_pre;
    const uit = item_pre.getComponent(UITransform);
    if (this._isVertical()) {
      this.itemMainSize = uit.height;
      this.itemCrossSize = uit.width;
    } else {
      this.itemMainSize = uit.width;
      this.itemCrossSize = uit.height;
    }
    this._recomputeContentSize();
    const stride = this.itemMainSize + this.spacing;
    const visibleLines = Math.ceil(this._viewportSize / stride);
    this._slots = Math.max(1, (visibleLines + this.buffer + 2) * this.gridCount);
    for (let i = 0; i < this._slots; i++) {
      const n = instantiate(item_pre);
      n.parent = this.content!;
      const itf = n.getComponent(UITransform);
      if (itf) {
        if (this._isVertical()) {
          itf.width = this.itemCrossSize;
          itf.height = this.itemMainSize;
        } else {
          itf.width = this.itemMainSize;
          itf.height = this.itemCrossSize;
        }
      }
      this._slotNodes.push(n);
    }
    this._slotFirstIndex = 0;
    this._layoutSlots(this._slotFirstIndex, true);
  }

  private async _initDynamicSizeMode() {
    if (this.getItemHeightFn) {
      console.log('[VirtualScrollView] 使用外部提供的 getItemHeightFn');
      this._itemSizes = [];
      for (let i = 0; i < this.totalCount; i++) {
        this._itemSizes.push(this.getItemHeightFn(i));
      }
      this._buildPrefixSum();
      if (this.itemPrefabs.length > 0) {
        console.log('[VirtualScrollView] 初始化节点池');
        this._nodePool = new InternalNodePool(this.itemPrefabs);
      } else {
        console.error('[VirtualScrollView] 需要至少一个 itemPrefab');
        return;
      }
      this._initDynamicSlots();
      return;
    }
    if (this.itemPrefabs.length === 0 || !this.getItemTypeIndexFn) {
      console.error(
        '[VirtualScrollView] 不等大小模式必须提供以下之一：\n1. getItemHeightFn 回调函数\n2. itemPrefabs 数组 + getItemTypeIndexFn 回调函数'
      );
      return;
    }
    console.log('[VirtualScrollView] 使用采样模式（从 itemPrefabs 采样尺寸）');
    this._nodePool = new InternalNodePool(this.itemPrefabs);
    this._prefabSizeCache.clear();
    for (let i = 0; i < this.itemPrefabs.length; i++) {
      const sampleNode = instantiate(this.itemPrefabs[i]);
      const uit = sampleNode.getComponent(UITransform);
      const size = this._isVertical() ? uit?.height || 100 : uit?.width || 100;
      this._prefabSizeCache.set(i, size);
      sampleNode.destroy();
      console.log(`[VirtualScrollView] 预制体[${i}] 采样尺寸: ${size}`);
    }
    this._itemSizes = [];
    for (let i = 0; i < this.totalCount; i++) {
      const typeIndex = this.getItemTypeIndexFn(i);
      const size = this._prefabSizeCache.get(typeIndex);
      if (size !== undefined) {
        this._itemSizes.push(size);
      } else {
        console.warn(`[VirtualScrollView] 索引 ${i} 的类型索引 ${typeIndex} 无效，使用默认尺寸`);
        this._itemSizes.push(this._prefabSizeCache.get(0) || 100);
      }
    }
    this._buildPrefixSum();
    this._initDynamicSlots();
  }

  private _initDynamicSlots() {
    const avgSize = this._contentSize / this.totalCount || 100;
    const visibleCount = Math.ceil(this._viewportSize / avgSize);
    let neededSlots = visibleCount + this.buffer * 2 + 4;
    const minSlots = Math.ceil(this._viewportSize / 80) + this.buffer * 2;
    neededSlots = Math.max(neededSlots, minSlots);
    const maxSlots = Math.ceil(this._viewportSize / 50) + this.buffer * 4;
    neededSlots = Math.min(neededSlots, maxSlots);
    this._slots = Math.min(neededSlots, Math.max(this.totalCount, minSlots));
    this._slotNodes = new Array(this._slots).fill(null);
    this._slotPrefabIndices = new Array(this._slots).fill(-1);
    this._slotFirstIndex = 0;
    this._layoutSlots(this._slotFirstIndex, true);
    console.log(`[VScrollView] 初始化槽位: ${this._slots} (总数据: ${this.totalCount}, 视口尺寸: ${this._viewportSize})`);
  }

  private _buildPrefixSum() {
    const n = this._itemSizes.length;
    this._prefixPositions = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this._prefixPositions[i] = acc;
      acc += this._itemSizes[i] + this.spacing;
    }
    this._contentSize = acc - this.spacing;
    if (this._contentSize < 0) this._contentSize = 0;
    if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
    else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

    // 修改：横向模式的边界
    if (this._isVertical()) {
      this._boundsMin = 0; // 顶部
      this._boundsMax = Math.max(0, this._contentSize - this._viewportSize); // 底部（正值）
    } else {
      this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize); // 最大滚动距离（负值）
      this._boundsMax = 0; // 初始位置（顶部）
    }
  }

  private _posToFirstIndex(pos: number): number {
    if (pos <= 0) return 0;
    let l = 0,
      r = this._prefixPositions.length - 1,
      ans = this._prefixPositions.length;
    while (l <= r) {
      const m = (l + r) >> 1;
      if (this._prefixPositions[m] > pos) {
        ans = m;
        r = m - 1;
      } else {
        l = m + 1;
      }
    }
    return Math.max(0, ans - 1);
  }

  private _calcVisibleRange(scrollPos: number): { start: number; end: number } {
    const n = this._prefixPositions.length;
    if (n === 0) return { start: 0, end: 0 };
    const start = this._posToFirstIndex(scrollPos);
    const endPos = scrollPos + this._viewportSize;
    let end = start;
    while (end < n) {
      if (this._prefixPositions[end] >= endPos) break;
      end++;
    }
    return { start: Math.max(0, start - this.buffer), end: Math.min(n, end + this.buffer) };
  }

  update(dt: number) {
    if (!this.content || this._isTouching || this._scrollTween) return;
    let pos = this._getContentMainPos();
    let a = 0;

    // 修改：需要判断哪个是最小边界，哪个是最大边界
    const minBound = Math.min(this._boundsMin, this._boundsMax);
    const maxBound = Math.max(this._boundsMin, this._boundsMax);

    if (pos < minBound) {
      // 超出最小边界（纵向：下方；横向：左方）
      a = -this.springK * (pos - minBound) - this.springC * this._velocity;
    } else if (pos > maxBound) {
      // 超出最大边界（纵向：上方；横向：右方）
      a = -this.springK * (pos - maxBound) - this.springC * this._velocity;
    } else {
      if (this.useIOSDecelerationCurve) {
        const speed = Math.abs(this._velocity);
        if (speed > 2000) this._velocity *= Math.exp(-this.inertiaDampK * 0.7 * dt);
        else if (speed > 500) this._velocity *= Math.exp(-this.inertiaDampK * dt);
        else this._velocity *= Math.exp(-this.inertiaDampK * 1.3 * dt);
      } else {
        this._velocity *= Math.exp(-this.inertiaDampK * dt);
      }
    }
    this._velocity += a * dt;
    if (Math.abs(this._velocity) < this.velocitySnap && a === 0) this._velocity = 0;
    if (this._velocity !== 0) {
      pos += this._velocity * dt;
      if (this.pixelAlign) pos = Math.round(pos);
      this._setContentMainPos(pos);
      if (this.useVirtualList) this._updateVisible(false);
    }
  }

  public updateItemHeight(index: number, newSize?: number) {
    if (!this.useDynamicSize) {
      console.warn('[VScrollView] 只有不等大小模式支持 updateItemHeight');
      return;
    }
    if (index < 0 || index >= this.totalCount) {
      console.warn(`[VScrollView] 索引 ${index} 超出范围`);
      return;
    }
    let size = newSize;
    if (size === undefined) {
      if (this.getItemHeightFn) {
        size = this.getItemHeightFn(index);
      } else {
        console.error('[VScrollView] 没有提供 newSize 参数，且未设置 getItemHeightFn');
        return;
      }
    }
    if (this._itemSizes[index] === size) return;
    this._itemSizes[index] = size;
    this._rebuildPrefixSumFrom(index);
    this._updateVisible(true);
  }

  private _rebuildPrefixSumFrom(startIndex: number) {
    if (startIndex === 0) {
      this._buildPrefixSum();
      return;
    }
    let acc = this._prefixPositions[startIndex - 1] + this._itemSizes[startIndex - 1] + this.spacing;
    for (let i = startIndex; i < this._itemSizes.length; i++) {
      this._prefixPositions[i] = acc;
      acc += this._itemSizes[i] + this.spacing;
    }
    this._contentSize = acc - this.spacing;
    if (this._contentSize < 0) this._contentSize = 0;
    if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
    else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

    if (this._isVertical()) {
      this._boundsMin = 0;
      this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
    } else {
      this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
      this._boundsMax = 0;
    }
  }

  public updateItemHeights(updates: Array<{ index: number; height: number }>) {
    if (!this.useDynamicSize) {
      console.warn('[VScrollView] 只有不等大小模式支持 updateItemHeights');
      return;
    }
    if (updates.length === 0) return;
    let minIndex = this.totalCount;
    let hasChange = false;
    for (const { index, height } of updates) {
      if (index < 0 || index >= this.totalCount) continue;
      if (this._itemSizes[index] !== height) {
        this._itemSizes[index] = height;
        minIndex = Math.min(minIndex, index);
        hasChange = true;
      }
    }
    if (!hasChange) return;
    this._rebuildPrefixSumFrom(minIndex);
    this._updateVisible(true);
  }

  public refreshList(data: any[] | number) {
    if (!this.useVirtualList) {
      console.warn('[VirtualScrollView] 简单滚动模式不支持 refreshList');
      return;
    }
    if (typeof data === 'number') this.setTotalCount(data);
    else this.setTotalCount(data.length);
  }

  public setTotalCount(count: number) {
    this._getContentNode();
    if (!this.useVirtualList) {
      console.warn('[VScrollView] 非虚拟列表模式，不支持 setTotalCount');
      return;
    }
    const oldCount = this.totalCount;
    this.totalCount = Math.max(0, count | 0);
    if (this.totalCount > oldCount) {
      for (let i = oldCount; i < this.totalCount; i++) {
        this._needAnimateIndices.add(i);
      }
    }
    if (this.useDynamicSize) {
      const oldLength = this._itemSizes.length;
      if (this.totalCount > oldLength) {
        for (let i = oldLength; i < this.totalCount; i++) {
          let size = 100;
          if (this.getItemHeightFn) {
            size = this.getItemHeightFn(i);
          } else if (this.getItemTypeIndexFn && this._prefabSizeCache.size > 0) {
            const typeIndex = this.getItemTypeIndexFn(i);
            size = this._prefabSizeCache.get(typeIndex) || 100;
          }
          this._itemSizes.push(size);
        }
      } else if (this.totalCount < oldLength) {
        this._itemSizes.length = this.totalCount;
      }
      this._buildPrefixSum();
      if (this.totalCount > oldCount) this._expandSlotsIfNeeded();
    } else {
      this._recomputeContentSize();
    }
    this._slotFirstIndex = math.clamp(this._slotFirstIndex, 0, Math.max(0, this.totalCount - 1));
    this._layoutSlots(this._slotFirstIndex, true);
    this._updateVisible(true);
  }

  private _expandSlotsIfNeeded() {
    let neededSlots = 0;
    let pos = 0;
    const endPos = this._viewportSize;
    for (let i = 0; i < this.totalCount; i++) {
      if (pos >= endPos) break;
      neededSlots++;
      pos += this._itemSizes[i] + this.spacing;
    }
    neededSlots += this.buffer * 2 + 4;
    const minSlots = Math.ceil(this._viewportSize / 80) + this.buffer * 2;
    neededSlots = Math.max(neededSlots, minSlots);
    const maxSlots = Math.ceil(this._viewportSize / 50) + this.buffer * 4;
    neededSlots = Math.min(neededSlots, maxSlots);
    if (neededSlots > this._slots) {
      const oldSlots = this._slots;
      this._slots = neededSlots;
      for (let i = oldSlots; i < this._slots; i++) {
        this._slotNodes.push(null);
        this._slotPrefabIndices.push(-1);
      }
      console.log(`[VScrollView] 槽位扩展: ${oldSlots} -> ${this._slots} (总数据: ${this.totalCount})`);
    }
  }

  private _scrollToPosition(targetPos: number, animate = false) {
    targetPos = math.clamp(targetPos, this._boundsMin, this._boundsMax);
    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }
    this._velocity = 0;
    this._isTouching = false;
    this._velSamples.length = 0;
    if (!animate) {
      this._setContentMainPos(this.pixelAlign ? Math.round(targetPos) : targetPos);
      this._updateVisible(true);
    } else {
      const currentPos = this._getContentMainPos();
      const distance = Math.abs(targetPos - currentPos);
      const duration = Math.max(0.2, distance / 3000);
      const targetVec = this._isVertical() ? new Vec3(0, targetPos, 0) : new Vec3(targetPos, 0, 0);
      this._scrollTween = tween(this.content!)
        .to(
          duration,
          { position: targetVec },
          {
            easing: 'smooth',
            onUpdate: () => {
              this._updateVisible(false);
            },
          }
        )
        .call(() => {
          this._updateVisible(true);
          this._scrollTween = null;
          this._velocity = 0;
        })
        .start();
    }
  }

  public scrollToTop(animate = false) {
    const target = this._isVertical() ? this._boundsMin : this._boundsMax;
    this._scrollToPosition(target, animate);
  }

  public scrollToBottom(animate = false) {
    const target = this._isVertical() ? this._boundsMax : this._boundsMin;
    this._scrollToPosition(target, animate);
  }

  public scrollToIndex(index: number, animate = false) {
    index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));
    let targetPos = 0;
    if (this.useDynamicSize) {
      targetPos = this._prefixPositions[index] || 0;
    } else {
      const line = Math.floor(index / this.gridCount);
      targetPos = line * (this.itemMainSize + this.spacing);
    }
    // 横向模式：滚动方向相反，取负值
    if (!this._isVertical()) {
      targetPos = -targetPos;
    }
    this._scrollToPosition(targetPos, animate);
  }

  public onOffSortLayer(onoff: boolean) {
    this._initSortLayerFlag = onoff;
    this._onOffSortLayerOperation();
  }

  private _onOffSortLayerOperation() {
    for (const element of this._slotNodes) {
      const sitem = element?.getComponent(VScrollViewItem);
      if (sitem) {
        if (this._initSortLayerFlag) sitem.onSortLayer();
        else sitem.offSortLayer();
      }
    }
  }

  private _flashToPosition(targetPos: number) {
    targetPos = math.clamp(targetPos, this._boundsMin, this._boundsMax);
    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }
    this._velocity = 0;
    this._isTouching = false;
    this._velSamples.length = 0;
    this._setContentMainPos(this.pixelAlign ? Math.round(targetPos) : targetPos);
    this._updateVisible(true);
  }

  public flashToTop() {
    const target = this._isVertical() ? this._boundsMin : this._boundsMax;
    this._flashToPosition(target);
  }

  public flashToBottom() {
    const target = this._isVertical() ? this._boundsMax : this._boundsMin;
    this._flashToPosition(target);
  }
  public flashToIndex(index: number) {
    if (!this.useVirtualList) {
      console.warn('[VirtualScrollView] 简单滚动模式不支持 flashToIndex');
      return;
    }
    index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));
    let targetPos = 0;
    if (this.useDynamicSize) {
      targetPos = this._prefixPositions[index] || 0;
    } else {
      const line = Math.floor(index / this.gridCount);
      targetPos = line * (this.itemMainSize + this.spacing);
    }
    if (!this._isVertical()) {
      targetPos = -targetPos;
    }
    this._flashToPosition(targetPos);
  }

  public refreshIndex(index: number) {
    if (!this.useVirtualList) {
      console.warn('[VirtualScrollView] 简单滚动模式不支持 refreshIndex');
      return;
    }
    const first = this._slotFirstIndex;
    const last = first + this._slots - 1;
    if (index < first || index > last) return;
    const slot = index - first;
    const node = this._slotNodes[slot];
    if (node && this.renderItemFn) this.renderItemFn(node, index);
  }

  private _onDown(e: EventTouch) {
    this._isTouching = true;
    this._velocity = 0;
    this._velSamples.length = 0;
    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }
  }

  private _onMove(e: EventTouch) {
    if (!this._isTouching) return;
    const uiDelta = e.getUIDelta(this._tmpMoveVec2);
    const delta = this._isVertical() ? uiDelta.y : uiDelta.x;
    let pos = this._getContentMainPos() + delta;
    if (this.pixelAlign) pos = Math.round(pos);
    this._setContentMainPos(pos);
    const t = performance.now() / 1000;
    this._velSamples.push({ t, delta });
    const t0 = t - this.velocityWindow;
    while (this._velSamples.length && this._velSamples[0].t < t0) this._velSamples.shift();
    if (this.useVirtualList) this._updateVisible(false);
  }

  private _onUp(e?: EventTouch) {
    if (!this._isTouching) return;
    this._isTouching = false;
    if (this._velSamples.length >= 2) {
      let sum = 0;
      let dtSum = 0;
      const sampleCount = Math.min(this._velSamples.length, 5);
      const startIndex = this._velSamples.length - sampleCount;
      for (let i = startIndex + 1; i < this._velSamples.length; i++) {
        sum += this._velSamples[i].delta;
        dtSum += this._velSamples[i].t - this._velSamples[i - 1].t;
      }
      if (dtSum > 0.001) {
        this._velocity = sum / dtSum;
        this._velocity = math.clamp(this._velocity, -this.maxVelocity, this.maxVelocity);
      } else {
        this._velocity =
          this._velSamples.length > 0 ? math.clamp(this._velSamples[this._velSamples.length - 1].delta * 60, -this.maxVelocity, this.maxVelocity) : 0;
      }
    } else if (this._velSamples.length === 1) {
      this._velocity = math.clamp(this._velSamples[0].delta * 60, -this.maxVelocity, this.maxVelocity);
    } else {
      this._velocity = 0;
    }
    this._velSamples.length = 0;
  }

  private _updateVisible(force: boolean) {
    if (!this.useVirtualList) return;
    let scrollPos = this._getContentMainPos();
    let searchPos: number;
    if (this._isVertical()) {
      searchPos = math.clamp(scrollPos, 0, this._contentSize);
    } else {
      searchPos = math.clamp(-scrollPos, 0, this._contentSize);
    }

    let newFirst = 0;
    if (this.useDynamicSize) {
      const range = this._calcVisibleRange(searchPos);
      newFirst = range.start;
    } else {
      const stride = this.itemMainSize + this.spacing;
      const firstLine = Math.floor(searchPos / stride);
      const first = firstLine * this.gridCount;
      newFirst = math.clamp(first, 0, Math.max(0, this.totalCount - 1));
    }
    if (this.totalCount < this._slots) newFirst = 0;
    if (force) {
      this._slotFirstIndex = newFirst;
      this._layoutSlots(this._slotFirstIndex, true);
      return;
    }
    const diff = newFirst - this._slotFirstIndex;
    if (diff === 0) return;
    if (Math.abs(diff) >= this._slots) {
      this._slotFirstIndex = newFirst;
      this._layoutSlots(this._slotFirstIndex, true);
      return;
    }
    const absDiff = Math.abs(diff);
    if (diff > 0) {
      const moved = this._slotNodes.splice(0, absDiff);
      this._slotNodes.push(...moved);
      if (this.useDynamicSize && this._slotPrefabIndices.length > 0) {
        const movedIndices = this._slotPrefabIndices.splice(0, absDiff);
        this._slotPrefabIndices.push(...movedIndices);
      }
      this._slotFirstIndex = newFirst;
      for (let i = 0; i < absDiff; i++) {
        const slot = this._slots - absDiff + i;
        const idx = this._slotFirstIndex + slot;
        if (idx >= this.totalCount) {
          const node = this._slotNodes[slot];
          if (node) node.active = false;
        } else {
          this._layoutSingleSlot(this._slotNodes[slot], idx, slot);
        }
      }
    } else {
      const moved = this._slotNodes.splice(this._slotNodes.length + diff, absDiff);
      this._slotNodes.unshift(...moved);
      if (this.useDynamicSize && this._slotPrefabIndices.length > 0) {
        const movedIndices = this._slotPrefabIndices.splice(this._slotPrefabIndices.length + diff, absDiff);
        this._slotPrefabIndices.unshift(...movedIndices);
      }
      this._slotFirstIndex = newFirst;
      for (let i = 0; i < absDiff; i++) {
        const idx = this._slotFirstIndex + i;
        if (idx >= this.totalCount) {
          const node = this._slotNodes[i];
          if (node) node.active = false;
        } else {
          this._layoutSingleSlot(this._slotNodes[i], idx, i);
        }
      }
    }
  }

  private async _layoutSingleSlot(node: Node | null, idx: number, slot: number) {
    if (!this.useVirtualList) return;
    if (this.useDynamicSize) {
      let targetPrefabIndex = this.getItemTypeIndexFn(idx);
      const currentPrefabIndex = this._slotPrefabIndices[slot];
      let newNode: Node | null = null;
      if (currentPrefabIndex === targetPrefabIndex && this._slotNodes[slot]) {
        newNode = this._slotNodes[slot];
      } else {
        if (this._slotNodes[slot] && this._nodePool && currentPrefabIndex >= 0) {
          this._nodePool.put(this._slotNodes[slot], currentPrefabIndex);
        }
        if (this._nodePool) {
          newNode = this._nodePool.get(targetPrefabIndex);
          if (!newNode) {
            console.error(`[VScrollView] 无法获取类型 ${targetPrefabIndex} 的节点`);
            return;
          }
          newNode.parent = this.content;
          this._slotNodes[slot] = newNode;
          this._slotPrefabIndices[slot] = targetPrefabIndex;
        }
      }
      if (!newNode) {
        console.error(`[VScrollView] 槽位 ${slot} 节点为空，索引 ${idx}`);
        return;
      }
      newNode.active = true;
      this._updateItemClickHandler(newNode, idx);
      if (this.renderItemFn) this.renderItemFn(newNode, idx);
      if (this.getItemHeightFn) {
        const expectedSize = this.getItemHeightFn(idx);
        if (this._itemSizes[idx] !== expectedSize) {
          this.updateItemHeight(idx, expectedSize);
          return;
        }
      } else {
        const uit = newNode.getComponent(UITransform);
        const actualSize = this._isVertical() ? uit?.height || 100 : uit?.width || 100;
        if (Math.abs(this._itemSizes[idx] - actualSize) > 1) {
          this.updateItemHeight(idx, actualSize);
          return;
        }
      }
      const uit = newNode.getComponent(UITransform);
      const size = this._itemSizes[idx];
      const itemStart = this._prefixPositions[idx];
      if (this._isVertical()) {
        const anchorY = uit?.anchorY ?? 0.5;
        const anchorOffsetY = size * (1 - anchorY);
        const nodeY = itemStart + anchorOffsetY;
        const y = -nodeY;
        newNode.setPosition(0, this.pixelAlign ? Math.round(y) : y);
      } else {
        // 修改：横向模式下，itemStart 是正值，但 content.x 是负值
        // 所以 item 的 x 位置应该直接使用 itemStart（因为 content 整体向左移动）
        const anchorX = uit?.anchorX ?? 0.5;
        const anchorOffsetX = size * anchorX;
        const nodeX = itemStart + anchorOffsetX;
        // 不需要取负，因为 content 本身已经是负值了
        const x = nodeX;
        newNode.setPosition(this.pixelAlign ? Math.round(x) : x, 0);
      }
      if (this._needAnimateIndices.has(idx)) {
        if (this.playItemAppearAnimationFn) this.playItemAppearAnimationFn(newNode, idx);
        else this._playDefaultItemAppearAnimation(newNode, idx);
        this._needAnimateIndices.delete(idx);
      }
    } else {
      if (!node) return;
      node.active = true;
      const stride = this.itemMainSize + this.spacing;
      const line = Math.floor(idx / this.gridCount);
      const gridPos = idx % this.gridCount;
      const uit = node.getComponent(UITransform);
      const itemStart = line * stride;
      if (this._isVertical()) {
        const anchorY = uit?.anchorY ?? 0.5;
        const anchorOffsetY = this.itemMainSize * (1 - anchorY);
        const nodeY = itemStart + anchorOffsetY;
        const y = -nodeY;
        const totalWidth = this.gridCount * this.itemCrossSize + (this.gridCount - 1) * this.gridSpacing;
        const x = gridPos * (this.itemCrossSize + this.gridSpacing) - totalWidth / 2 + this.itemCrossSize / 2;
        node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);
        if (uit) {
          uit.width = this.itemCrossSize;
          uit.height = this.itemMainSize;
        }
      } else {
        const anchorX = uit?.anchorX ?? 0.5;
        const anchorOffsetX = this.itemMainSize * anchorX;
        const nodeX = itemStart + anchorOffsetX;
        const x = nodeX;
        const totalHeight = this.gridCount * this.itemCrossSize + (this.gridCount - 1) * this.gridSpacing;
        const y = totalHeight / 2 - gridPos * (this.itemCrossSize + this.gridSpacing) - this.itemCrossSize / 2;
        node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);
        if (uit) {
          uit.width = this.itemMainSize;
          uit.height = this.itemCrossSize;
        }
      }
      this._updateItemClickHandler(node, idx);
      if (this.renderItemFn) this.renderItemFn(node, idx);
      if (this._needAnimateIndices.has(idx)) {
        if (this.playItemAppearAnimationFn) this.playItemAppearAnimationFn(node, idx);
        else this._playDefaultItemAppearAnimation(node, idx);
        this._needAnimateIndices.delete(idx);
      }
    }
  }

  private _playDefaultItemAppearAnimation(node: Node, index: number) {}

  private _updateItemClickHandler(node: Node, index: number) {
    if (!this.useVirtualList) return;
    let itemScript = node.getComponent(VScrollViewItem);
    if (!itemScript) itemScript = node.addComponent(VScrollViewItem);
    this._initSortLayerFlag ? itemScript.onSortLayer() : itemScript.offSortLayer();
    itemScript.useItemClickEffect = this.onItemClickFn ? true : false;
    if (!itemScript.onClickCallback) {
      itemScript.onClickCallback = (idx: number) => {
        if (this.onItemClickFn) this.onItemClickFn(node, idx);
      };
    }
    itemScript.setDataIndex(index);
  }

  private _layoutSlots(firstIndex: number, forceRender: boolean) {
    if (!this.useVirtualList) return;
    for (let s = 0; s < this._slots; s++) {
      const idx = firstIndex + s;
      const node = this._slotNodes[s];
      if (idx >= this.totalCount) {
        if (node) node.active = false;
      } else {
        this._layoutSingleSlot(node, idx, s);
      }
    }
  }

  private _recomputeContentSize() {
    if (!this.useVirtualList) {
      this._contentSize = this._isVertical() ? this._contentTf.height : this._contentTf.width;
      if (this._isVertical()) {
        this._boundsMin = 0;
        this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
      } else {
        this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
        this._boundsMax = 0;
      }
      return;
    }
    if (this.useDynamicSize) return;
    const stride = this.itemMainSize + this.spacing;
    const totalLines = Math.ceil(this.totalCount / this.gridCount);
    this._contentSize = totalLines > 0 ? totalLines * stride - this.spacing : 0;
    if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
    else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

    if (this._isVertical()) {
      this._boundsMin = 0;
      this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
    } else {
      this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
      this._boundsMax = 0;
    }
  }
}
