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
} from 'cc';
import { VScrollViewItem } from './VScrollViewItem';
const { ccclass, property, menu } = _decorator;

/**
 * 内部节点池（多类型支持）
 */
class InternalNodePool {
  // 每种类型一个对象池
  private pools: Map<number, Node[]> = new Map();
  // 预制体引用
  private prefabs: Prefab[] = [];

  constructor(prefabs: Prefab[]) {
    this.prefabs = prefabs;
    // 初始化每个类型的对象池
    prefabs.forEach((_, index) => {
      this.pools.set(index, []);
    });
  }

  /**
   * 获取指定类型的节点
   * @param typeIndex 类型索引（对应 itemPrefabs 数组索引）
   */
  get(typeIndex: number): Node {
    const pool = this.pools.get(typeIndex);
    if (!pool) {
      console.error(`[VScrollView NodePool] 类型 ${typeIndex} 不存在`);
      return null;
    }

    // 从池中取出节点
    if (pool.length > 0) {
      const node = pool.pop()!;
      node.active = true;
      return node;
    }

    // 池中没有，创建新节点
    const newNode = instantiate(this.prefabs[typeIndex]);
    return newNode;
  }

  /**
   * 回收节点到对应类型的池中
   * @param node 要回收的节点
   * @param typeIndex 类型索引
   */
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

  /**
   * 清空所有对象池
   */
  clear() {
    this.pools.forEach(pool => {
      pool.forEach(node => node.destroy());
      pool.length = 0;
    });
    this.pools.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats: any = {};
    this.pools.forEach((pool, type) => {
      stats[`type${type}`] = pool.length;
    });
    return stats;
  }
}

/** 渲染函数签名：外部把数据刷到 item 上 */
export type RenderItemFn = (node: Node, index: number) => void;
/** 提供新节点（从对象池取或用 prefab 实例化） */
export type ProvideNodeFn = (index: number) => Node | Promise<Node>; // 新增 index 参数，支持根据索引返回不同预制体
/** 点击回调：返回被点击的索引 */
export type OnItemClickFn = (node: Node, index: number) => void;
/** 新增项出现动画回调签名 */
export type PlayItemAppearAnimationFn = (node: Node, index: number) => void;
/** 获取指定索引的高度回调 */
export type GetItemHeightFn = (index: number) => number;
/** 获取指定索引对应的预制体类型索引 */
export type GetItemTypeIndexFn = (index: number) => number;

/**
 * 虚拟滚动列表组件
 * - 支持虚拟列表和简单滚动两种模式
 * - 虚拟列表模式下支持等高 Grid 布局和不等高单列布局
 * - 使用环形缓冲实现高性能逻辑
 * - 支持外部注入渲染、节点提供和点击回调
 */
@ccclass('VirtualScrollView')
@menu('2D/VirtualScrollView(虚拟滚动列表)')
export class VirtualScrollView extends Component {
  // === 必填引用 ===
  @property({ type: Node, displayName: '容器节点', tooltip: 'content 容器节点（在 Viewport 下）' })
  public content: Node | null = null;

  @property({
    displayName: '启用虚拟列表',
    tooltip: '是否启用虚拟列表模式（关闭则仅提供滚动功能）',
  })
  public useVirtualList: boolean = true;

  @property({
    type: Prefab,
    displayName: '子项预制体',
    tooltip: '可选：从 Prefab 创建 item（等高模式）',
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicHeight;
    },
  })
  public itemPrefab: Prefab | null = null;

  @property({
    displayName: '子项点击效果',
    tooltip: '子项点击时是否有交互效果',
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public useItemClickEffect: boolean = true;

  // === 新增：不等高模式 ===
  @property({
    displayName: '不等高模式',
    tooltip: '启用不等高模式（仅支持单列）',
    visible(this: VirtualScrollView) {
      return this.useVirtualList;
    },
  })
  public useDynamicHeight: boolean = false;

  @property({
    type: [Prefab],
    displayName: '子项预制体数组',
    tooltip: '不等高模式：预先提供的子项预制体数组（可在编辑器拖入）',
    visible(this: VirtualScrollView) {
      return this.useVirtualList && this.useDynamicHeight;
    },
  })
  public itemPrefabs: Prefab[] = [];

  // === 列表配置 ===
  private itemHeight: number = 100;
  private itemWidth: number = 100;

  @property({
    displayName: '列数',
    tooltip: '每行列数（Grid模式，1为单列）',
    range: [1, 10, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicHeight;
    },
  })
  public columns: number = 1;

  @property({
    displayName: '列间距',
    tooltip: '列间距（像素，Grid模式）',
    range: [0, 1000, 1],
    visible(this: VirtualScrollView) {
      return this.useVirtualList && !this.useDynamicHeight;
    },
  })
  public columnSpacing: number = 8;

  @property({
    displayName: '项间距',
    tooltip: '项间距（像素）',
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

  // === 惯性/回弹参数 ===
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

  // === 可选：外部注入的回调 ===
  public renderItemFn: RenderItemFn | null = null;
  public provideNodeFn: ProvideNodeFn | null = null;
  public onItemClickFn: OnItemClickFn | null = null;
  public playItemAppearAnimationFn: PlayItemAppearAnimationFn | null = null; // 新增：Item出现动画回调

  // 新增：不等高模式的高度获取回调
  public getItemHeightFn: GetItemHeightFn | null = null;
  // 新增：获取指定索引对应的预制体类型索引
  public getItemTypeIndexFn: GetItemTypeIndexFn | null = null;

  // === 运行时状态 ===
  private _viewportH = 0;
  private _contentH = 0;
  private _boundsMin = 0;
  private _boundsMax = 0;
  private _velocity = 0;
  private _isTouching = false;
  private _velSamples: { t: number; dy: number }[] = [];

  // 环形缓冲
  private _slotNodes: Node[] = [];
  private _slots = 0;
  private _slotFirstIndex = 0;

  // === 新增：不等高支持 ===
  private _itemHeights: number[] = []; // 每个 item 的实际高度
  private _prefixY: number[] = []; // 前缀和：第 i 项的顶部 Y 坐标

  // 新增：预制体高度缓存
  private _prefabHeightCache: Map<number, number> = new Map();

  // === 内部节点池 ===
  private _nodePool: InternalNodePool | null = null;
  // 记录每个槽位当前的预制体类型索引
  private _slotPrefabIndices: number[] = [];

  private get _contentTf(): UITransform {
    this.content = this._getContentNode();
    return this.content!.getComponent(UITransform)!;
  }
  private get _viewportTf(): UITransform {
    return this.node.getComponent(UITransform)!;
  }

  // 新增：标记哪些索引需要播放动画
  private _needAnimateIndices: Set<number> = new Set();

  //初始分层设置标记,默认是分层
  private _initSortLayerFlag: boolean = true;

  private _getContentNode(): Node {
    if (!this.content) {
      console.warn(`[VirtualScrollView] :${this.node.name} 请在属性面板绑定 content 容器节点`);
      this.content = this.node.getChildByName('content');
    }
    return this.content;
  }

  async start() {
    this.content = this._getContentNode();
    if (!this.content) return;

    const mask = this.node.getComponent(Mask);
    if (!mask) {
      console.warn('[VirtualScrollView] 建议在视窗节点挂一个 Mask 组件用于裁剪');
    }

    this.columns = Math.round(this.columns);
    this.columns = Math.max(1, this.columns);
    // 简单滚动模式
    if (!this.useVirtualList) {
      this._viewportH = this._viewportTf.height;
      this._contentH = this._contentTf.height;
      this._boundsMin = 0;
      this._boundsMax = Math.max(0, this._contentH - this._viewportH);
      this._bindTouch();
      this._bindGlobalTouch();
      return;
    }

    // 虚拟列表模式：清空 content
    this.content.removeAllChildren();

    this._viewportH = this._viewportTf.height;

    // 不等高模式初始化
    if (this.useDynamicHeight) {
      await this._initDynamicHeightMode();
    } else {
      // 等高模式初始化
      await this._initFixedHeightMode();
    }

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

    // 清理节点池
    if (this._nodePool) {
      this._nodePool.clear();
      this._nodePool = null;
    }
  }

  /** 绑定触摸事件 */
  private _bindTouch() {
    this.node.on(Node.EventType.TOUCH_START, this._onDown, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this._onMove, this);
    this.node.on(Node.EventType.TOUCH_END, this._onUp, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this._onUp, this);
  }

  /** 绑定全局触摸监听（确保一定能捕获到触摸结束） */
  private _bindGlobalTouch() {
    // 监听全局触摸结束事件
    input.on(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
  }

  /** 全局触摸结束回调 */
  private _onGlobalTouchEnd(event: EventTouch) {
    // 只有在触摸状态时才处理
    if (this._isTouching) {
      console.log('[VScrollView] Global touch end detected');
      this._onUp(event);
    }
  }

  /** 等高模式初始化 */
  private async _initFixedHeightMode() {
    // 默认的 provide
    if (!this.provideNodeFn) {
      this.provideNodeFn = (index: number) => {
        if (this.itemPrefab) {
          return instantiate(this.itemPrefab);
        }
        console.warn('[VirtualScrollView] 没有提供 itemPrefab');
        const n = new Node('item-auto-create');
        n.addComponent(UITransform).setContentSize(this._viewportTf.width, this.itemHeight);
        return n;
      };
    }

    // 自动设置 itemHeight
    let item_pre = this.provideNodeFn(0);
    if (item_pre instanceof Promise) {
      item_pre = await item_pre;
    }
    const uit = item_pre.getComponent(UITransform);
    this.itemHeight = uit.height;
    this.itemWidth = uit.width;

    this._recomputeContentHeight();

    // 环形缓冲初始化
    const stride = this.itemHeight + this.spacing;
    const visibleRows = Math.ceil(this._viewportH / stride);
    this._slots = Math.max(1, (visibleRows + this.buffer + 2) * this.columns);

    for (let i = 0; i < this._slots; i++) {
      const n = instantiate(item_pre);
      n.parent = this.content!;
      const itf = n.getComponent(UITransform);
      if (itf) {
        itf.width = this.itemWidth;
        itf.height = this.itemHeight;
      }
      this._slotNodes.push(n);
    }

    this._slotFirstIndex = 0;
    this._layoutSlots(this._slotFirstIndex, true);
  }

  /** 不等高模式初始化 */
  private async _initDynamicHeightMode() {
    // 场景A：外部提供了 getItemHeightFn（最优先）
    if (this.getItemHeightFn) {
      console.log('[VirtualScrollView] 使用外部提供的 getItemHeightFn');
      this._itemHeights = [];
      for (let i = 0; i < this.totalCount; i++) {
        const h = this.getItemHeightFn(i);
        this._itemHeights.push(h);
      }
      this._buildPrefixSum();
      // ✅ 也需要初始化节点池（如果有 itemPrefabs）
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

    // 场景B：采样模式（需要 itemPrefabs + getItemTypeIndexFn）
    if (this.itemPrefabs.length === 0 || !this.getItemTypeIndexFn) {
      console.error(
        '[VirtualScrollView] 不等高模式必须提供以下之一：\n' +
          '1. getItemHeightFn 回调函数\n' +
          '2. itemPrefabs 数组 + getItemTypeIndexFn 回调函数'
      );
      return;
    }

    console.log('[VirtualScrollView] 使用采样模式（从 itemPrefabs 采样高度）');

    // 初始化节点池
    this._nodePool = new InternalNodePool(this.itemPrefabs);

    // 1. 采样每个预制体的高度（只创建预制体数量的样本节点）
    this._prefabHeightCache.clear();
    for (let i = 0; i < this.itemPrefabs.length; i++) {
      const sampleNode = instantiate(this.itemPrefabs[i]);
      const h = sampleNode.getComponent(UITransform)?.height || 100;
      this._prefabHeightCache.set(i, h);
      sampleNode.destroy(); // 立即销毁样本节点
      console.log(`[VirtualScrollView] 预制体[${i}] 采样高度: ${h}`);
    }

    // 2. 为每个索引分配高度（通过 getItemTypeIndexFn 获取类型索引）
    this._itemHeights = [];
    for (let i = 0; i < this.totalCount; i++) {
      const typeIndex = this.getItemTypeIndexFn(i); // ✅ 只调用函数，不创建节点
      const height = this._prefabHeightCache.get(typeIndex);

      if (height !== undefined) {
        this._itemHeights.push(height);
      } else {
        console.warn(`[VirtualScrollView] 索引 ${i} 的类型索引 ${typeIndex} 无效，使用默认高度`);
        this._itemHeights.push(this._prefabHeightCache.get(0) || 100);
      }
    }

    // 3. 构建前缀和
    this._buildPrefixSum();

    // 4. 初始化环形缓冲（不创建任何节点）
    this._initDynamicSlots();
  }

  /** 初始化不等高模式的环形缓冲槽位 */
  private _initDynamicSlots() {
    const avgHeight = this._contentH / this.totalCount || 100;
    const visibleCount = Math.ceil(this._viewportH / avgHeight);

    // ✅ 计算需要的槽位数（加上缓冲）
    let neededSlots = visibleCount + this.buffer * 2 + 4;

    // ✅ 保证最小槽位数量（至少能容纳视口 + 一倍缓冲）
    const minSlots = Math.ceil(this._viewportH / 80) + this.buffer * 2; // 假设最小高度80px
    neededSlots = Math.max(neededSlots, minSlots);

    // ✅ 限制最大槽位数量（避免初始数据少时创建过多槽位）
    const maxSlots = Math.ceil(this._viewportH / 50) + this.buffer * 4; // 假设最小高度50px
    neededSlots = Math.min(neededSlots, maxSlots);

    // ✅ 不能超过总数据量（但允许预留空间）
    this._slots = Math.min(neededSlots, Math.max(this.totalCount, minSlots));

    // 不预先创建节点，_slotNodes 为空数组
    this._slotNodes = new Array(this._slots).fill(null);
    // 初始化槽位类型索引数组
    this._slotPrefabIndices = new Array(this._slots).fill(-1);

    this._slotFirstIndex = 0;
    this._layoutSlots(this._slotFirstIndex, true);

    console.log(
      `[VScrollView] 初始化槽位: ${this._slots} (总数据: ${this.totalCount}, 视口高度: ${this._viewportH})`
    );
  }

  /** 构建前缀和数组 */
  private _buildPrefixSum() {
    const n = this._itemHeights.length;
    this._prefixY = new Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this._prefixY[i] = acc;
      acc += this._itemHeights[i] + this.spacing;
    }
    this._contentH = acc - this.spacing; // 去掉最后一个 spacing
    if (this._contentH < 0) this._contentH = 0;

    this._contentTf.height = Math.max(this._contentH, this._viewportH);
    this._boundsMin = 0;
    this._boundsMax = Math.max(0, this._contentH - this._viewportH);
  }

  /** 不等高模式：根据滚动位置计算首个可见索引（二分查找） */
  private _yToFirstIndex(y: number): number {
    if (y <= 0) return 0;
    let l = 0,
      r = this._prefixY.length - 1,
      ans = this._prefixY.length;
    while (l <= r) {
      const m = (l + r) >> 1;
      if (this._prefixY[m] > y) {
        ans = m;
        r = m - 1;
      } else {
        l = m + 1;
      }
    }
    return Math.max(0, ans - 1);
  }

  /** 不等高模式：计算可见区间 [start, end) */
  private _calcVisibleRange(scrollY: number): { start: number; end: number } {
    const n = this._prefixY.length;
    if (n === 0) return { start: 0, end: 0 };

    const start = this._yToFirstIndex(scrollY);
    const bottom = scrollY + this._viewportH;

    let end = start;
    while (end < n) {
      const topY = this._prefixY[end];
      const h = this._itemHeights[end];
      if (topY >= bottom) break;
      end++;
    }

    // 加上缓冲区
    return {
      start: Math.max(0, start - this.buffer),
      end: Math.min(n, end + this.buffer),
    };
  }

  update(dt: number) {
    //如果正在执行 tween 动画，不要执行 update 的物理模拟
    if (!this.content || this._isTouching || this._scrollTween) return;

    let y = this.content!.position.y;
    let a = 0;

    if (y < this._boundsMin) {
      a = -this.springK * (y - this._boundsMin) - this.springC * this._velocity;
    } else if (y > this._boundsMax) {
      a = -this.springK * (y - this._boundsMax) - this.springC * this._velocity;
    } else {
      if (this.useIOSDecelerationCurve) {
        const speed = Math.abs(this._velocity);
        if (speed > 2000) {
          this._velocity *= Math.exp(-this.inertiaDampK * 0.7 * dt);
        } else if (speed > 500) {
          this._velocity *= Math.exp(-this.inertiaDampK * dt);
        } else {
          this._velocity *= Math.exp(-this.inertiaDampK * 1.3 * dt);
        }
      } else {
        this._velocity *= Math.exp(-this.inertiaDampK * dt);
      }
    }

    this._velocity += a * dt;
    if (Math.abs(this._velocity) < this.velocitySnap && a === 0) {
      this._velocity = 0;
    }

    if (this._velocity !== 0) {
      y += this._velocity * dt;
      if (this.pixelAlign) y = Math.round(y);
      this._setContentY(y);
      if (this.useVirtualList) {
        this._updateVisible(false);
      }
    }
  }

  /**
   * 更新指定索引的高度（用于动态内容，如聊天列表）
   * @param index 要更新的索引
   * @param newHeight 新的高度（可选，如果不提供则调用 getItemHeightFn）
   */
  public updateItemHeight(index: number, newHeight?: number) {
    if (!this.useDynamicHeight) {
      console.warn('[VScrollView] 只有不等高模式支持 updateItemHeight');
      return;
    }

    if (index < 0 || index >= this.totalCount) {
      console.warn(`[VScrollView] 索引 ${index} 超出范围`);
      return;
    }

    // 获取新高度
    let height = newHeight;
    if (height === undefined) {
      if (this.getItemHeightFn) {
        height = this.getItemHeightFn(index);
      } else {
        console.error('[VScrollView] 没有提供 newHeight 参数，且未设置 getItemHeightFn');
        return;
      }
    }

    // 如果高度没变，不需要更新
    if (this._itemHeights[index] === height) {
      return;
    }

    // 更新高度数组
    this._itemHeights[index] = height;

    // 重新构建前缀和（从当前索引开始）
    this._rebuildPrefixSumFrom(index);

    // 重新布局可见节点
    this._updateVisible(true);
  }

  /**
   * 从指定索引开始重新计算前缀和
   */
  private _rebuildPrefixSumFrom(startIndex: number) {
    if (startIndex === 0) {
      // 从头开始重建
      this._buildPrefixSum();
      return;
    }

    // 从 startIndex 开始重新计算
    let acc = this._prefixY[startIndex - 1] + this._itemHeights[startIndex - 1] + this.spacing;

    for (let i = startIndex; i < this._itemHeights.length; i++) {
      this._prefixY[i] = acc;
      acc += this._itemHeights[i] + this.spacing;
    }

    // 更新 content 高度和边界
    this._contentH = acc - this.spacing;
    if (this._contentH < 0) this._contentH = 0;

    this._contentTf.height = Math.max(this._contentH, this._viewportH);
    this._boundsMin = 0;
    this._boundsMax = Math.max(0, this._contentH - this._viewportH);
  }

  /**
   * 批量更新多个索引的高度（性能优化版）
   * @param updates 更新数组 [{index: number, height: number}, ...]
   */
  public updateItemHeights(updates: Array<{ index: number; height: number }>) {
    if (!this.useDynamicHeight) {
      console.warn('[VScrollView] 只有不等高模式支持 updateItemHeights');
      return;
    }

    if (updates.length === 0) return;

    // 找到最小的更新索引
    let minIndex = this.totalCount;
    let hasChange = false;

    for (const { index, height } of updates) {
      if (index < 0 || index >= this.totalCount) continue;

      if (this._itemHeights[index] !== height) {
        this._itemHeights[index] = height;
        minIndex = Math.min(minIndex, index);
        hasChange = true;
      }
    }

    if (!hasChange) return;

    // 从最小索引开始重建前缀和
    this._rebuildPrefixSumFrom(minIndex);

    // 重新布局
    this._updateVisible(true);
  }

  // =============== 对外 API ===============
  /** 列表并不引用和使用外部任何数据 */
  public refreshList(data: any[] | number) {
    if (!this.useVirtualList) {
      console.warn('[VirtualScrollView] 简单滚动模式不支持 refreshList');
      return;
    }
    if (typeof data === 'number') {
      this.setTotalCount(data);
    } else {
      this.setTotalCount(data.length);
    }
  }

  public setTotalCount(count: number) {
    this._getContentNode();
    if (!this.useVirtualList) {
      console.warn('[VScrollView] 非虚拟列表模式，不支持 setTotalCount');
      return;
    }
    const oldCount = this.totalCount;
    this.totalCount = Math.max(0, count | 0);

    // 如果是增加数据，标记新增的索引需要播放动画
    if (this.totalCount > oldCount) {
      for (let i = oldCount; i < this.totalCount; i++) {
        this._needAnimateIndices.add(i);
      }
    }

    // 不等高模式下扩展高度数组
    if (this.useDynamicHeight) {
      // 扩展 _itemHeights 数组
      const oldLength = this._itemHeights.length;
      if (this.totalCount > oldLength) {
        // 为新增的索引分配高度
        for (let i = oldLength; i < this.totalCount; i++) {
          let height = 100; // 默认高度

          // 优先使用 getItemHeightFn
          if (this.getItemHeightFn) {
            height = this.getItemHeightFn(i);
          }
          // 否则使用预制体采样高度
          else if (this.getItemTypeIndexFn && this._prefabHeightCache.size > 0) {
            const typeIndex = this.getItemTypeIndexFn(i);
            height = this._prefabHeightCache.get(typeIndex) || 100;
          }

          this._itemHeights.push(height);
        }
      } else if (this.totalCount < oldLength) {
        // 减少数据时截断数组
        this._itemHeights.length = this.totalCount;
      }

      // 重新构建前缀和
      this._buildPrefixSum();

      // ✅ 新增：动态扩展槽位
      if (this.totalCount > oldCount) {
        this._expandSlotsIfNeeded();
      }
    } else {
      // 等高模式使用原有逻辑
      this._recomputeContentHeight();
    }

    this._slotFirstIndex = math.clamp(this._slotFirstIndex, 0, Math.max(0, this.totalCount - 1));
    this._layoutSlots(this._slotFirstIndex, true);
    this._updateVisible(true);
  }

  /**
   * 动态扩展槽位（不等高模式）
   */
  private _expandSlotsIfNeeded() {
    // 计算当前需要的槽位数
    let neededSlots = 0;
    let y = 0;
    const bottom = this._viewportH;

    for (let i = 0; i < this.totalCount; i++) {
      if (y >= bottom) break;
      neededSlots++;
      y += this._itemHeights[i] + this.spacing;
    }

    // 加上缓冲
    neededSlots += this.buffer * 2 + 4;

    // ✅ 保证最小槽位数量
    const minSlots = Math.ceil(this._viewportH / 80) + this.buffer * 2;
    neededSlots = Math.max(neededSlots, minSlots);

    // ✅ 限制在合理范围
    const maxSlots = Math.ceil(this._viewportH / 50) + this.buffer * 4;
    neededSlots = Math.min(neededSlots, maxSlots);

    // 如果需要更多槽位
    if (neededSlots > this._slots) {
      const oldSlots = this._slots;
      this._slots = neededSlots;

      // 扩展槽位数组
      for (let i = oldSlots; i < this._slots; i++) {
        this._slotNodes.push(null);
        this._slotPrefabIndices.push(-1);
      }

      console.log(
        `[VScrollView] 槽位扩展: ${oldSlots} -> ${this._slots} (总数据: ${this.totalCount})`
      );
    }
  }

  private _scrollTween: any = null;
  private _scrollToPosition(targetY: number, animate = false) {
    targetY = math.clamp(targetY, this._boundsMin, this._boundsMax);

    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }

    this._velocity = 0; //  清除惯性速度
    this._isTouching = false; //  确保不在触摸状态
    this._velSamples.length = 0; //  清空速度样本

    if (!animate) {
      // this._velocity = 0;
      this._setContentY(this.pixelAlign ? Math.round(targetY) : targetY);
      this._updateVisible(true);
    } else {
      this._velocity = 0;
      this._isTouching = false;

      const currentY = this.content!.position.y;
      const distance = Math.abs(targetY - currentY);
      const duration = Math.max(0.2, distance / 3000);

      this._scrollTween = tween(this.content!)
        .to(
          duration,
          { position: new Vec3(0, targetY, 0) },
          {
            // easing: "cubicOut",
            // easing: 'backOut',
            easing: 'smooth',
            onUpdate: () => {
              this._updateVisible(false);
            },
          }
        )
        .call(() => {
          this._updateVisible(true);
          this._scrollTween = null;
          // 动画结束后再次确保速度为0
          this._velocity = 0;
        })
        .start();
    }
  }

  public scrollToTop(animate = false) {
    this._scrollToPosition(this._boundsMin, animate);
  }

  public scrollToBottom(animate = false) {
    this._scrollToPosition(this._boundsMax, animate);
  }

  public scrollToIndex(index: number, animate = false) {
    index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));

    let targetY = 0;
    if (this.useDynamicHeight) {
      targetY = this._prefixY[index] || 0;
    } else {
      const row = Math.floor(index / this.columns);
      targetY = row * (this.itemHeight + this.spacing);
    }

    this._scrollToPosition(targetY, animate);
  }

  //以防初始化时候调用此接口子项组件还未初始化,先标记
  public onOffSortLayer(onoff: boolean) {
    this._initSortLayerFlag = onoff;
    this._onOffSortLayerOperation();
  }

  //具体操作
  private _onOffSortLayerOperation(){
    for (const element of this._slotNodes) {
      const sitem = element.getComponent(VScrollViewItem);
      if(sitem){
        if (this._initSortLayerFlag) sitem.onSortLayer();
        else sitem.offSortLayer();
      }
    }
  }


  /** 立即跳转到指定位置（无动画） */
  private _flashToPosition(targetY: number) {
    targetY = math.clamp(targetY, this._boundsMin, this._boundsMax);

    // 停止所有动画和惯性
    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }
    this._velocity = 0; // ← 清除惯性速度
    this._isTouching = false; // ← 确保不在触摸状态
    this._velSamples.length = 0; // ← 清空速度样本

    // 立即设置位置
    this._setContentY(this.pixelAlign ? Math.round(targetY) : targetY);
    this._updateVisible(true);
  }

  /** 立即跳转到顶部（无动画） */
  public flashToTop() {
    this._flashToPosition(this._boundsMin);
  }

  /** 立即跳转到底部（无动画） */
  public flashToBottom() {
    this._flashToPosition(this._boundsMax);
  }

  /** 立即跳转到指定索引（无动画） */
  public flashToIndex(index: number) {
    if (!this.useVirtualList) {
      console.warn('[VirtualScrollView] 简单滚动模式不支持 flashToIndex');
      return;
    }

    index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));

    let targetY = 0;
    if (this.useDynamicHeight) {
      targetY = this._prefixY[index] || 0;
    } else {
      const row = Math.floor(index / this.columns);
      targetY = row * (this.itemHeight + this.spacing);
    }

    this._flashToPosition(targetY);
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

  // =============== 触摸处理 ===============
  private _onDown(e: EventTouch) {
    // console.log("Touch down");
    this._isTouching = true;
    this._velocity = 0;
    this._velSamples.length = 0;

    if (this._scrollTween) {
      this._scrollTween.stop();
      this._scrollTween = null;
    }
  }

  private _onMove(e: EventTouch) {
    // 确保在触摸状态才处理
    if (!this._isTouching) return;

    const dy = e.getDeltaY();
    let y = this.content!.position.y + dy;

    if (this.pixelAlign) y = Math.round(y);
    this._setContentY(y);

    const t = performance.now() / 1000;
    this._velSamples.push({ t, dy });
    const t0 = t - this.velocityWindow;
    while (this._velSamples.length && this._velSamples[0].t < t0) this._velSamples.shift();

    if (this.useVirtualList) {
      this._updateVisible(false);
    }
  }

  private _onUp(e?: EventTouch) {
    // console.log("Touch up");
    // 防止重复调用
    if (!this._isTouching) return;
    this._isTouching = false;
    // if (this._velSamples.length >= 2) {
    // 	let sum = 0,
    // 		dtSum = 0;
    // 	for (let i = 1; i < this._velSamples.length; i++) {
    // 		sum += this._velSamples[i].dy;
    // 		dtSum += this._velSamples[i].t - this._velSamples[i - 1].t;
    // 	}
    // 	if (dtSum > 0) {
    // 		this._velocity = sum / dtSum;
    // 		this._velocity = math.clamp(this._velocity, -this.maxVelocity, this.maxVelocity);
    // 	}
    // } else {
    // 	this._velocity = 0;
    // }
    // this._velSamples.length = 0;

    // 计算速度
    if (this._velSamples.length >= 2) {
      let sum = 0;
      let dtSum = 0;

      // 使用最近的几个样本计算速度（更准确）
      const sampleCount = Math.min(this._velSamples.length, 5);
      const startIndex = this._velSamples.length - sampleCount;

      for (let i = startIndex + 1; i < this._velSamples.length; i++) {
        sum += this._velSamples[i].dy;
        dtSum += this._velSamples[i].t - this._velSamples[i - 1].t;
      }

      // 确保时间差大于最小阈值（避免除以接近0的数）
      if (dtSum > 0.001) {
        this._velocity = sum / dtSum;
        this._velocity = math.clamp(this._velocity, -this.maxVelocity, this.maxVelocity);
      } else {
        // 时间太短，使用最后一次的速度方向
        this._velocity =
          this._velSamples.length > 0
            ? math.clamp(
                this._velSamples[this._velSamples.length - 1].dy * 60,
                -this.maxVelocity,
                this.maxVelocity
              )
            : 0;
      }
    } else if (this._velSamples.length === 1) {
      // 只有一个样本，估算速度（假设60fps）
      this._velocity = math.clamp(this._velSamples[0].dy * 60, -this.maxVelocity, this.maxVelocity);
    } else {
      // 没有样本，速度为0
      this._velocity = 0;
    }

    // 清空样本
    this._velSamples.length = 0;

    // console.log(`[VScrollView] Release velocity: ${this._velocity.toFixed(2)}`);
  }

  // =============== 可见窗口（环形缓冲）===============
  private _updateVisible(force: boolean) {
    if (!this.useVirtualList) return;

    const top = this.content!.position.y;
    let newFirst = 0;

    if (this.useDynamicHeight) {
      const range = this._calcVisibleRange(top);
      newFirst = range.start;
    } else {
      const stride = this.itemHeight + this.spacing;
      const firstRow = Math.floor(top / stride);
      const first = firstRow * this.columns;
      newFirst = math.clamp(first, 0, Math.max(0, this.totalCount - 1));
    }

    if (this.totalCount < this._slots) {
      newFirst = 0;
    }

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

      // ✅ 同步移动预制体索引数组
      if (this.useDynamicHeight && this._slotPrefabIndices.length > 0) {
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

      // ✅ 同步移动预制体索引数组
      if (this.useDynamicHeight && this._slotPrefabIndices.length > 0) {
        const movedIndices = this._slotPrefabIndices.splice(
          this._slotPrefabIndices.length + diff,
          absDiff
        );
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

  /** 布置单个槽位 */
  private async _layoutSingleSlot(node: Node | null, idx: number, slot: number) {
    if (!this.useVirtualList) return;

    if (this.useDynamicHeight) {
      // 获取当前索引应该使用的预制体类型
      let targetPrefabIndex = -1;
      targetPrefabIndex = this.getItemTypeIndexFn(idx);

      // 检查槽位中的节点类型是否匹配
      const currentPrefabIndex = this._slotPrefabIndices[slot];
      let newNode: Node | null = null;

      if (currentPrefabIndex === targetPrefabIndex && this._slotNodes[slot]) {
        // 类型匹配，复用节点
        newNode = this._slotNodes[slot];
      } else {
        // 类型不匹配，需要更换节点

        // 回收旧节点到对象池
        if (this._slotNodes[slot] && this._nodePool && currentPrefabIndex >= 0) {
          this._nodePool.put(this._slotNodes[slot], currentPrefabIndex);
        }

        // 从对象池获取新节点（池中没有时会自动创建）
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

      // 先渲染数据（可能改变节点高度）
      this._updateItemClickHandler(newNode, idx);
      if (this.renderItemFn) {
        this.renderItemFn(newNode, idx);
      }

      // ✅ 渲染后检测高度变化（用于动态内容）
      if (this.getItemHeightFn) {
        // 如果提供了 getItemHeightFn，以它为准（外部管理高度）
        const expectedHeight = this.getItemHeightFn(idx);
        if (this._itemHeights[idx] !== expectedHeight) {
          this.updateItemHeight(idx, expectedHeight);
          return; // 高度更新后会重新调用 _updateVisible，避免重复布局
        }
      } else {
        // 否则自动测量节点实际高度
        const actualHeight = newNode.getComponent(UITransform)?.height || 100;
        if (Math.abs(this._itemHeights[idx] - actualHeight) > 1) {
          // 高度变化超过1像素，更新
          this.updateItemHeight(idx, actualHeight);
          return;
        }
      }

      // ✅ 获取节点的锚点和高度
      const uit = newNode.getComponent(UITransform);
      const anchorY = uit?.anchorY ?? 0.5;
      const height = this._itemHeights[idx];

      // ✅ 根据锚点计算位置
      const topY = this._prefixY[idx];
      const anchorOffsetY = height * (1 - anchorY);
      const nodeY = topY + anchorOffsetY;

      const y = -nodeY;
      newNode.setPosition(0, this.pixelAlign ? Math.round(y) : y);

      // // 使用前缀和计算位置
      // const y = -this._prefixY[idx] - this._itemHeights[idx] / 2;
      // newNode.setPosition(0, this.pixelAlign ? Math.round(y) : y);

      // 检查是否需要播放动画
      if (this._needAnimateIndices.has(idx)) {
        if (this.playItemAppearAnimationFn) {
          this.playItemAppearAnimationFn(newNode, idx);
        } else {
          this._playDefaultItemAppearAnimation(newNode, idx);
        }
        this._needAnimateIndices.delete(idx);
      }
    } else {
      // 等高模式
      if (!node) return;
      node.active = true;

      const stride = this.itemHeight + this.spacing;
      const row = Math.floor(idx / this.columns);
      const col = idx % this.columns;

      // ✅ 获取节点的锚点
      const uit = node.getComponent(UITransform);
      const anchorY = uit?.anchorY ?? 0.5;

      // ✅ 根据锚点计算 Y 位置
      const topY = row * stride; // 节点顶部在 content 中的 Y 坐标
      const anchorOffsetY = this.itemHeight * (1 - anchorY); // 锚点相对于顶部的偏移
      const nodeY = topY + anchorOffsetY; // 锚点在 content 中的 Y 坐标
      const y = -nodeY; // Cocos Y 轴向上为正

      const totalWidth = this.columns * this.itemWidth + (this.columns - 1) * this.columnSpacing;
      const x = col * (this.itemWidth + this.columnSpacing) - totalWidth / 2 + this.itemWidth / 2;

      node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);

      const itf = node.getComponent(UITransform);
      if (itf) {
        itf.width = this.itemWidth;
        itf.height = this.itemHeight;
      }

      this._updateItemClickHandler(node, idx);
      if (this.renderItemFn) this.renderItemFn(node, idx);

      if (this._needAnimateIndices.has(idx)) {
        if (this.playItemAppearAnimationFn) {
          this.playItemAppearAnimationFn(node, idx);
        } else {
          this._playDefaultItemAppearAnimation(node, idx);
        }
        this._needAnimateIndices.delete(idx);
      }
    }
  }

  /** 播放Item出现动画 */
  private _playDefaultItemAppearAnimation(node: Node, index: number) {
    // // 停止可能存在的旧动画
    // Tween.stopAllByTarget(node);
    // // 从0.3倍缩放到1倍
    // node.setScale(0.3, 0.3, 1);
    // tween(node)
    // 	.bindNodeState(true)
    // 	.to(
    // 		0.3,
    // 		{ scale: new Vec3(1, 1, 1) },
    // 		{
    // 			easing: "backOut", // 使用回弹效果
    // 		}
    // 	)
    // 	.start();
  }

  private _updateItemClickHandler(node: Node, index: number) {
    if (!this.useVirtualList) return;

    let itemScript = node.getComponent(VScrollViewItem);
    if (!itemScript) {
      itemScript = node.addComponent(VScrollViewItem);
    }

    this._initSortLayerFlag ? itemScript.onSortLayer() : itemScript.offSortLayer();
    itemScript.useItemClickEffect = this.useItemClickEffect;
    
    if (!itemScript.onClickCallback) {
      itemScript.onClickCallback = (idx: number) => {
        if (this.onItemClickFn) {
          this.onItemClickFn(node, idx);
        }
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

  // =============== 尺寸与边界计算 ===============
  private _recomputeContentHeight() {
    if (!this.useVirtualList) {
      this._contentH = this._contentTf.height;
      this._boundsMin = 0;
      this._boundsMax = Math.max(0, this._contentH - this._viewportH);
      return;
    }

    if (this.useDynamicHeight) {
      // 不等高模式已在 _buildPrefixSum 中计算
      return;
    }

    // 等高模式
    const stride = this.itemHeight + this.spacing;
    const totalRows = Math.ceil(this.totalCount / this.columns);
    this._contentH = totalRows > 0 ? totalRows * stride - this.spacing : 0;

    this._contentTf.height = Math.max(this._contentH, this._viewportH);
    this._boundsMin = 0;
    this._boundsMax = Math.max(0, this._contentH - this._viewportH);
  }

  private _setContentY(y: number) {
    if (!Number.isFinite(y)) return;
    const p = this.content!.position;
    if (this.pixelAlign) y = Math.round(y);
    if (y === p.y) return;
    this.content!.setPosition(p.x, y, p.z);
  }
}
