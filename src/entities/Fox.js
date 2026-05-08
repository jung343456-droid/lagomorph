const DETECT_R  = 250;
const FOX_COLOR = 0xe8600e;
const HIT_COLOR = 0xff2222;

// 상태: idle | chase | flee | stun
export default class Fox {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 30;
    this.maxHp  = 30;
    this.speed  = 150;
    this.damage = 8;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.fleeTimer  = 0;
    this.fleeGrace  = 0;       // 재도주 방지 유예 시간
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;

    this.gameObject = scene.add.rectangle(x, y, 28, 28, FOX_COLOR);
    scene.physics.add.existing(this.gameObject);
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.fleeGrace > 0) this.fleeGrace -= dt;

    const gx   = this.gameObject.x;
    const gy   = this.gameObject.y;
    const dx   = player.x - gx;
    const dy   = player.y - gy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {

      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        // 플레이어 HP 30% 이하 → 도주
        if (player.hp / player.maxHp <= 0.3 && this.fleeGrace <= 0) {
          this._prevState = 'idle';
          this.state      = 'flee';
          this.fleeTimer  = 2;
          break;
        }
        this._moveTo(dx, dy, dist, this.speed);
        break;

      case 'flee':
        this.fleeTimer -= dt;
        if (this.fleeTimer <= 0) {
          this.state     = 'chase';
          this.fleeGrace = 1.5;  // 1.5초 유예 후 재도주 가능
          break;
        }
        this._moveTo(dx, dy, dist, -this.speed); // 반대 방향
        break;

      case 'stun':
        this.stunTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this.stunTimer <= 0) {
          this.gameObject.setFillStyle(FOX_COLOR);
          this.state = this._prevState;
        }
        break;
    }

    this._syncHpBar();
  }

  /** @returns {boolean} true = 처치 */
  takeDamage(amount) {
    if (!this.alive || this.state === 'stun') return false;

    this.hp -= amount;
    if (this.hp <= 0) {
      this._die();
      return true;
    }

    this._prevState = this.state;
    this.state      = 'stun';
    this.stunTimer  = 0.5;
    this._blinkRed();
    return false;
  }

  dispose() {
    if (this.destroyed) return;
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    if (this._hpBg?.active)   this._hpBg.destroy();
    if (this._hpFill?.active) this._hpFill.destroy();
    this.alive = false;
    this.gameObject.destroy();
    this.destroyed = true;
  }

  get x() { return this.gameObject.x; }
  get y() { return this.gameObject.y; }

  // ── private ─────────────────────────────────────────

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  // 체력 바 (여우 머리 위)
  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 22, 28, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - 14, y - 22, 28, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 22);
    this._hpFill.setPosition(x - 14, y - 22);
    this._hpFill.width = 28 * Math.max(0, this.hp / this.maxHp);
  }

  _blinkRed() {
    if (this._blinkEvent) this._blinkEvent.remove();

    let flip = 0;
    this.gameObject.setFillStyle(HIT_COLOR);

    this._blinkEvent = this.scene.time.addEvent({
      delay: 80,
      repeat: 4,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        this.gameObject.setFillStyle(flip % 2 === 0 ? HIT_COLOR : FOX_COLOR);
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);

    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();

    this.scene.tweens.add({
      targets:  this.gameObject,
      alpha:    0,
      scaleX:   1.8,
      scaleY:   1.8,
      duration: 260,
      ease:     'Quad.Out',
      onComplete: () => {
        this.gameObject.destroy();
        this.destroyed = true;
      },
    });
  }
}
