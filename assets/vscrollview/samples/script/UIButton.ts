import {
  _decorator,
  Component,
  EventMouse,
  EventTouch,
  Input,
  Node,
  Rect,
  Sprite,
  Tween,
  tween,
  UITransform,
  Vec2,
  Vec3,
} from 'cc';

import { DEV } from 'cc/env';

const { ccclass, property } = _decorator;

export type BUTTON_CALLBACK = (button: UIButton, evt: EventTouch) => void | Promise<any>;
export type BUTTON_MOUSE_CALLBACK = (button: UIButton, evt: EventMouse) => void | Promise<any>;

/**
 * 获取节点在世界坐标系下的边界框,尽量用在高频需要的地方使用原始数据计算,避免产生大量碎片小对象
 * @param uit UITransform 组件
 * @param targetNode Node 目标节点
 * @param out Rect 输出的矩形边界框
 */
export function getBoundingBoxWorld(uit: UITransform, targetNode: Node, out: Rect) {
  const width = uit.width;
  const height = uit.height;
  out.set(-uit.anchorX * width, -uit.anchorY * height, width, height);
  out.transformMat4(targetNode.worldMatrix);
  return out;
}

/**
 * 2025/10/22
 * author: soida
 * desc:按钮组件
 * @example
 * 1. 支持点击防抖
 * 2. 无需任何多余操作,只需要对任意节点进行静态API注册回调即可。
 * 3. UIButton.onClicked(node, () => {});
 * 4. UIButton.onClicked(node, (button: UIButton, evt: EventTouch) => {});
 * 5. UIButton.enableClick(node,false); //禁用点击
 */
@ccclass('UIButton')
export default class UIButton extends Component {
  // ==================== Properties ====================
  node_target: Node | null = null;

  @property({ tooltip: '是否有交互效果' })
  b_interaction: boolean = true;

  @property({ tooltip: '是否阻止事件冒泡到父节点' })
  b_stopPropagation: boolean = true;

  @property({ tooltip: '交互时缩放动画的目标值', range: [0.7, 1.0, 0.01] })
  scaleTarget: number = 0.96;

  @property({ tooltip: '交互时缩放动画的持续时间（毫秒）', range: [20, 300, 10] })
  duration: number = 60;

  @property({ tooltip: '是否播放音效' })
  b_audioEffectWhenClick: boolean = false;

  // ==================== Constants ====================
  @property({ tooltip: '触摸防抖间隔（毫秒）- 防止误触', range: [50, 500, 10] })
  debounceTouchInterval: number = 50;

  @property({
    tooltip: '点击回调防抖间隔（毫秒）- 防止重复触发回调/网络请求',
    range: [200, 2000, 50],
  })
  clickCallbackInterval: number = 250;

  @property({
    tooltip: '移动阈值（像素）- 超过此距离视为滑动而非点击',
    range: [5, 50, 1],
  })
  movementThreshold: number = 10;

  // ==================== Private Fields ====================
  private _lastTouchStartTime: number = 0;
  private _lastTouchEndTime: number = 0;
  private _currentTouchStartTime: number = 0;
  private _lastClickCallbackTime: number = 0;
  private _touchMoveValid = false;
  private _touchStartPos: Vec2 = new Vec2();
  private _touchMovedBeyondThreshold = false;
  private _registed: boolean = false;

  private _initScale: Vec3 = new Vec3(1, 1, 1);
  private _uit: UITransform | null = null;
  private _tmpVec2: Vec2 = new Vec2();

  private _cbMouseStarted: BUTTON_MOUSE_CALLBACK | null = null;
  private _cbMouseMoved: BUTTON_MOUSE_CALLBACK | null = null;
  private _cbClicked: BUTTON_CALLBACK | null = null;
  private _cbStarted: BUTTON_CALLBACK | null = null;
  private _cbMoved: BUTTON_CALLBACK | null = null;
  private _cbEnded: BUTTON_CALLBACK | null = null;
  private _cbCanceled: BUTTON_CALLBACK | null = null;

  // ==================== Lifecycle Methods ====================
  protected onLoad(): void {
    this._uit = this.node.getComponent(UITransform);
    if (!this._uit) {
      console.error(`UIButton: onLoad, node ${this.node.name} does not have UITransform component`);
      return;
    }

    this.node_target = this.node;
    if (this.node_target) {
      this.node_target.getScale(this._initScale);
    }

    this._adjustScaleTarget();
  }

  protected onEnable(): void {
    this.registerEventListeners();
  }

  protected onDisable(): void {
    this.unregisterEventListeners();
  }

  // ==================== Event Registration ====================
  private registerEventListeners() {
    if (this._registed) return;
    this._registed = true;

    this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);

    if (DEV) {
      this.node.on(Input.EventType.MOUSE_DOWN, this.onMouseStart, this);
      this.node.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    }
  }

  private unregisterEventListeners() {
    if (!this._registed) return;
    this._registed = false;

    this.node.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);

    if (DEV) {
      this.node.off(Input.EventType.MOUSE_DOWN, this.onMouseStart, this);
      this.node.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    }
  }

  // ==================== Event Handlers ====================
  private onMouseStart(evt: EventMouse) {
    if (this.b_stopPropagation) {
      evt.propagationStopped = true;
    }
    this._cbMouseStarted && this._cbMouseStarted(this, evt);
  }

  private onMouseMove(evt: EventMouse) {
    if (this.b_stopPropagation) {
      evt.propagationStopped = true;
    }
    this._cbMouseMoved && this._cbMouseMoved(this, evt);
  }

  private onTouchStart(evt: EventTouch) {
    if (this.b_stopPropagation) {
      evt.propagationStopped = true;
    }

    if (!this.debounceTouchStartValid()) {
      return;
    }

    this._currentTouchStartTime = Date.now();
    this._touchMoveValid = true;
    this._touchMovedBeyondThreshold = false;
    evt.getUILocation(this._touchStartPos);

    this._cbStarted && this._cbStarted(this, evt);
    if (this.node_target) {
      this._animatePressDown(this.node_target);
    }
  }

  private _tmpTouchMoveRect: Rect = new Rect();
  private onTouchMove(evt: EventTouch) {
    // if (this.b_stopPropagation) {
    // 	evt.propagationStopped = true;
    // }

    // 检查移动距离是否超过阈值
    if (!this._touchMovedBeyondThreshold) {
      const currentPos = evt.getUILocation(this._tmpVec2);
      const distance = Vec2.distance(this._touchStartPos, currentPos);
      if (distance > this.movementThreshold) {
        this._touchMovedBeyondThreshold = true;
      }
    }

    if (this._uit) {
      const tpos = evt.getUILocation(this._tmpVec2);
      getBoundingBoxWorld(this._uit, this.node, this._tmpTouchMoveRect);
      if (this._touchMoveValid && !this._tmpTouchMoveRect.contains(tpos)) {
        this._touchMoveValid = false;
        // evt.propagationImmediateStopped = true;
        this._animateRelease(this.node_target);
        this._cbCanceled && this._cbCanceled(this, evt);
        return;
      }
    }

    this._cbMoved && this._cbMoved(this, evt);
  }

  private async onTouchEnd(evt: EventTouch) {
    if (this.b_stopPropagation) {
      evt.propagationStopped = true;
    }

    this._cbEnded && this._cbEnded(this, evt);

    if (this.node_target) {
      this._animateRelease(this.node_target);
    }

    if (this.clickSureValid() && this.clickCallbackValid()) {
      this._cbClicked && (await this._cbClicked(this, evt));
      this._lastClickCallbackTime = Date.now();
    }
  }

  private onTouchCancel(evt: EventTouch) {
    if (this.b_stopPropagation) {
      evt.propagationStopped = true;
    }

    this._cbCanceled && this._cbCanceled(this, evt);
    if (this.node_target) {
      this._animateRelease(this.node_target);
    }
  }

  // ==================== Validation Methods ====================
  private debounceTouchStartValid(): boolean {
    const now = Date.now();
    const gap = now - this._lastTouchStartTime;
    if (gap < this.debounceTouchInterval) {
      return false;
    }
    this._lastTouchStartTime = now;
    return true;
  }

  private clickSureValid(): boolean {
    if (!this._touchMoveValid) {
      // console.logUI(`UIButton: clickSureValid false, touch moved out of bounds`);
      return false;
    }
    if (this._touchMovedBeyondThreshold) {
      // console.logUI(`UIButton: clickSureValid false, touch moved beyond threshold`);
      return false;
    }
    return true;
  }

  private clickCallbackValid(): boolean {
    const now = Date.now();
    const gap = now - this._lastClickCallbackTime;
    if (gap < this.clickCallbackInterval) {
      // console.logUI(`UIButton: clickCallbackValid false, gap=${gap}ms < ${this.clickCallbackInterval}ms, prevent duplicate callback`);
      return false;
    }
    return true;
  }

  // ==================== Helper Methods ====================
  private _adjustScaleTarget() {
    const minDiff = 16;
    const w = this.node.getComponent(UITransform)?.width;
    if (!w) return;

    const diff = Math.abs(this._initScale.x - this._initScale.x * this.scaleTarget) * w;
    if (diff < minDiff && this._initScale.x !== 0) {
      const sign = this.scaleTarget < 1 ? -1 : 1;
      this.scaleTarget = (this._initScale.x * w + sign * minDiff) / (this._initScale.x * w);
    }
  }

  private _animatePressDown(target: Node) {
    if (!target || !this.b_interaction) return;
    target.setScale(
      this._initScale.x * this.scaleTarget,
      this._initScale.y * this.scaleTarget,
      this._initScale.z
    );
  }

  private _animateRelease(target: Node) {
    if (!target || !this.b_interaction) return;
    if (target.scale.x === this._initScale.x && target.scale.y === this._initScale.y) {
      return;
    }
    Tween.stopAllByTarget(target);
    target.setScale(
      this._initScale.x * this.scaleTarget,
      this._initScale.y * this.scaleTarget,
      this._initScale.z
    );

    tween(target)
      // .bindNodeState(true)
      .to(
        this.duration / 1000,
        { scale: new Vec3(this._initScale.x, this._initScale.y, this._initScale.z) },
        { easing: 'smooth' }
      )
      .start();
  }

  // ==================== Public Instance Methods ====================
  public onClicked(cb: BUTTON_CALLBACK) {
    this._cbClicked && (this._cbClicked = null);
    this._cbClicked = cb;
  }

  public onMouseStarted(cb: BUTTON_MOUSE_CALLBACK) {
    this._cbMouseStarted && (this._cbMouseStarted = null);
    this._cbMouseStarted = cb;
  }

  public onMouseMoved(cb: BUTTON_MOUSE_CALLBACK) {
    this._cbMouseMoved && (this._cbMouseMoved = null);
    this._cbMouseMoved = cb;
  }

  public onStarted(cb: BUTTON_CALLBACK) {
    this._cbStarted && (this._cbStarted = null);
    this._cbStarted = cb;
  }

  public onMoved(cb: BUTTON_CALLBACK) {
    this._cbMoved && (this._cbMoved = null);
    this._cbMoved = cb;
  }

  public onEnded(cb: BUTTON_CALLBACK) {
    this._cbEnded && (this._cbEnded = null);
    this._cbEnded = cb;
  }

  public onCanceled(cb: BUTTON_CALLBACK) {
    this._cbCanceled && (this._cbCanceled = null);
    this._cbCanceled = cb;
  }

  public enableClick(b: boolean) {
    b ? this.registerEventListeners() : this.unregisterEventListeners();

    const sprite = this.node.getComponent(Sprite);
    if (sprite) {
      sprite.grayscale = !b;
    }
    this._animateRelease(this.node_target);
  }

  public enableClickVisual(b: boolean) {
    const sprite = this.node.getComponent(Sprite);
    if (sprite) {
      sprite.grayscale = !b;
    }
    this._animateRelease(this.node_target);
  }

  public enableClickAction(b: boolean) {
    b ? this.registerEventListeners() : this.unregisterEventListeners();
  }

  // ==================== Static Methods ====================
  public static onClicked(
    buttonOrNode: UIButton | Node | null,
    cb: BUTTON_CALLBACK
  ): UIButton | null {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onClicked(cb);
      return buttonOrNode;
    } else if (buttonOrNode instanceof Node) {
      let button = buttonOrNode.getComponent(UIButton);
      if (!button) button = buttonOrNode.addComponent(UIButton);
      button.onClicked(cb);
      return button;
    } else {
      console.error(`UIButton: onClicked, buttonOrNode is null / type not match `);
    }
    return null;
  }

  public static onMouseStarted(buttonOrNode: UIButton | Node, cb: BUTTON_MOUSE_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onMouseStarted(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onMouseStarted(cb);
      } else {
        console.warn(
          `UIButton: onMouseStarted, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onMouseStarted, invalid parameter type`);
    }
  }

  public static onMouseMoved(buttonOrNode: UIButton | Node, cb: BUTTON_MOUSE_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onMouseMoved(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onMouseMoved(cb);
      } else {
        console.warn(
          `UIButton: onMouseMoved, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onMouseMoved, invalid parameter type`);
    }
  }

  public static onStarted(buttonOrNode: UIButton | Node, cb: BUTTON_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onStarted(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onStarted(cb);
      } else {
        console.warn(
          `UIButton: onStarted, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onStarted, invalid parameter type`);
    }
  }

  public static onMoved(buttonOrNode: UIButton | Node, cb: BUTTON_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onMoved(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onMoved(cb);
      } else {
        console.warn(
          `UIButton: onMoved, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onMoved, invalid parameter type`);
    }
  }

  public static onEnded(buttonOrNode: UIButton | Node, cb: BUTTON_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onEnded(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onEnded(cb);
      } else {
        console.warn(
          `UIButton: onEnded, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onEnded, invalid parameter type`);
    }
  }

  public static onCanceled(buttonOrNode: UIButton | Node, cb: BUTTON_CALLBACK) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.onCanceled(cb);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.onCanceled(cb);
      } else {
        console.warn(
          `UIButton: onCanceled, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: onCanceled, invalid parameter type`);
    }
  }

  public static enableClick(buttonOrNode: UIButton | Node | null, b: boolean) {
    if (buttonOrNode instanceof UIButton) {
      buttonOrNode.enableClick(b);
    } else if (buttonOrNode instanceof Node) {
      const button = buttonOrNode.getComponent(UIButton);
      if (button) {
        button.enableClick(b);
      } else {
        console.warn(
          `UIButton: enableClick, node ${buttonOrNode.name} does not have UIButton component`
        );
      }
    } else {
      console.warn(`UIButton: enableClick, invalid parameter type`);
    }
  }
}
