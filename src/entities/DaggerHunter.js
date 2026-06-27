/**
 * 단검 사냥꾼 (DaggerHunter) — 근접 연타 추격형 (구역 3, 인간)
 * HP 160 / 속도 185 / 데미지 24(베기 접촉) / 코어 7
 *
 * 패턴:
 *   idle   → chase(340px 이내 탐지)
 *   chase  → 플레이어 추격. 60px 이내 진입 시 베기 방향 고정 → windup
 *   windup → 0.35초 예고(정지)
 *   slash  → 370px/s 전진 베기 0.25초(방향 고정, 접촉 데미지)
 *   recover→ 0.45초 경직(약점 노출) → chase 복귀
 *   stun   → 피격 시 0.3초 경직 + 넉백 (i-frame)
 *
 * 분노(HP 30% 이하): recover 0.25초, 추격 속도 ×1.15
 * speedMult: Wolf 오라·구역 강화·까마귀 표식 등 공용 속도 배수 경유 (추격에 적용, 베기 속도는 고정)
 */
const DETECT_R     = 340;
const CHASE_SPEED  = 185;
const SLASH_RANGE  = 60;
const SLASH_SPEED  = 370;
const WINDUP_DUR   = 0.35;
const SLASH_DUR    = 0.25;
const RECOVER_DUR  = 0.45;
const RECOVER_RAGE = 0.25;
const RAGE_SPD     = 1.15;
const DH_W         = 24;
const DH_H         = 40;
const DH_DW        = 60;
const DH_DH        = 60;

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

// 상태: idle | chase | windup | slash | recover | stun
export default class DaggerHunter {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 160;
    this.maxHp  = 160;
    this.speed  = CHASE_SPEED;
    this.damage = 24;
    this.displayName = '단검 사냥꾼';

    this.state      = 'idle';
    this._prevState = 'idle';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 7;
    this.speedMult = 1.0;

    this._stateTimer = 0;
    this._slashVx = 0;
    this._slashVy = 0;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'daggerhunter-s';

    this.gameObject = scene.add.image(x, y, 'daggerhunter-s').setDisplaySize(DH_DW, DH_DH);
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
    const rage = this.hp / this.maxHp <= 0.3;

    const dx   = player.x - this.gameObject.x;
    const dy   = player.y - this.gameObject.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'idle':
        this.gameObject.body.setVelocity(0, 0);
        if (dist < DETECT_R) this.state = 'chase';
        break;

      case 'chase': {
        if (dist >= DETECT_R) { this.state = 'idle'; break; }
        if (dist <= SLASH_RANGE) {
          const len = dist > 0 ? dist : 1;
          this._slashVx = (dx / len) * SLASH_SPEED;
          this._slashVy = (dy / len) * SLASH_SPEED;
          this.state = 'windup';
          this._stateTimer = WINDUP_DUR;
          this.gameObject.body.setVelocity(0, 0);
          break;
        }
        const spd = CHASE_SPEED * this.speedMult * (rage ? RAGE_SPD : 1);
        this._moveTo(dx, dy, dist, spd);
        break;
      }

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'slash';
          this._stateTimer = SLASH_DUR;
        }
        break;

      case 'slash':
        this.gameObject.body.setVelocity(this._slashVx, this._slashVy);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'recover';
          this._stateTimer = rage ? RECOVER_RAGE : RECOVER_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'recover':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = dist < DETECT_R ? 'chase' : 'idle';
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
    // 베기 돌진 중엔 넉백·경직 면역
    if (this.state !== 'slash') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup') ? 'chase' : this.state;
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

  _moveTo(dx, dy, dist, speed) {
    if (dist < 1) { this.gameObject.body.setVelocity(0, 0); return; }
    this.gameObject.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `daggerhunter-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(DH_DW, DH_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(DH_W / sx, DH_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, DH_DW, 4, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - DH_DW / 2, y - 35, DH_DW, 4, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 32);
    this._hpFill.setPosition(x - DH_DW / 2, y - 32);
    this._hpFill.width = DH_DW * Math.max(0, this.hp / this.maxHp);
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
