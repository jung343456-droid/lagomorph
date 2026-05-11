export default class Core {
  constructor(scene, x, y) {
    this.scene = scene;
    this.alive      = true;
    this.magnetized = false;

    this.gameObject = scene.add
      .circle(x, y, 7, 0x00e5ff)
      .setDepth(8)
      .setStrokeStyle(1.5, 0xffffff, 0.5);

    // 사방으로 튀어나가는 초기 이동
    const angle = Math.random() * Math.PI * 2;
    const range = 20 + Math.random() * 25;
    const tx    = x + Math.cos(angle) * range;
    const ty    = y + Math.sin(angle) * range;

    scene.tweens.add({
      targets:  this.gameObject,
      x: tx,
      y: ty,
      duration: 220,
      ease:     'Quad.Out',
      onComplete: () => {
        if (!this.alive) return;
        // 제자리 부유 루프
        scene.tweens.add({
          targets:  this.gameObject,
          y:        ty - 5,
          duration: 750,
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.InOut',
        });
      },
    });
  }

  startMagnet() {
    if (this.magnetized) return;
    this.magnetized = true;
    this.scene.tweens.killTweensOf(this.gameObject);
  }

  collect() {
    if (!this.alive) return;
    this.alive = false;

    this.scene.tweens.killTweensOf(this.gameObject);
    this.scene.tweens.add({
      targets:  this.gameObject,
      alpha:    0,
      scaleX:   2.5,
      scaleY:   2.5,
      duration: 160,
      ease:     'Quad.Out',
      onComplete: () => this.gameObject.destroy(),
    });
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }
}
