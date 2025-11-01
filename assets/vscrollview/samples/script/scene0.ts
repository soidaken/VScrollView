import { _decorator, Component, director, game, Label, Node, Scene } from 'cc';
import UIButton from './UIButton';
import { UIPersist } from './UIPersist';
const { ccclass, property } = _decorator;

@ccclass('scene0')
export class scene0 extends Component {
  @property([Node])
  btn_nodes: Node[] = [];

  protected onLoad(): void {
    game.frameRate = 120;
  }

  protected start(): void {
    UIPersist.back.active = false;
    for (const element of this.btn_nodes) {
      UIButton.onClicked(element, (button: UIButton) => {
        UIPersist.back.active = true;
        const scene_name = button.node.children[0].getComponent(Label).string;
        director.loadScene(scene_name);
      });
      element.getComponent(UIButton).b_stopPropagation = false;
    }
  }

  protected onEnable(): void {}

  private _getBackNode() {
    const p = director.addPersistRootNode;
  }
}
