/**
 * 다람쥐 (Squirrel) — 원거리형
 * HP 18 / 속도 110 / 데미지 6(도토리) / 코어 드롭 2
 *
 * 패턴:
 *   idle → kite(260px 이내 탐지)
 *   kite → 선호 거리 140px 유지하며 플레이어 주위 횡이동 (1.5초마다 방향 전환)
 *          100px 이하 접근 시 반대 방향 후퇴(140px/s)
 *          2.5초마다 도토리 투척 (HP 30% 이하: 1.2초마다)
 *   stun → 피격 시 0.4초 경직 + 넉백
 *
 * 도토리: 속도 230px/s, 벽 도달 시 소멸, 플레이어 22px 이내 명중 시 데미지
 * speedMult: Wolf 오라(180px 이내) 적용 시 횡이동·후퇴 속도 ×1.2
 */
const DETECT_R        = 260;
const PREFER_DIST     = 140;
const CLOSE_DIST      = 100;
const KITE_SPEED      = 110;
const RETREAT_SPEED   = 140;
const THROW_CD        = 2.5;
const THROW_CD_RAGE   = 1.2;
const ACORN_SPEED     = 230;
const ACORN_SIZE      = 14;
const SQUIRREL_DMG    = 6;
const LATERAL_FLIP    = 1.5;
const SQUIRREL_W      = 18;   // 물리 body 크기 (canvas 22×22 정사각형 반영)
const SQUIRREL_H      = 18;
const SQUIRREL_DW     = 32;   // 표시 크기 (canvas 22:22 정사각형 유지)
const SQUIRREL_DH     = 32;

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

// 상태: idle | kite | stun
export default class Squirrel {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 18;
    this.maxHp  = 18;
    this.speed  = KITE_SPEED;
    this.damage = 5;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 2;
    this.speedMult = 1.0;

    this._throwTimer    = THROW_CD;
    this._lateralSign   = 1;
    this._lateralFlip   = LATERAL_FLIP;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir    = 's';
    this._curKey     = 'squirrel-idle';
    this._throwFlash = 0;  // 투척 중 squirrel-throw 표시 타이머

    this.gameObject = scene.add.image(x, y, 'squirrel-idle').setDisplaySize(SQUIRREL_DW, SQUIRREL_DH);
    scene.physics.add.existing(this.gameObject);
    this.gameObject.body.setSize(SQUIRREL_W, SQUIRREL_H);
    this.gameObject.body.setCollideWorldBounds(true);
    this.gameObject.setDepth(9);

    this._buildHpBar();
  }

  // ── public ──────────────────────────────────────────

  update(delta, player) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this._throwFlash > 0) this._throwFlash -= dt;

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
    this.stunTimer  = 0.4;
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

  _updateKite(dx, dy, dist, dt) {
    if (dist < CLOSE_DIST) {
      this.gameObject.body.setVelocity(
        (-dx / dist) * RETREAT_SPEED * this.speedMult,
        (-dy / dist) * RETREAT_SPEED * this.speedMult,
      );
    } else if (dist > PREFER_DIST) {
      this.gameObject.body.setVelocity(
        (dx / dist) * KITE_SPEED * this.speedMult,
        (dy / dist) * KITE_SPEED * this.speedMult,
      );
    } else {
      const perpX = (-dy / dist) * this._lateralSign;
      const perpY = (dx / dist)  * this._lateralSign;
      this.gameObject.body.setVelocity(perpX * KITE_SPEED * this.speedMult, perpY * KITE_SPEED * this.speedMult);
    }

    this._lateralFlip -= dt;
    if (this._lateralFlip <= 0) {
      this._lateralSign  *= -1;
      this._lateralFlip   = LATERAL_FLIP;
    }

    this._throwTimer -= dt;
    if (this._throwTimer <= 0) {
      this._throwAcorn(dx, dy, dist);
      this._throwTimer  = this.hp / this.maxHp <= 0.3 ? THROW_CD_RAGE : THROW_CD;
      this._throwFlash  = 0.2;
    }
  }

  _throwAcorn(dx, dy, dist) {
    const len  = dist > 0 ? dist : 1;
    const nx   = dx / len;
    const ny   = dy / len;
    const proj = this.scene.add.image(this.gameObject.x, this.gameObject.y, 'squirrel-acorn')
      .setDisplaySize(ACORN_SIZE, ACORN_SIZE)
      .setRotation(Math.atan2(ny, nx))
      .setDepth(8);
    this.scene.enemyManager.addEnemyProjectile(proj, SQUIRREL_DMG, nx * ACORN_SPEED, ny * ACORN_SPEED);
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this._throwFlash > 0) {
      key = 'squirrel-throw';
    } else if (this.state === 'idle') {
      key = 'squirrel-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `squirrel-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(SQUIRREL_DW, SQUIRREL_DH);
    }
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 21, SQUIRREL_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - SQUIRREL_DW / 2, y - 21, SQUIRREL_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 21);
    this._hpFill.setPosition(x - SQUIRREL_DW / 2, y - 21);
    this._hpFill.width = SQUIRREL_DW * Math.max(0, this.hp / this.maxHp);
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
