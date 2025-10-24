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

/** 渲染函数签名：外部把数据刷到 item 上 */
export type RenderItemFn = (node: Node, index: number) => void;
/** 提供新节点（从对象池取或用 prefab 实例化） */
export type ProvideNodeFn = (index: number) => Node | Promise<Node>; // 新增 index 参数，支持根据索引返回不同预制体
/** 点击回调：返回被点击的索引 */
export type OnItemClickFn = (node: Node, index: number) => void;
/** 新增项出现动画回调签名 */
export type PlayItemAppearAnimationFn = (node: Node, index: number) => void;

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
  private _itemNodesCache: Node[] = []; // 预加载的节点缓存（用于获取高度）

  private get _contentTf(): UITransform {
    this.content = this._getContentNode();
    return this.content!.getComponent(UITransform)!;
  }
  private get _viewportTf(): UITransform {
    return this.node.getComponent(UITransform)!;
  }

  // 新增：记录上一次的总数，用于判断是否是新增的尾部数据
  private _lastTotalCount: number = 0;
  // 新增：标记哪些索引需要播放动画
  private _needAnimateIndices: Set<number> = new Set();

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
    // 1. 预加载所有节点并获取高度
    if (this.itemPrefabs.length === 0 || !this.provideNodeFn) {
      console.error('[VirtualScrollView] 不等高模式需要外部提供 itemPrefabs 和 provideNodeFn');
      return;
    }

    //多预制体子项一定需要提供provideNodeFn回调
    if (!this.provideNodeFn) {
      //   this.provideNodeFn = async (index: number) => {
      //     const prefabIndex = index % this.itemPrefabs.length;
      //     return instantiate(this.itemPrefabs[prefabIndex]);
      //   };
    }

    // 预加载所有节点并缓存
    this._itemNodesCache = [];
    for (let i = 0; i < this.totalCount; i++) {
      let node = this.provideNodeFn(i);
      if (node instanceof Promise) {
        node = await node;
      }
      this._itemNodesCache.push(node);
      const h = node.getComponent(UITransform)?.height || 100;
      this._itemHeights.push(h);
    }

    // 2. 构建前缀和
    this._buildPrefixSum();

    // 3. 计算需要的槽位数（按可视区域 + 缓冲）
    const avgHeight = this._contentH / this.totalCount;
    const visibleCount = Math.ceil(this._viewportH / avgHeight);
    this._slots = Math.min(this.totalCount, visibleCount + this.buffer * 2 + 2);

    // 4. 初始化环形缓冲（复用预加载的节点）
    for (let i = 0; i < this._slots; i++) {
      const node = this._itemNodesCache[i];
      node.parent = this.content!;
      this._slotNodes.push(node);
    }

    this._slotFirstIndex = 0;
    this._layoutSlots(this._slotFirstIndex, true);
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
      console.warn('[VirtualScrollView] 简单滚动模式不支持 setTotalCount');
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

    this._recomputeContentHeight();
    this._slotFirstIndex = math.clamp(this._slotFirstIndex, 0, Math.max(0, this.totalCount - 1));
    this._layoutSlots(this._slotFirstIndex, true);
    this._updateVisible(true);
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
      const duration = Math.max(0.25, distance / 3000); // 基于距离计算时间，最少0.25秒

      this._scrollTween = tween(this.content!)
        .to(
          duration,
          { position: new Vec3(0, targetY, 0) },
          {
            // easing: "cubicOut",
            easing: 'backOut',
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

  public onOffSortLayer(onoff: boolean) {
    for (const element of this._slotNodes) {
      const sitem = element.getComponent(VScrollViewItem);
      if (onoff) sitem.onSortLayer();
      else sitem.offSortLayer();
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
      // 不等高模式：使用二分查找
      const range = this._calcVisibleRange(top);
      newFirst = range.start;
    } else {
      // 等高模式
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
      this._slotFirstIndex = newFirst;

      for (let i = 0; i < absDiff; i++) {
        const slot = this._slots - absDiff + i;
        const idx = this._slotFirstIndex + slot;

        if (idx >= this.totalCount) {
          this._slotNodes[slot].active = false;
        } else {
          this._layoutSingleSlot(this._slotNodes[slot], idx, slot);
        }
      }
    } else {
      const moved = this._slotNodes.splice(this._slotNodes.length + diff, absDiff);
      this._slotNodes.unshift(...moved);
      this._slotFirstIndex = newFirst;

      for (let i = 0; i < absDiff; i++) {
        const idx = this._slotFirstIndex + i;

        if (idx >= this.totalCount) {
          this._slotNodes[i].active = false;
        } else {
          this._layoutSingleSlot(this._slotNodes[i], idx, i);
        }
      }
    }
  }

  /** 布置单个槽位 */
  private _layoutSingleSlot(node: Node, idx: number, slot: number) {
    if (!this.useVirtualList) return;

    node.active = true;

    if (this.useDynamicHeight) {
      // 不等高模式：从预加载缓存中获取节点并替换
      if (this._itemNodesCache[idx] && this._itemNodesCache[idx] !== node) {
        const cachedNode = this._itemNodesCache[idx];
        // 如果当前节点不是目标节点，则替换
        if (node.parent === this.content) {
          const oldIndex = this._slotNodes.indexOf(node);
          if (oldIndex !== -1) {
            this._slotNodes[oldIndex] = cachedNode;
          }
          node.removeFromParent();
          cachedNode.parent = this.content;
          node = cachedNode;
        }
      }

      // 使用前缀和计算位置
      const y = -this._prefixY[idx] - this._itemHeights[idx] / 2;
      node.setPosition(0, this.pixelAlign ? Math.round(y) : y);
    } else {
      // 等高模式
      const stride = this.itemHeight + this.spacing;
      const row = Math.floor(idx / this.columns);
      const col = idx % this.columns;

      const y = -row * stride - this.itemHeight / 2;
      const totalWidth = this.columns * this.itemWidth + (this.columns - 1) * this.columnSpacing;
      const x = col * (this.itemWidth + this.columnSpacing) - totalWidth / 2 + this.itemWidth / 2;

      node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);

      const itf = node.getComponent(UITransform);
      if (itf) {
        itf.width = this.itemWidth;
        itf.height = this.itemHeight;
      }
    }

    this._updateItemClickHandler(node, idx);
    if (this.renderItemFn) this.renderItemFn(node, idx);

    // 检查是否需要播放动画
    if (this._needAnimateIndices.has(idx)) {
      // 优先使用外部传入的动画函数，否则使用默认动画
      if (this.playItemAppearAnimationFn) {
        this.playItemAppearAnimationFn(node, idx);
      } else {
        this._playDefaultItemAppearAnimation(node, idx);
      }
      this._needAnimateIndices.delete(idx); // 播放后移除标记
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
        node.active = false;
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
