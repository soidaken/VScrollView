import { __private, _decorator, Canvas, Component, director, Node } from 'cc';
import UIButton from './UIButton';
const { ccclass, property } = _decorator;

/**
 *
 * @param node Node 要搜索的节点获取节点所在的整个场景节点树中第一个指定类型的组件实例
 * @param T 组件类型
 * @returns T | T[] | null 返回找到的组件实例或者集合或null
 */
export function getSpecifyComponent<T extends Component>(
  node: Node,
  classConstructor:
    | __private.__types_globals__Constructor<T>
    | __private.__types_globals__AbstractedConstructor<T>,
  bfirst: boolean = true
): T | T[] | null {
  if (!node || !classConstructor) return null;
  let root: Node = node;
  while (root.parent) {
    root = root.parent;
  }
  if (bfirst) {
    const t = (root.getComponentInChildren(classConstructor) as T) || null;
    if (!t) {
      console.error(
        `❌未找到指定类型的组件: ${classConstructor.name} ,请检查节点树中是否存在该组件`
      );
    }
    return t;
  } else {
    const t = (root.getComponentsInChildren(classConstructor) as T[]) || [];
    if (t.length === 0) {
      console.error(
        `❌未找到指定类型的组件: ${classConstructor.name} ,请检查节点树中是否存在该组件`
      );
      return null;
    }
    return t;
  }
}

@ccclass('UIPersist')
export class UIPersist extends Component {
  @property(Node)
  node_back: Node | null = null;

  static back: Node = null;

  protected onLoad(): void {
    if (!director.isPersistRootNode(this.node)) {
      director.addPersistRootNode(this.node);
    }

    UIPersist.back = this.node_back;

    UIButton.onClicked(this.node_back, (button: UIButton) => {
      this.node_back.active = false;
      director.loadScene('场景0-示例引导');
    });
  }
  protected onEnable(): void {
    //设置初始摄像机来渲染当前canvas
    const c = getSpecifyComponent(this.node, Canvas) as Canvas;
    if (c) {
      this.node.getComponent(Canvas)!.cameraComponent = c.cameraComponent;
    }
  }
}
