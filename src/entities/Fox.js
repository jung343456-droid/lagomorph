/**
 * 여우 (Fox) — 추격형
 * HP 30 / 속도 140 / 데미지 8 / 코어 드롭 3
 *
 * 패턴:
 *   idle  → chase(250px 이내 탐지)
 *   chase → 플레이어를 직접 추격
 *   chase → flee(HP 30% 이하 시 2초간 도주, 이후 1.5초 유예 후 재도주 가능)
 *   stun  → 피격 시 0.4초 경직 + 넉백
 */
const DETECT_R  = 250;      // 플레이어 탐지 반경 (px)
const FOX_COLOR = 0xe8600e; // 기본 색상 (주황)
const HIT_COLOR = 0xff2222; // 피격 깜빡임 색상 (빨강)

// 상태: idle | chase | flee | stun
export default class Fox {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 30;
    this.maxHp  = 30;
    this.speed  = 140;
    this.damage = 8;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.fleeTimer  = 0;
    this.fleeGrace  = 0;       // 재도주 방지 유예 시간
    this.attackCooldown = 0;

    this.alive      = true;
    this.destroyed  = false;
    this.coreDrops  = 3;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

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
        // 자신 HP 30% 이하 → 도주
        if (this.hp / this.maxHp <= 0.3 && this.fleeGrace <= 0) {
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
        if (this._knockbackTimer > 0) {
          this._knockbackTimer -= dt;
          const t = Math.max(0, this._knockbackTimer) / this._knockbackDuration;
          this.gameObject.body.setVelocity(this._knockbackVx * t, this._knockbackVy * t);
        } else {
          this.gameObject.body.setVelocity(0, 0);
        }
        if (this.stunTimer <= 0) {
          this.gameObject.setFillStyle(FOX_COLOR);
          this.state = this._prevState;
        }
        break;
    }

    this._syncHpBar();
  }

  /** @returns {boolean} true = 처치 */
  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;

    this.hp -= amount;
    if (this.hp <= 0) {
      this._die();
      return true;
    }

    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer    = duration;
      this._knockbackDuration = duration;
      this._knockbackVx = dx * force;
      this._knockbackVy = dy * force;
    }

    this._prevState = this.state;
    this.state      = 'stun';
    this.stunTimer  = 0.4;
    this._blinkRed();
    return false;
  }

  poisonHp(amount) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) { this._die(); return true; }
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
