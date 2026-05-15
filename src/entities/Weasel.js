/**
 * 족제비 (Weasel) — 기습형
 * HP 22 / 속도 160→280 / 데미지 12 / 코어 드롭 2
 *
 * 패턴:
 *   idle     → approach(220px 이내 탐지)
 *   approach → 160px/s로 접근, 70px 이내 진입 시 대시 방향 고정 → dash
 *   dash     → 280px/s 직선 돌진 0.4초 (방향 고정)
 *   cooldown → 0.8초 대기 (HP 20% 이하: 0.4초) → approach 반복
 *   stun     → 피격 시 0.5초 경직 + 넉백
 *
 * 시각: 대시 중 색상이 밝은 노랑(0xffdd88)으로 변함
 */
const DETECT_R       = 220;      // 플레이어 탐지 반경 (px)
const APPROACH_DIST  = 70;       // 대시 전환 거리: 이 이하면 대시 시작 (px)
const APPROACH_SPEED = 160;      // 접근 이동 속도 (px/s)
const DASH_SPEED     = 280;      // 대시 속도 (px/s)
const DASH_DUR       = 0.4;      // 대시 지속 시간 (초)
const COOL_DUR       = 0.8;      // 대시 후 쿨다운 (초)
const COOL_DUR_RAGE  = 0.4;      // 분노 상태(HP 20% 이하) 쿨다운 (초)
const WEASEL_W       = 16;       // 스프라이트 너비 (px)
const WEASEL_H       = 26;       // 스프라이트 높이 (px)
const WEASEL_COLOR   = 0xccaa55; // 기본 색상 (황갈색)
const DASH_COLOR     = 0xffdd88; // 대시 중 색상 (밝은 노랑)
const HIT_COLOR      = 0xffffff; // 피격 깜빡임 색상 (흰색)

// 상태: idle | approach | dash | cooldown | stun
export default class Weasel {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 22;
    this.maxHp  = 22;
    this.speed  = APPROACH_SPEED;
    this.damage = 12;

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 2;

    this._dashTimer     = 0;
    this._cooldownTimer = 0;
    this._dashVx = 0;
    this._dashVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this.gameObject = scene.add.rectangle(x, y, WEASEL_W, WEASEL_H, WEASEL_COLOR);
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
          this.gameObject.setFillStyle(DASH_COLOR);
        } else {
          this._moveTo(dx, dy, dist, APPROACH_SPEED);
        }
        break;

      case 'dash':
        this._dashTimer -= dt;
        this.gameObject.body.setVelocity(this._dashVx, this._dashVy);
        if (this._dashTimer <= 0) {
          this._cooldownTimer = this.hp / this.maxHp <= 0.2 ? COOL_DUR_RAGE : COOL_DUR;
          this.state = 'cooldown';
          this.gameObject.body.setVelocity(0, 0);
          this.gameObject.setFillStyle(WEASEL_COLOR);
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
          this.gameObject.setFillStyle(WEASEL_COLOR);
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

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 22, WEASEL_W, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - WEASEL_W / 2, y - 22, WEASEL_W, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 22);
    this._hpFill.setPosition(x - WEASEL_W / 2, y - 22);
    this._hpFill.width = WEASEL_W * Math.max(0, this.hp / this.maxHp);
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
        this.gameObject.setFillStyle(flip % 2 === 0 ? HIT_COLOR : WEASEL_COLOR);
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
