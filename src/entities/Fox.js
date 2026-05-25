/**
 * 여우 (Fox) — 추격형
 * HP 30 / 속도 140 / 데미지 8 / 코어 드롭 3
 *
 * 패턴:
 *   idle  → chase(250px 이내 탐지)
 *   chase → 플레이어를 직접 추격
 *   chase → flee(HP 30% 이하 시 2초간 도주, 이후 1.5초 유예 후 재도주 가능)
 *   stun  → 피격 시 0.3초 경직 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * speedMult: Wolf 오라(180px 이내) 적용 시 이동속도 ×1.2
 */
const DETECT_R = 250;
const FOX_W    = 26;   // 물리 body 크기
const FOX_H    = 26;
const FOX_DW   = 44;   // 표시 크기 (body보다 크게)
const FOX_DH   = 44;

function calcDir(vx, vy) {
  if (Math.abs(vx) < 1 && Math.abs(vy) < 1) return null;
  const a = Math.atan2(vy, vx) * 180 / Math.PI;
  if (a >  -22.5 && a <=   22.5) return 'e';
  if (a >   22.5 && a <=   67.5) return 'se';
  if (a >   67.5 && a <=  112.5) return 's';
  if (a >  112.5 && a <=  157.5) return 'sw';
  if (a >  157.5 || a <= -157.5) return 'w';
  if (a > -157.5 && a <= -112.5) return 'nw';
  if (a > -112.5 && a <=  -67.5) return 'n';
  return 'ne';
}

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
    this.fleeGrace  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 3;
    this.speedMult = 1.0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'fox-s';

    this.gameObject = scene.add.image(x, y, 'fox-s').setDisplaySize(FOX_DW, FOX_DH);
    scene.physics.add.existing(this.gameObject);
    this.gameObject.body.setSize(FOX_W, FOX_H);
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

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        if (this.hp / this.maxHp <= 0.3 && this.fleeGrace <= 0) {
          this._prevState = 'idle';
          this.state      = 'flee';
          this.fleeTimer  = 2;
          break;
        }
        this._moveTo(dx, dy, dist, this.speed * this.speedMult);
        break;

      case 'flee':
        this.fleeTimer -= dt;
        if (this.fleeTimer <= 0) {
          this.state     = 'chase';
          this.fleeGrace = 1.5;
          break;
        }
        this._moveTo(dx, dy, dist, -this.speed * this.speedMult);
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
          this.gameObject.clearTint();
          this.state = this._prevState;
        }
        break;
    }

    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (knockback) {
      const { dx, dy, force, duration } = knockback;
      this._knockbackTimer    = duration;
      this._knockbackDuration = duration;
      this._knockbackVx = dx * force;
      this._knockbackVy = dy * force;
    }
    this._prevState = this.state;
    this.state      = 'stun';
    this.stunTimer  = 0.3;
    this._blinkHit();
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

  _updateSprite() {
    if (this.state === 'stun') return;
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `fox-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(FOX_DW, FOX_DH);
    }
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 26, FOX_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - FOX_DW / 2, y - 26, FOX_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 26);
    this._hpFill.setPosition(x - FOX_DW / 2, y - 26);
    this._hpFill.width = FOX_DW * Math.max(0, this.hp / this.maxHp);
  }

  _blinkHit() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setTintFill(0xffffff);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 80, repeat: 4,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        if (flip % 2 === 0) this.gameObject.setTintFill(0xffffff);
        else this.gameObject.clearTint();
      },
    });
  }

  _die() {
    this.alive = false;
    this.gameObject.body.setEnable(false);
    if (this._blinkEvent) { this._blinkEvent.remove(); this._blinkEvent = null; }
    this._hpBg.destroy();
    this._hpFill.destroy();
    const sx = this.gameObject.scaleX * 1.8;
    const sy = this.gameObject.scaleY * 1.8;
    this.scene.tweens.add({
      targets: this.gameObject,
      alpha: 0, scaleX: sx, scaleY: sy,
      duration: 260, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
