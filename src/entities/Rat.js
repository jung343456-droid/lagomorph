/**
 * 들쥐 (Rat) — 돌진형 군집
 * HP 12 / 속도 185 / 데미지 5 / 코어 드롭 1
 * 스폰: 3마리 묶음 (120° 간격, 18px 반경 분산)
 *
 * 패턴:
 *   idle     → rush(280px 이내 탐지, 플레이어 위치로 방향 고정 후 돌진)
 *   rush     → 1.2초간 직선 돌진 (도중 방향 보정 없음)
 *   cooldown → 0.3초 정지 후 재조준 → rush 반복
 *   stun     → 피격 시 0.4초 경직 + 넉백
 */
const DETECT_R   = 280;      // 플레이어 탐지 반경 (px)
const RUSH_SPEED = 185;      // 돌진 속도 (px/s)
const RUSH_DUR   = 1.2;      // 돌진 지속 시간 (초)
const COOL_DUR   = 0.3;      // 돌진 후 쿨다운 (초)
const RAT_W      = 14;       // 스프라이트 크기 (정사각형, px)
const RAT_COLOR  = 0x888866; // 기본 색상 (올리브 회색)
const HIT_COLOR  = 0xffffff; // 피격 깜빡임 색상 (흰색)

// 상태: idle | rush | cooldown | stun
export default class Rat {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 12;
    this.maxHp  = 12;
    this.speed  = RUSH_SPEED;
    this.damage = 5;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 1;

    this._rushDir    = { x: 0, y: 0 };
    this._stateTimer = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this.gameObject = scene.add.rectangle(x, y, RAT_W, RAT_W, RAT_COLOR);
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

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this._startRush(dx, dy, dist);
        break;

      case 'rush':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(
          this._rushDir.x * RUSH_SPEED,
          this._rushDir.y * RUSH_SPEED,
        );
        if (this._stateTimer <= 0) {
          this.state       = 'cooldown';
          this._stateTimer = COOL_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'cooldown':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._stateTimer <= 0) {
          if (dist < DETECT_R) this._startRush(dx, dy, dist);
          else this.state = 'idle';
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
          this.gameObject.setFillStyle(RAT_COLOR);
          this.state = this._prevState;
        }
        break;
    }

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
    this.stunTimer  = 0.4;
    this._blinkColor();
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

  _startRush(dx, dy, dist) {
    const len       = dist > 0 ? dist : 1;
    this._rushDir.x = dx / len;
    this._rushDir.y = dy / len;
    this.state       = 'rush';
    this._stateTimer = RUSH_DUR;
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 15, RAT_W, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - RAT_W / 2, y - 15, RAT_W, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 15);
    this._hpFill.setPosition(x - RAT_W / 2, y - 15);
    this._hpFill.width = RAT_W * Math.max(0, this.hp / this.maxHp);
  }

  _blinkColor() {
    if (this._blinkEvent) this._blinkEvent.remove();
    let flip = 0;
    this.gameObject.setFillStyle(HIT_COLOR);
    this._blinkEvent = this.scene.time.addEvent({
      delay: 80, repeat: 4,
      callback: () => {
        if (this.destroyed) return;
        flip++;
        this.gameObject.setFillStyle(flip % 2 === 0 ? HIT_COLOR : RAT_COLOR);
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
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
