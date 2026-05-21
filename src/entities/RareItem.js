const RARE_SIZE      = 22;       // 크기 (px)
const RARE_COLOR     = 0xffd700; // 색상 (황금)
const RARE_HEAL      = 30;       // 플레이어 회복량
const PICKUP_R       = 40;       // 자동 흡수 시작 반경 (px)
const MAGNET_SPEED   = 350;      // 흡수 이동 속도 (px/s)
const COLLECT_R      = 14;       // 수집 판정 반경 (px)

export default class RareItem {
  constructor(scene, x, y) {
    this.scene = scene;
    this.alive = true;
    this.magnetized = false;
    this.healAmount = RARE_HEAL;

    this.gameObject = scene.add.rectangle(x, y, RARE_SIZE, RARE_SIZE, RARE_COLOR).setDepth(7);
    this._scaleTween = scene.tweens.add({
      targets:  this.gameObject,
      scaleX:   1.4, scaleY: 1.4,
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // 발광 효과 — 트윈 타겟이 plain object 이므로 dispose 시 명시적으로 제거 필요
    const gfx = scene.add.graphics().setDepth(6);
    const state = { a: 0.4 };
    this._glowTween = scene.tweens.add({
      targets: state, a: 0.0, duration: 600, yoyo: true, repeat: -1,
      onUpdate: () => {
        if (!this.alive) return;
        gfx.clear();
        gfx.fillStyle(RARE_COLOR, state.a);
        gfx.fillCircle(this.gameObject.x, this.gameObject.y, RARE_SIZE * 1.5);
      },
    });
    this._glowGfx = gfx;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  startMagnet() { this.magnetized = true; }

  collect() {
    if (!this.alive) return;
    this.alive = false;
    scene_cleanup(this);
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    scene_cleanup(this);
  }
}

function scene_cleanup(item) {
  if (item._glowTween)  { item._glowTween.remove();  item._glowTween  = null; }
  if (item._scaleTween) { item._scaleTween.remove(); item._scaleTween = null; }
  if (item._glowGfx?.active)   item._glowGfx.destroy();
  if (item.gameObject?.active) item.gameObject.destroy();
}

export { PICKUP_R, MAGNET_SPEED, COLLECT_R };
