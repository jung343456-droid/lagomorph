/**
 * 다람쥐 (Squirrel) — 원거리형
 * HP 18 / 속도 110 / 데미지 9(도토리) / 코어 드롭 2
 *
 * 패턴:
 *   idle → kite(260px 이내 탐지)
 *   kite → 선호 거리 140px 유지하며 플레이어 주위 횡이동 (1.5초마다 방향 전환)
 *          100px 이하 접근 시 반대 방향 후퇴(140px/s)
 *          2.5초마다 도토리 투척 (HP 30% 이하: 1.2초마다)
 *   stun → 피격 시 0.4초 경직 + 넉백
 *
 * 도토리: 속도 230px/s, 벽 도달 시 소멸, 플레이어 22px 이내 명중 시 데미지
 */
const DETECT_R        = 260;      // 플레이어 탐지 반경 (px)
const PREFER_DIST     = 140;      // 선호 유지 거리: 이 근방에서 횡이동 (px)
const CLOSE_DIST      = 100;      // 위협 거리: 이 이하면 후퇴 시작 (px)
const KITE_SPEED      = 110;      // 기본 이동 속도 (px/s)
const RETREAT_SPEED   = 140;      // 후퇴 속도 (px/s)
const THROW_CD        = 2.5;      // 도토리 투척 쿨다운 (초)
const THROW_CD_RAGE   = 1.2;      // 분노 상태(HP 30% 이하) 투척 쿨다운 (초)
const ACORN_SPEED     = 230;      // 도토리 투사체 속도 (px/s)
const ACORN_SIZE      = 8;        // 도토리 크기 (px)
const ACORN_COLOR     = 0x885522; // 도토리 색상 (진한 갈색)
const SQUIRREL_DMG    = 9;        // 도토리 명중 데미지
const LATERAL_FLIP    = 1.5;      // 횡이동 방향 전환 주기 (초)
const SQUIRREL_W      = 16;       // 스프라이트 너비 (px)
const SQUIRREL_H      = 20;       // 스프라이트 높이 (px)
const SQUIRREL_COLOR  = 0xcc7722; // 기본 색상 (주황 갈색)
const HIT_COLOR       = 0xffffff; // 피격 깜빡임 색상 (흰색)

// 상태: idle | kite | stun
export default class Squirrel {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 18;
    this.maxHp  = 18;
    this.speed  = KITE_SPEED;
    this.damage = 5;  // 접촉 데미지 (드물게 발생)

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 2;

    this._throwTimer    = THROW_CD;
    this._lateralSign   = 1;
    this._lateralFlip   = LATERAL_FLIP;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this.gameObject = scene.add.rectangle(x, y, SQUIRREL_W, SQUIRREL_H, SQUIRREL_COLOR);
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
        if (dist < DETECT_R) this.state = 'kite';
        break;

      case 'kite':
        if (dist >= DETECT_R) { this.state = 'idle'; this.gameObject.body.setVelocity(0, 0); break; }
        this._updateKite(dx, dy, dist, dt);
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
          this.gameObject.setFillStyle(SQUIRREL_COLOR);
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

  _updateKite(dx, dy, dist, dt) {
    if (dist < CLOSE_DIST) {
      // 후퇴: 플레이어 반대 방향
      this.gameObject.body.setVelocity(
        (-dx / dist) * RETREAT_SPEED,
        (-dy / dist) * RETREAT_SPEED,
      );
    } else if (dist > PREFER_DIST) {
      // 접근
      this.gameObject.body.setVelocity(
        (dx / dist) * KITE_SPEED,
        (dy / dist) * KITE_SPEED,
      );
    } else {
      // 횡이동 (플레이어 방향에 수직)
      const perpX = (-dy / dist) * this._lateralSign;
      const perpY = (dx / dist)  * this._lateralSign;
      this.gameObject.body.setVelocity(perpX * KITE_SPEED, perpY * KITE_SPEED);
    }

    // 횡이동 방향 주기적 전환
    this._lateralFlip -= dt;
    if (this._lateralFlip <= 0) {
      this._lateralSign  *= -1;
      this._lateralFlip   = LATERAL_FLIP;
    }

    // 도토리 투척 쿨다운
    this._throwTimer -= dt;
    if (this._throwTimer <= 0) {
      this._throwAcorn(dx, dy, dist);
      this._throwTimer = this.hp / this.maxHp <= 0.3 ? THROW_CD_RAGE : THROW_CD;
    }
  }

  _throwAcorn(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    const nx  = dx / len;
    const ny  = dy / len;
    const proj = this.scene.add.rectangle(this.gameObject.x, this.gameObject.y, ACORN_SIZE, ACORN_SIZE, ACORN_COLOR);
    proj.setDepth(8);
    this.scene.enemyManager.addEnemyProjectile(proj, SQUIRREL_DMG, nx * ACORN_SPEED, ny * ACORN_SPEED);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 18, SQUIRREL_W, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - SQUIRREL_W / 2, y - 18, SQUIRREL_W, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 18);
    this._hpFill.setPosition(x - SQUIRREL_W / 2, y - 18);
    this._hpFill.width = SQUIRREL_W * Math.max(0, this.hp / this.maxHp);
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
        this.gameObject.setFillStyle(flip % 2 === 0 ? HIT_COLOR : SQUIRREL_COLOR);
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
