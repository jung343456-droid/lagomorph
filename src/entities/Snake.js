/**
 * 뱀 (Snake) — 잠복 기습 + 독 (구역 3, 동물)
 * HP 80 / 속도 140 / 데미지 18(물기) + 독 6dps×3.5s / 코어 5
 *
 * 패턴:
 *   lurk   → 저속 배회(풀숲 잠복). 140px 이내 진입 시 windup 전환
 *   windup → 0.3초 예고(정지, 대시 방향 고정)
 *   strike → 360px/s 직선 런지 0.35초. 물기 명중 시 플레이어 독 부여(applyPoison)
 *   retreat→ 0.4초 후퇴 후 lurk 복귀
 *   stun   → 피격 시 0.3초 경직 + 넉백 (이 시간 동안 추가 피격 무시 = i-frame)
 *
 * 독: 플레이어 측 DoT (Player.applyPoison) — 두꺼비 독 웅덩이와 별개 경로. 방어력 관통.
 * speedMult: Wolf 오라 등 공용 속도 배수 경유 (배회·후퇴에 적용, 런지 속도는 고정)
 */
const DETECT_R    = 140;
const LURK_SPEED  = 140;
const STRIKE_SPEED = 360;
const WINDUP_DUR  = 0.3;
const STRIKE_DUR  = 0.35;
const RETREAT_DUR = 0.4;
const BITE_R      = 28;   // 물기 명중 판정 반경 (독 부여)
const POISON_DPS  = 6;
const POISON_DUR  = 3.5;
const LURK_FLIP   = 1.6;  // 배회 방향 전환 주기 (s)
const SNAKE_W     = 22;
const SNAKE_H     = 16;
const SNAKE_DW    = 60;
const SNAKE_DH    = 60;

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

// 상태: lurk | windup | strike | retreat | stun
export default class Snake {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hp     = 80;
    this.maxHp  = 80;
    this.speed  = LURK_SPEED;
    this.damage = 18;
    this.displayName = '뱀';

    this.state      = 'lurk';
    this._prevState = 'lurk';
    this.stunTimer  = 0;
    this.attackCooldown = 0;

    this.alive     = true;
    this.destroyed = false;
    this.coreDrops = 5;
    this.speedMult = 1.0;

    this._stateTimer  = 0;
    this._lurkFlip    = LURK_FLIP * Math.random();
    this._lurkAngle   = Math.random() * Math.PI * 2;
    this._strikeVx    = 0;
    this._strikeVy    = 0;
    this._bitThisStrike = false;

    this._knockbackTimer    = 0;
    this._knockbackDuration = 0;
    this._knockbackVx = 0;
    this._knockbackVy = 0;

    this._lastDir = 's';
    this._curKey  = 'snake-s';

    this.gameObject = scene.add.image(x, y, 'snake-s').setDisplaySize(SNAKE_DW, SNAKE_DH);
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
      case 'lurk':
        this._updateLurk(dt);
        if (dist < DETECT_R) {
          const len = dist > 0 ? dist : 1;
          this._strikeVx = (dx / len) * STRIKE_SPEED;
          this._strikeVy = (dy / len) * STRIKE_SPEED;
          this.state = 'windup';
          this._stateTimer = WINDUP_DUR;
          this.gameObject.body.setVelocity(0, 0);
        }
        break;

      case 'windup':
        this.gameObject.body.setVelocity(0, 0);
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'strike';
          this._stateTimer = STRIKE_DUR;
          this._bitThisStrike = false;
        }
        break;

      case 'strike':
        this.gameObject.body.setVelocity(this._strikeVx, this._strikeVy);
        // 물기 — 근접 명중 시 1회 독 부여
        if (!this._bitThisStrike && dist < BITE_R) {
          this._bitThisStrike = true;
          player.applyPoison?.(POISON_DPS, POISON_DUR);
        }
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'retreat';
          this._stateTimer = RETREAT_DUR;
        }
        break;

      case 'retreat': {
        const len = dist > 0 ? dist : 1;
        this.gameObject.body.setVelocity(
          (-dx / len) * LURK_SPEED * this.speedMult,
          (-dy / len) * LURK_SPEED * this.speedMult,
        );
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) this.state = 'lurk';
        break;
      }

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
    // 런지 중 피격은 넉백·경직 면역(돌진 유지) — 그 외엔 경직
    if (this.state !== 'strike') {
      if (knockback) {
        const { dx, dy, force, duration } = knockback;
        this._knockbackTimer    = duration;
        this._knockbackDuration = duration;
        this._knockbackVx = dx * force;
        this._knockbackVy = dy * force;
      }
      this._prevState = (this.state === 'windup') ? 'lurk' : this.state;
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

  _updateLurk(dt) {
    this._lurkFlip -= dt;
    if (this._lurkFlip <= 0) {
      this._lurkFlip  = LURK_FLIP;
      this._lurkAngle = Math.random() * Math.PI * 2;
    }
    this.gameObject.body.setVelocity(
      Math.cos(this._lurkAngle) * LURK_SPEED * 0.5 * this.speedMult,
      Math.sin(this._lurkAngle) * LURK_SPEED * 0.5 * this.speedMult,
    );
  }

  _updateSprite() {
    if (this.state === 'stun') return;
    // 액션 상태도 전용 스프라이트 없이 이동 방향 스프라이트를 그대로 사용한다.
    const dir = calcDir(this.gameObject.body.velocity.x, this.gameObject.body.velocity.y);
    if (dir) this._lastDir = dir;
    const key = `snake-${this._lastDir}`;
    if (this._curKey !== key) {
      this._curKey = key;
      this.gameObject.setTexture(key).setDisplaySize(SNAKE_DW, SNAKE_DH);
      this._applyBodySize();
    }
  }

  _applyBodySize() {
    const sx = this.gameObject.scaleX || 1;
    const sy = this.gameObject.scaleY || 1;
    this.gameObject.body.setSize(SNAKE_W / sx, SNAKE_H / sy, true);
  }

  _buildHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg   = this.scene.add.rectangle(x, y - 35, SNAKE_DW, 3, 0x333333).setDepth(11);
    this._hpFill = this.scene.add.rectangle(x - SNAKE_DW / 2, y - 35, SNAKE_DW, 3, 0x44dd44)
      .setOrigin(0, 0.5).setDepth(11);
  }

  _syncHpBar() {
    const { x, y } = this.gameObject;
    this._hpBg.setPosition(x, y - 18);
    this._hpFill.setPosition(x - SNAKE_DW / 2, y - 18);
    this._hpFill.width = SNAKE_DW * Math.max(0, this.hp / this.maxHp);
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
