import { _decorator, Component, Label, director, Director, gfx } from 'cc';
import { DEV } from 'cc/env';

const { ccclass, property, requireComponent } = _decorator;

@ccclass('FPSCounter')
@requireComponent(Label)
export class FPSCounter extends Component {
  @property({
    tooltip: '更新 FPS 显示的时间间隔（秒）',
  })
  updateInterval: number = 0.25;

  private _label: Label | null = null;
  private _frameCount: number = 0;
  private _elapsedTime: number = 0;
  private _fps: number = 0;

  onLoad() {
    this._label = this.getComponent(Label);
    // if (!DEV) {
    //   this.node.destroy();
    //   return;
    // }
  }

  update(dt: number) {
    // if (!DEV) return;

    this._frameCount++;
    this._elapsedTime += dt;

    // 达到更新间隔
    if (this._elapsedTime >= this.updateInterval) {
      // 计算这段时间内的平均 FPS
      this._fps = this._frameCount / this._elapsedTime;

      if (this._label) {
        const device = gfx.deviceManager.gfxDevice;
        this._label.string = `FPS: ${this._fps.toFixed(1)}\nDC:${device.numDrawCalls}\nTRIS:${
          device.numTris
        }\nRENDER:${
          device.gfxAPI === gfx.API.WEBGL
            ? 'WebGL'
            : device.gfxAPI === gfx.API.WEBGL2
            ? 'WebGL2'
            : device.gfxAPI === gfx.API.GLES2
            ? 'GLES2'
            : device.gfxAPI === gfx.API.GLES3
            ? 'GLES3'
            : device.gfxAPI === gfx.API.VULKAN
            ? 'VULKAN'
            : device.gfxAPI === gfx.API.METAL
            ? 'METAL'
            : 'UNKNOWN/NOMATCH'
        }`;
      }

      this._frameCount = 0;
      this._elapsedTime -= this.updateInterval;
    }
  }
}
