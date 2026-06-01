/**
 * 들쥐 (Rat) — 돌진형 군집
 * HP 19 / 속도 226 / 데미지 5 / 코어 드롭 1
 * 스폰: 3마리 묶음 (120° 간격, 18px 반경 분산)
 *
 * 패턴:
 *   idle     → rush(358px 이내 탐지, 플레이어 위치로 방향 고정 후 돌진)
 *   rush     → 1.2초간 직선 돌진 (도중 방향 보정 없음)
 *   cooldown → 0.3초 정지 후 재조준 → rush 반복
 *   stun     → 피격 시 0.3초 경직 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * speedMult: Wolf 오라(180px 이내) 적용 시 이동속도 ×1.2
 */
const DETECT_R   = 358;
const RUSH_SPEED = 226;
const RUSH_DUR   = 1.2;
const COOL_DUR   = 0.3;
const RAT_W      = 14;   // 물리 body 크기 (canvas 20×14 비율 반영)
const RAT_H      = 10;
const RAT_DW     = 26;   // 표시 크기 (canvas 20:14 비율 유지)
const RAT_DH     = 18;

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

// 상태: idle | rush | cooldown | stun
export default class Rat {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 19;
    this.maxHp  = 19;
    this.speed  = RUSH_SPEED;
    this.damage = 5;
    this.displayName = '쥐';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 1;
    this.speedMult = 1.0;

    this._rushDir    = { x: 0, y: 0 };
    this._stateTimer = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'rat-idle';

    this.gameObject = scene.add.image(x, y, 'rat-idle').setDisplaySize(RAT_DW, RAT_DH);
    scene.physics.add.existing(this.gameObject);
    this._applyBodySize();
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
          this._rushDir.x * RUSH_SPEED * this.speedMult,
          this._rushDir.y * RUSH_SPEED * this.speedMult,
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

  _startRush(dx, dy, dist) {
    const len       = dist > 0 ? dist : 1;
    this._rushDir.x = dx / len;
    this._rushDir.y = dy / len;
    this.state       = 'rush';
    this._stateTimer = RUSH_DUR;
    // 돌진 방향을 즉시 lastDir에 반영
    const dir = calcDir(this._rushDir.x * 10, this._rushDir.y * 10);
    if (dir) this._lastDir = dir;
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    let key;
    if (this.state === 'idle' || this.state === 'cooldown') {
      key = 'rat-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `rat-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(RAT_DW, RAT_DH);
      this._applyBodySize();
    }
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(RAT_W / sx, RAT_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 14, RAT_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - RAT_DW / 2, y - 14, RAT_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 14);
    this._hpFill.setPosition(x - RAT_DW / 2, y - 14);
    this._hpFill.width = RAT_DW * Math.max(0, this.hp / this.maxHp);
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
