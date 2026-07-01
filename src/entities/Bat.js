/**
 * 박쥐 (Bat) — 공중 군집 정찰병 (구역 2)
 * HP 16 / 속도 176 / 데미지 6 / 코어 드롭 1
 * 스폰: 3마리 묶음 (들쥐와 동일)
 *
 * 패턴:
 *   idle    → orbit(499px 이내 탐지)
 *   orbit   → 140~180px 거리에서 좌우 흔들리며 선회 (직진하지 않음)
 *   swoop   → 쿨다운 4초(개체별 분산)마다: 0.25초 공중 정지 예고 → 발사 순간 조준,
 *             330px/s 직선 강하 — 플레이어 위치 + 관통 50px 까지 도달 (상한 1.0s, 벽 충돌 시 조기 종료)
 *   recover → 0.45초 정지 후 orbit 복귀
 *   stun    → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 시각: 어두운 보라 틴트 (placeholder: rat 스프라이트 재사용)
 * speedMult: Wolf 오라(180px 이내) 적용 시 ×1.2
 */
const DETECT_R     = 499;
const PREFER_DIST  = 160;  // 선회 반경 — swoop 사거리와 연동 (기존 220은 swoop 미도달 거리였음)
const ORBIT_SPEED  = 176;
const SWOOP_SPEED  = 330;
const SWOOP_WINDUP = 0.25; // 강하 직전 정지 예고 — 조준은 발사 순간 (비행 중 옆으로 피하면 빗나감)
const SWOOP_OVERSHOOT = 50; // 플레이어 위치를 지나쳐 직진하는 관통 거리
const SWOOP_DUR_MAX = 1.0; // 강하 시간 상한 (거리 기반 동적 계산의 안전 캡)
const RECOVER_DUR  = 0.45;
const SWOOP_CD     = 4.0;
const ORBIT_FLIP   = 1.2;
const BAT_W        = 14;
const BAT_H        = 12;
const BAT_DW       = 28;
const BAT_DH       = 22;
const TINT         = 0x6655aa;

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

// 상태: idle | orbit | swoop_windup | swoop | recover | stun
export default class Bat {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 16;
    this.maxHp  = 16;
    this.speed  = ORBIT_SPEED;
    this.damage = 6;
    this.displayName = '박쥐';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 1;
    this.speedMult = 1.0;

    this._stateTimer  = 0;
    this._swoopCd     = SWOOP_CD * (0.6 + Math.random() * 0.6); // 묶음 동기화 방지
    this._lateralSign = Math.random() < 0.5 ? 1 : -1;
    this._lateralFlip = ORBIT_FLIP;
    this._swoopVx = 0;
    this._swoopVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'bat-idle';

    this.gameObject = scene.add.image(x, y, 'bat-idle').setDisplaySize(BAT_DW, BAT_DH);
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
        if (dist < DETECT_R) this.state = 'orbit';
        break;

      case 'orbit': {
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        this._orbitMove(dx, dy, dist, dt);
        this._swoopCd -= dt;
        if (this._swoopCd <= 0) {
          this.state = 'swoop_windup';
          this._stateTimer = SWOOP_WINDUP;
        }
        break;
      }

      case 'swoop_windup': // 공중 정지 예고 — 발사 순간 조준
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this._launchSwoop(dx, dy, dist);
        break;

      case 'swoop':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(this._swoopVx, this._swoopVy);
        if (this._stateTimer <= 0 || !this.gameObject.body.blocked.none) {
          this.state = 'recover';
          this._stateTimer = RECOVER_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'recover':
        this._stateTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._stateTimer <= 0) {
          this._swoopCd = SWOOP_CD * (0.8 + Math.random() * 0.4);
          this.state = dist < DETECT_R ? 'orbit' : 'idle';
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

  takeDamage(amount, knockback = null, opts = {}) {
    if (!this.alive || this.state === 'stun') return false;
    this.hp -= amount;
    if (this.hp <= 0) { this._die(); return true; }
    if (!opts.noStagger) {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'swoop' || this.state === 'swoop_windup') ? 'orbit' : this.state;
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

  _orbitMove(dx, dy, dist, dt) {
    const len = dist > 0 ? dist : 1;
    let vx = 0, vy = 0;
    if (dist < PREFER_DIST - 20) {
      vx = -dx / len * ORBIT_SPEED * 0.7;
      vy = -dy / len * ORBIT_SPEED * 0.7;
    } else if (dist > PREFER_DIST + 20) {
      vx = dx / len * ORBIT_SPEED * 0.7;
      vy = dy / len * ORBIT_SPEED * 0.7;
    }
    // 횡이동 컴포넌트 (선회)
    const perpX = (-dy / len) * this._lateralSign;
    const perpY = (dx  / len) * this._lateralSign;
    vx += perpX * ORBIT_SPEED;
    vy += perpY * ORBIT_SPEED;

    this.gameObject.body.setVelocity(vx * this.speedMult, vy * this.speedMult);

    this._lateralFlip -= dt;
    if (this._lateralFlip <= 0) {
      this._lateralSign *= -1;
      this._lateralFlip  = ORBIT_FLIP;
    }
  }

  /** 발사 순간 조준 — 거리 + 관통분을 끝까지 도달하는 동적 강하 시간 (기존 고정 0.4s 는 220px 선회 거리 미도달) */
  _launchSwoop(dx, dy, dist) {
    const len = dist > 0 ? dist : 1;
    this._swoopVx = (dx / len) * SWOOP_SPEED;
    this._swoopVy = (dy / len) * SWOOP_SPEED;
    this.state = 'swoop';
    this._stateTimer = Math.min(SWOOP_DUR_MAX, (dist + SWOOP_OVERSHOOT) / SWOOP_SPEED);
    const dir = calcDir(this._swoopVx, this._swoopVy);
    if (dir) this._lastDir = dir;
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'swoop' || this.state === 'swoop_windup') {
      key = 'bat-swoop';
    } else if (this.state === 'idle' || this.state === 'recover') {
      key = 'bat-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `bat-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(BAT_DW, BAT_DH);
      this._applyBodySize();
      this.gameObject.setTint(TINT);
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(BAT_W / sx, BAT_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 16, BAT_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - BAT_DW / 2, y - 16, BAT_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 16);
    this._hpFill.setPosition(x - BAT_DW / 2, y - 16);
    this._hpFill.width = BAT_DW * Math.max(0, this.hp / this.maxHp);
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
      duration: 260, ease: 'Quad.Out',
      onComplete: () => { this.gameObject.destroy(); this.destroyed = true; },
    });
  }
}
