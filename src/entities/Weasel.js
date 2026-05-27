/**
 * 족제비 (Weasel) — 기습형
 * HP 22 / 속도 160→280 / 데미지 9 / 코어 드롭 2
 *
 * 패턴:
 *   idle     → approach(220px 이내 탐지)
 *   approach → 160px/s로 접근, 70px 이내 진입 시 대시 방향 고정 → dash
 *   dash     → 280px/s 직선 돌진 0.4초 (방향 고정)
 *   cooldown → 0.8초 대기 (HP 20% 이하: 0.4초) → approach 반복
 *   stun     → 피격 시 0.3초 경직 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 시각: 대시 중 weasel-dash 스프라이트 표시
 * speedMult: Wolf 오라(180px 이내) 적용 시 접근·후퇴 속도 ×1.2 (대시 속도는 고정)
 */
const DETECT_R       = 220;
const APPROACH_DIST  = 70;
const APPROACH_SPEED = 160;
const DASH_SPEED     = 280;
const DASH_DUR       = 0.4;
const COOL_DUR       = 0.8;
const COOL_DUR_RAGE  = 0.4;
const WEASEL_W       = 14;   // 물리 body 크기 (이전 16에서 15% 축소)
const WEASEL_H       = 20;
const WEASEL_DW      = 24;   // 표시 크기 (이전 28×44에서 15% 축소)
const WEASEL_DH      = 37;

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

// 상태: idle | approach | dash | cooldown | stun
export default class Weasel {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 22;
    this.displayName = '족제비';
    this.maxHp  = 22;
    this.speed  = APPROACH_SPEED;
    this.damage = 9;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 2;
    this.speedMult = 1.0;

    this._dashTimer     = 0;
    this._cooldownTimer = 0;
    this._dashVx = 0;
    this._dashVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'weasel-idle';

    this.gameObject = scene.add.image(x, y, 'weasel-idle').setDisplaySize(WEASEL_DW, WEASEL_DH);
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
        if (dist < DETECT_R) this.state = 'approach';
        break;

      case 'approach':
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        if (dist <= APPROACH_DIST) {
          const len    = dist > 0 ? dist : 1;
          this._dashVx = (dx / len) * DASH_SPEED;
          this._dashVy = (dy / len) * DASH_SPEED;
          this._dashTimer = DASH_DUR;
          this.state = 'dash';
        } else {
          this._moveTo(dx, dy, dist, APPROACH_SPEED * this.speedMult);
        }
        break;

      case 'dash':
        this._dashTimer -= dt;
        this.gameObject.body.setVelocity(this._dashVx, this._dashVy);
        if (this._dashTimer <= 0) {
          this._cooldownTimer = this.hp / this.maxHp <= 0.2 ? COOL_DUR_RAGE : COOL_DUR;
          this.state = 'cooldown';
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'cooldown':
        this._cooldownTimer -= dt;
        this.gameObject.body.setVelocity(0, 0);
        if (this._cooldownTimer <= 0) this.state = dist < DETECT_R ? 'approach' : 'idle';
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
    let key;
    if (this.state === 'dash') {
      key = 'weasel-dash';
    } else if (this.state === 'idle' || this.state === 'cooldown') {
      key = 'weasel-idle';
    } else {
      const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
      if (dir) this._lastDir = dir;
      key = `weasel-${this._lastDir}`;
    }
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(WEASEL_DW, WEASEL_DH);
      this._applyBodySize();
    }
  }

  // body.setSize 는 source 픽셀이라 setDisplaySize 로 확대된 작은 텍스처 위에선 body 가 부풀려진다.
  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(WEASEL_W / sx, WEASEL_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 27, WEASEL_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - WEASEL_DW / 2, y - 27, WEASEL_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 27);
    this._hpFill.setPosition(x - WEASEL_DW / 2, y - 27);
    this._hpFill.width = WEASEL_DW * Math.max(0, this.hp / this.maxHp);
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
