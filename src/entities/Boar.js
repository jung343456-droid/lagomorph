/**
 * 멧돼지 (Boar) — 중량 단일 돌격병 (구역 2)
 * HP 88 / 속도 88(approach) → 297(charge) / 데미지 18 / 코어 4
 *
 * 패턴:
 *   idle     → approach(320px 이내 탐지)
 *   approach → 88px/s로 천천히 다가옴
 *   ready    → 200px 이내 진입 시 0.2초 예고(앞발 긁기)
 *   charge   → 297px/s 직선 1.0초 돌진, 장애물(boulder) 파괴 + 돌진 지속,
 *              벽 충돌 시 1.0초 자기 스턴
 *   recover  → 0.8초 정지 후 approach 복귀
 *   stun     → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 시각: 갈색 틴트 (placeholder: fox 스프라이트 재사용)
 * speedMult: Wolf 오라(180px 이내) 적용 시 approach·recover만 ×1.2 (charge는 고정)
 */
const DETECT_R       = 320;
const READY_DIST     = 200;
const APPROACH_SPEED = 88;
const CHARGE_SPEED   = 297;
const READY_DUR      = 0.2;
const CHARGE_DUR     = 1.0;
const RECOVER_DUR    = 0.8;
const WALL_STUN_DUR  = 1.0;
const BOAR_W         = 36;
const BOAR_H         = 32;
const BOAR_DW        = 56;
const BOAR_DH        = 48;
const TINT           = 0x886644;

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

// 상태: idle | approach | ready | charge | recover | wallstun | stun
export default class Boar {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 88;
    this.maxHp  = 88;
    this.speed  = APPROACH_SPEED;
    this.damage = 18;
    this.displayName = '멧돼지';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 4;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._chargeDir  = { x: 0, y: 1 };
    this._hitObstacle = false;  // RoomManager 가 obstacle 파괴 시 set (Fang 패턴 재활용)

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'boar-idle';

    this.gameObject = scene.add.image(x, y, 'boar-idle').setDisplaySize(BOAR_DW, BOAR_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);
    this.gameObject.setTint(TINT);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'approach';
        break;

      case 'approach':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        if (dist < READY_DIST) {
          this.state = 'ready';
          this._stateTimer = READY_DUR;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        this._moveTo(dx, dy, dist, APPROACH_SPEED * this.speedMult);
        break;

      case 'ready': {
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._stateTimer <= 0) {
          const len = dist > 0 ? dist : 1;
          this._chargeDir = { x: dx / len, y: dy / len };
          this.state = 'charge';
          this._stateTimer = CHARGE_DUR;
          const cd = calcDir(this._chargeDir.x, this._chargeDir.y);
          if (cd) this._lastDir = cd;
        }
        break;
      }

      case 'charge':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(
          this._chargeDir.x * CHARGE_SPEED,
          this._chargeDir.y * CHARGE_SPEED,
        );
        if (this._stateTimer < CHARGE_DUR - 0.1 && this._isWallBlocked()) {
          this._startWallStun();
          break;
        }
        if (this._stateTimer <= 0) {
          this.state = 'recover';
          this._stateTimer = RECOVER_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'recover':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._stateTimer <= 0) this.state = dist < DETECT_R ? 'approach' : 'idle';
        break;

      case 'wallstun':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.gameObject.clearTint();
          this.gameObject.setTint(TINT);
          this.state = 'recover';
          this._stateTimer = RECOVER_DUR;
        }
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
          this.gameObject.setTint(TINT);
          this.state = this._prevState;
        }
        break;
    }

    this._updateSprite();
    this._syncHpBar();
  }

  takeDamage(amount, knockback = null) {
    if (!this.alive || this.state === 'stun' || this.state === 'wallstun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (this.state !== 'charge') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = this.state === 'ready' ? 'recover' : this.state;
      if (this._prevState === 'recover') this._stateTimer = RECOVER_DUR;
      this.state      = 'stun';
      this.stunTimer  = 0.3;
    }
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

  _isWallBlocked() {
    // Fang dash 와 동일한 패턴: RoomManager 가 boulder 충돌 시 _hitObstacle=true 설정 후 파괴 → 벽이 아니므로 통과
    if (this._hitObstacle) { this._hitObstacle = false; return false; }
    const b = this.gameObject.body;
    if (!b.blocked.none) return true;
    return b.velocity.length() < CHARGE_SPEED * 0.4;
  }

  _startWallStun() {
    this.state = 'wallstun';
    this._stateTimer = WALL_STUN_DUR;
    this.gameObject.body.setVelocity(0, 0);
    this.gameObject.setTint(0x666666);
    this.scene.cameras.main.shake(180, 0.012);
  }

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _updateSprite() {
    if (this.state === 'stun' || this.state === 'wallstun') return;
    let key;
    if (this.state === 'charge') {
      key = 'boar-charge';
    } else if (this.state === 'ready') {
      key = 'boar-ready';
    } else if (this.state === 'idle' || this.state === 'recover') {
      key = 'boar-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `boar-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BOAR_DW, BOAR_DH);
      this._applyBodySize();
      this.gameObject.setTint(TINT);
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BOAR_W / sx, BOAR_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 30, BOAR_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BOAR_DW / 2, y - 30, BOAR_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 30);
    this._hpFill.setPosition(x - BOAR_DW / 2, y - 30);
    this._hpFill.width = BOAR_DW * Math.max(0, this.hp / this.maxHp);
    const vis = this.hp < this.maxHp;
    this._hpBg.setVisible(vis);
    this._hpFill.setVisible(vis);
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
        else { this.gameObject.clearTint(); this.gameObject.setTint(TINT); }
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
      duration: 280, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
